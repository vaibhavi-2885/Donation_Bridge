const Donation = require('../models/Donation');
const NGORequest = require('../models/NGORequest');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const DeliveryRun = require('../models/DeliveryRun');
const { normalizeRole, isDeliveryPartnerRole } = require('../utils/roles');
const { logActivity } = require('../utils/activityLogger');
const { createNotification } = require('../utils/notify');
const { recommendPartners } = require('../utils/matchingEngine');

const DEFAULT_COORDINATES = [75.7139, 19.7515];
const MAHARASHTRA_BOUNDS = {
    minLat: 15.6,
    maxLat: 22.1,
    minLng: 72.6,
    maxLng: 80.9
};

const emitDonationUpdate = async (req, donation, message) => {
    const io = req.app.get('socketio');
    if (!io || !donation) {
        return;
    }

    const populatedDonation = await Donation.findById(donation._id)
        .populate('donor', 'name email mobile role photo')
        .populate('claimedBy', 'name email mobile role organizationName address location')
        .populate('assignedPartner', 'name email mobile role photo vehicleType location')
        .populate('matchedRequest', 'title category quantityNeeded unit urgency deliveryAddress location');

    const trackedDonation = attachLiveTracking(populatedDonation?.toObject ? populatedDonation.toObject() : populatedDonation);

    [trackedDonation?.donor?._id, trackedDonation?.claimedBy?._id, trackedDonation?.assignedPartner?._id]
        .filter(Boolean)
        .forEach((userId) => {
            io.to(String(userId)).emit('donation_status_update', {
                message,
                donation: trackedDonation
            });
        });

    io.emit('admin_activity', {
        message,
        donation: trackedDonation
    });
};

const getSystemConfig = async () => {
    const config = await SystemConfig.findOne({ key: 'global' });
    if (config) {
        return config;
    }

    return SystemConfig.create({ key: 'global' });
};

const calculateSpoilAt = (cookedTime, freshnessHours) => {
    if (!cookedTime) {
        return null;
    }

    const cookedDate = new Date(cookedTime);
    if (Number.isNaN(cookedDate.getTime())) {
        return null;
    }

    return new Date(cookedDate.getTime() + freshnessHours * 60 * 60 * 1000);
};

const ensureFoodExpiryStatus = (donation) => {
    if (donation.status === 'Delivered' || donation.status === 'Cancelled') {
        return donation.status;
    }

    if (donation.spoilAt && donation.spoilAt < new Date()) {
        donation.status = 'Expired';
    }

    return donation.status;
};

const isWithinPartnerSchedule = (user) => {
    if (!user) return true;
    if (user.availabilityStatus && user.availabilityStatus !== 'available') {
        return false;
    }

    const now = new Date();
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
    if (Array.isArray(user.workingDays) && user.workingDays.length && !user.workingDays.includes(day)) {
        return false;
    }

    if (user.shiftStart && user.shiftEnd) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [startHour, startMinute] = user.shiftStart.split(':').map(Number);
        const [endHour, endMinute] = user.shiftEnd.split(':').map(Number);
        const startMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;
        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
            return false;
        }
    }

    return true;
};

const isWithinMaharashtra = (coordinates = []) => {
    if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
    const [lng, lat] = coordinates;
    return lat >= MAHARASHTRA_BOUNDS.minLat &&
        lat <= MAHARASHTRA_BOUNDS.maxLat &&
        lng >= MAHARASHTRA_BOUNDS.minLng &&
        lng <= MAHARASHTRA_BOUNDS.maxLng;
};

const looksLikeRealAddress = (value = '') => {
    const normalized = String(value).trim();
    return normalized.length >= 12 &&
        /\d/.test(normalized) &&
        /[a-zA-Z]/.test(normalized) &&
        /,/.test(normalized);
};

const extractPincode = (value = '') => {
    const match = String(value).match(/\b\d{6}\b/);
    return match ? match[0] : '';
};

const extractCityLike = (value = '') => {
    const lower = String(value).toLowerCase();
    if (lower.includes('dhule')) return 'dhule';
    if (lower.includes('nashik')) return 'nashik';
    if (lower.includes('pune')) return 'pune';
    if (lower.includes('mumbai')) return 'mumbai';
    if (lower.includes('nagpur')) return 'nagpur';
    return '';
};

const deriveAddressDistanceKm = (addressA = '', addressB = '', computedDistanceKm = null) => {
    const pinA = extractPincode(addressA);
    const pinB = extractPincode(addressB);
    const cityA = extractCityLike(addressA);
    const cityB = extractCityLike(addressB);

    if (pinA && pinB && pinA === pinB && (computedDistanceKm === null || computedDistanceKm > 20)) {
        return 2.5;
    }

    if (cityA && cityB && cityA === cityB && (computedDistanceKm === null || computedDistanceKm > 30)) {
        return 6;
    }

    return computedDistanceKm;
};

const interpolatePoint = (start = [], end = [], progress = 0) => {
    if (start.length !== 2 || end.length !== 2) return [];
    const [startLng, startLat] = start;
    const [endLng, endLat] = end;
    return [
        Number((startLng + (endLng - startLng) * progress).toFixed(6)),
        Number((startLat + (endLat - startLat) * progress).toFixed(6))
    ];
};

const getTrackingProgress = (status) => {
    if (status === 'Assigned') return 0.12;
    if (status === 'Picked Up') return 0.35;
    if (status === 'In Transit') return 0.7;
    if (status === 'Delivered') return 1;
    return 0;
};

const attachLiveTracking = (donationLike) => {
    if (!donationLike) return donationLike;
    const pickupCoordinates = donationLike.location?.coordinates || [];
    const dropCoordinates = donationLike.matchedRequest?.location?.coordinates ||
        donationLike.claimedBy?.location?.coordinates || [];
    const progress = getTrackingProgress(donationLike.status);
    const liveCoordinates = interpolatePoint(pickupCoordinates, dropCoordinates, progress);
    return {
        ...donationLike,
        liveTracking: {
            progress,
            pickupCoordinates,
            dropCoordinates,
            currentCoordinates: liveCoordinates,
            deliveryAddress: donationLike.matchedRequest?.deliveryAddress ||
                donationLike.claimedBy?.address ||
                ''
        }
    };
};

const getDistanceKm = (pointA = [], pointB = []) => {
    if (pointA.length !== 2 || pointB.length !== 2) return null;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const [lng1, lat1] = pointA;
    const [lng2, lat2] = pointB;
    const earthRadiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((earthRadiusKm * c).toFixed(1));
};

const buildAssignmentForRequest = async ({ req, donation, ngoRequest, actorName, actorId }) => {
    donation.claimedBy = ngoRequest.ngo;
    donation.matchedRequest = ngoRequest._id;
    donation.adminManaged = true;
    donation.status = 'Claimed';

    const ngo = await User.findById(ngoRequest.ngo);
    const config = await getSystemConfig();
    const partnerPool = await User.find({ role: 'delivery_partner', isBlocked: false });
    const recommendations = await recommendPartners({ donation, partners: partnerPool, config });
    const bestPartner = recommendations.find((item) => item.eligible)?.partner || null;

    if (bestPartner) {
        donation.assignedPartner = bestPartner._id;
        donation.status = 'Assigned';
    }

    await donation.save();

    ngoRequest.matchedDonations = Array.from(new Set([
        ...ngoRequest.matchedDonations.map((item) => String(item)),
        String(donation._id)
    ]));
    ngoRequest.assignedDonation = donation._id;
    ngoRequest.assignedByAdmin = actorId || null;
    ngoRequest.adminReviewStatus = bestPartner ? 'Approved' : 'Matched';
    ngoRequest.fulfillmentStatus = 'Matched';
    ngoRequest.status = bestPartner ? 'Matched' : 'Open';
    await ngoRequest.save();

    const deliveryRun = await DeliveryRun.findOneAndUpdate(
        { donation: donation._id },
        {
            donation: donation._id,
            donor: donation.donor,
            ngo: ngoRequest.ngo,
            ngoRequest: ngoRequest._id,
            partner: bestPartner?._id || null,
            status: bestPartner ? 'Assigned' : 'Scheduled',
            pickupWindowStart: donation.pickupWindowStart || null,
            pickupWindowEnd: donation.pickupWindowEnd || null,
            $push: {
                interventionNotes: {
                    note: `Donation matched to NGO request by ${actorName || 'Admin'}.`,
                    createdBy: actorName || 'Admin'
                }
            }
        },
        { upsert: true, new: true }
    );

    await createNotification(req, {
        users: [donation.donor, ngoRequest.ngo, bestPartner?._id].filter(Boolean),
        title: 'Admin Fulfillment Match Created',
        message: `${donation.item} has been matched to an NGO request through the admin orchestration workflow.`,
        type: 'assignment',
        severity: 'warning',
        channels: ['in_app', 'email'],
        link: bestPartner ? '/delivery-dashboard?view=tasks' : '/ngo-dashboard?view=requests'
    });

    await emitDonationUpdate(req, donation, 'Admin matched a donor resource to an NGO need.');

    return {
        deliveryRun,
        recommendations: recommendations.slice(0, 5).map((item) => ({
            partnerId: item.partner._id,
            name: item.partner.name,
            vehicleType: item.partner.vehicleType,
            distanceKm: item.distanceKm,
            capacityLeft: item.capacityLeft,
            score: item.score,
            eligible: item.eligible
        }))
    };
};

exports.createDonation = async (req, res) => {
    try {
        const {
            item,
            category,
            quantityValue,
            unit,
            image,
            address,
            expiryDate,
            cookedTime,
            coordinates,
            description,
            batchNumber,
            extractedText,
            pickupWindowStart,
            pickupWindowEnd,
            vehiclePreference,
            qualityAssessment
        } = req.body;

        if (!item || !category || !image) {
            return res.status(400).json({ success: false, message: 'Item, category, and image are required.' });
        }

        if (!looksLikeRealAddress(address)) {
            return res.status(400).json({ success: false, message: 'Please select a valid pickup address from the map or address search.' });
        }

        if (category === 'Medicine' && Boolean(req.body.isExpired)) {
            return res.status(400).json({ success: false, message: 'Expired medicines cannot be posted to Resource Network.' });
        }

        const config = await getSystemConfig();
        const locationCoordinates = Array.isArray(coordinates) && coordinates.length === 2 ? coordinates : DEFAULT_COORDINATES;
        if (!isWithinMaharashtra(locationCoordinates)) {
            return res.status(400).json({ success: false, message: 'Resource Network currently supports verified addresses within Maharashtra only.' });
        }
        if (Number(qualityAssessment?.score || 0) < 45) {
            return res.status(400).json({ success: false, message: 'Image quality or item condition is too poor. Please upload a clearer and truthful image.' });
        }
        const spoilAt = category === 'Food' ? calculateSpoilAt(cookedTime, config.freshnessHours) : null;

        const newDonation = await Donation.create({
            donor: req.user.id,
            item,
            category,
            quantityValue: Number(quantityValue) || 0,
            unit: unit || 'units',
            image,
            description: description || '',
            expiryDate: expiryDate || '',
            cookedTime: cookedTime || '',
            spoilAt,
            batchNumber: batchNumber || '',
            medicineVerification: {
                extractedText: extractedText || '',
                isExpired: Boolean(req.body.isExpired)
            },
            qualityAssessment: {
                score: Number(qualityAssessment?.score || 0),
                verdict: qualityAssessment?.verdict || 'pending-review',
                notes: qualityAssessment?.notes || ''
            },
            pickupWindowStart: pickupWindowStart || null,
            pickupWindowEnd: pickupWindowEnd || null,
            vehiclePreference: vehiclePreference || '',
            status: 'Available',
            publicAddressHint: address ? `${address.split(',')[0]}, area hidden until assignment` : 'Pickup area shared after assignment',
            location: {
                type: 'Point',
                coordinates: locationCoordinates,
                address: address || 'Location pinned on map'
            }
        });

        const donor = await User.findById(req.user.id);
        if (donor) {
            donor.impactPoints += 2;
            await donor.save();
        }

        await logActivity({
            recipient: donor?.email || String(req.user.id),
            trigger: 'Donation Created',
            message: `${item} posted in ${category}`,
            metadata: { donationId: newDonation._id, donorId: req.user.id }
        });

        await createNotification(req, {
            users: [req.user.id],
            title: 'Donation Posted',
            message: `${item} is now live in Resource Network and visible to nearby NGOs.`,
            type: 'donation',
            link: '/donor-dashboard'
        });

        await emitDonationUpdate(req, newDonation, 'A new donation is now live in Resource Network.');

        res.status(201).json({ success: true, data: newDonation });
    } catch (error) {
        console.error('Donation creation error:', error.message);
        res.status(500).json({ success: false, message: 'Database error: ' + error.message });
    }
};

exports.getMyActivity = async (req, res) => {
    try {
        const donations = await Donation.find({ donor: req.user.id })
            .populate('assignedPartner', 'name photo mobile role isVerified vehicleType availabilityStatus location')
            .populate('claimedBy', 'name organizationName address location')
            .populate('matchedRequest', 'title quantityNeeded unit urgency deliveryAddress location')
            .sort({ createdAt: -1 });

        donations.forEach(ensureFoodExpiryStatus);
        await Promise.all(donations.filter((donation) => donation.isModified()).map((donation) => donation.save()));

        const user = await User.findById(req.user.id);
        const deliveredDonations = donations.filter((donation) => donation.status === 'Delivered');
        const totalWeight = donations.reduce((acc, curr) => acc + (Number(curr.quantityValue) || 0), 0);

        const rewards = [];
        if (deliveredDonations.length >= 1) {
            rewards.push({
                title: 'Verified First Delivery',
                description: 'Your first resource reached a verified NGO with proof-backed delivery.',
                code: 'RN-FIRST-DELIVERY'
            });
        }
        if (deliveredDonations.length >= 3) {
            rewards.push({
                title: 'Impact Reward Coupon',
                description: 'Unlocked after three successful delivered donations.',
                code: 'RN-IMPACT-003'
            });
        }
        if (deliveredDonations.length >= 5) {
            rewards.push({
                title: 'Silver Donor Badge',
                description: 'Awarded for consistent fulfilled donations across the network.',
                code: 'RN-SILVER-DONOR'
            });
        }
        if (deliveredDonations.length >= 10) {
            rewards.push({
                title: 'Gold Donor Badge',
                description: 'Recognizes high-trust community contribution and verified fulfillment.',
                code: 'RN-GOLD-DONOR'
            });
        }

        res.status(200).json({
            success: true,
            donations: donations.map((donation) => attachLiveTracking(donation.toObject())),
            stats: {
                totalDonations: donations.length,
                livesTouched: deliveredDonations.length,
                totalImpactUnits: totalWeight,
                impactPoints: user ? user.impactPoints : 0,
                rewardsUnlocked: rewards
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database error: ' + error.message });
    }
};

exports.getPublicDonations = async (req, res) => {
    try {
        const donations = await Donation.find({ status: { $in: ['Available', 'Claimed', 'Assigned', 'Picked Up', 'In Transit'] } })
            .populate('donor', 'name')
            .lean();

        const blurredDonations = donations
            .filter((donation) => {
                if (donation.spoilAt && new Date(donation.spoilAt) < new Date()) {
                    return false;
                }
                return true;
            })
            .map((donation) => ({
                ...donation,
                location: {
                    type: 'Point',
                    address: donation.publicAddressHint || 'Approximate pickup area',
                    coordinates: [
                        donation.location.coordinates[0] + (Math.random() - 0.5) * 0.01,
                        donation.location.coordinates[1] + (Math.random() - 0.5) * 0.01
                    ]
                }
            }));

        res.status(200).json(blurredDonations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMarketplace = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const config = await getSystemConfig();
        const radiusInMeters = Number(req.query.radiusKm || config.matchingRadiusKm) * 1000;

        let query = { status: 'Available' };
        if (user?.location?.coordinates?.length === 2) {
            query = {
                ...query,
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: user.location.coordinates
                        },
                        $maxDistance: radiusInMeters
                    }
                }
            };
        }

        const donations = await Donation.find(query)
            .populate('donor', 'name')
            .sort({ createdAt: -1 })
            .lean();

        const payload = donations
            .filter((donation) => !donation.spoilAt || new Date(donation.spoilAt) > new Date())
            .map((donation) => ({
                ...donation,
                location: {
                    ...donation.location,
                    address: donation.publicAddressHint || 'Approximate pickup area'
                }
            }));

        res.status(200).json({ success: true, data: payload });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.claimDonation = async (req, res) => {
    try {
        const donation = await Donation.findById(req.params.id);
        if (!donation) {
            return res.status(404).json({ message: 'Donation not found' });
        }

        if (donation.status !== 'Available') {
            return res.status(400).json({ message: 'This donation has already been claimed or is unavailable' });
        }

        donation.claimedBy = req.user.id;
        donation.status = 'Claimed';
        await donation.save();

        const ngo = await User.findById(req.user.id);
        const config = await getSystemConfig();
        const partnerPool = await User.find({ role: 'delivery_partner', isBlocked: false });
        const recommendations = await recommendPartners({ donation, partners: partnerPool, config });
        const bestPartner = recommendations.find((item) => item.eligible)?.partner || null;

        const deliveryRun = await DeliveryRun.create({
            donation: donation._id,
            donor: donation.donor,
            ngo: req.user.id,
            partner: bestPartner?._id || null,
            status: bestPartner ? 'Assigned' : 'Scheduled',
            pickupWindowStart: donation.pickupWindowStart || null,
            pickupWindowEnd: donation.pickupWindowEnd || null
        });

        if (bestPartner) {
            donation.assignedPartner = bestPartner._id;
            donation.status = 'Assigned';
            await donation.save();
        }

        const matchingRequest = await NGORequest.findOne({
            ngo: req.user.id,
            status: 'Open',
            category: donation.category
        }).sort({ createdAt: -1 });

        if (matchingRequest) {
            donation.matchedRequest = matchingRequest._id;
            matchingRequest.matchedDonations = Array.from(new Set([
                ...matchingRequest.matchedDonations.map((item) => String(item)),
                String(donation._id)
            ]));
            matchingRequest.fulfillmentStatus = matchingRequest.matchedDonations.length > 1 ? 'Partially Matched' : 'Matched';
            await matchingRequest.save();

            deliveryRun.ngoRequest = matchingRequest._id;
            await deliveryRun.save();
            await donation.save();
        }

        await logActivity({
            recipient: String(req.user.id),
            trigger: 'Donation Claimed',
            message: `${donation.item} claimed by NGO`,
            metadata: { donationId: donation._id, ngoId: req.user.id }
        });

        await createNotification(req, {
            users: [donation.donor, req.user.id],
            title: 'Donation Claimed',
            message: `${donation.item} has been claimed by an NGO and is ready for delivery coordination.`,
            type: 'donation',
            severity: 'warning',
            link: normalizeRole(req.user.role) === 'ngo' ? '/ngo-dashboard' : '/donor-dashboard'
        });

        if (bestPartner) {
            await createNotification(req, {
                users: [bestPartner._id, donation.donor, ngo?._id],
                title: 'Smart Assignment Created',
                message: `${donation.item} was automatically assigned using schedule, radius, capacity, and vehicle matching.`,
                type: 'delivery',
                severity: 'warning',
                channels: ['in_app', 'email'],
                link: '/delivery-dashboard'
            });
        }

        await emitDonationUpdate(req, donation, 'An NGO has claimed a donation.');
        res.status(200).json({
            success: true,
            data: donation,
            deliveryRun,
            recommendedPartners: recommendations.slice(0, 5).map((item) => ({
                partnerId: item.partner._id,
                name: item.partner.name,
                vehicleType: item.partner.vehicleType,
                distanceKm: item.distanceKm,
                capacityLeft: item.capacityLeft,
                score: item.score,
                eligible: item.eligible
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMyClaims = async (req, res) => {
    try {
        const donations = await Donation.find({ claimedBy: req.user.id })
            .populate('donor', 'name mobile address location')
            .populate('assignedPartner', 'name mobile photo vehicleType location')
            .populate('claimedBy', 'name organizationName mobile address location')
            .populate('matchedRequest', 'title quantityNeeded unit urgency deliveryAddress location')
            .sort({ updatedAt: -1 });

        res.status(200).json({ success: true, data: donations.map((donation) => attachLiveTracking(donation.toObject())) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getDeliveryTasks = async (req, res) => {
    try {
        const partner = await User.findById(req.user.id);
        const tasks = await Donation.find({
            $or: [
                { status: 'Available' },
                { status: 'Claimed', assignedPartner: null },
                { assignedPartner: req.user.id, status: { $in: ['Assigned', 'Picked Up', 'In Transit', 'Missed Pickup', 'Rescue Needed'] } }
            ]
        })
            .populate('donor', 'name mobile address')
            .populate('claimedBy', 'name organizationName mobile address location')
            .populate('assignedPartner', 'name mobile photo vehicleType location')
            .populate('matchedRequest', 'title quantityNeeded unit urgency deliveryAddress location')
            .sort({ updatedAt: -1 });

        const partnerAvailableNow = isWithinPartnerSchedule(partner);

        res.status(200).json({
            success: true,
            data: tasks.map((task) => attachLiveTracking(task.toObject())),
            meta: {
                partnerAvailableNow,
                availabilityStatus: partner?.availabilityStatus || 'available',
                workingDays: partner?.workingDays || [],
                shiftStart: partner?.shiftStart || '',
                shiftEnd: partner?.shiftEnd || ''
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.acceptDeliveryTask = async (req, res) => {
    try {
        const donation = await Donation.findById(req.params.id);
        if (!donation) {
            return res.status(404).json({ message: 'Donation not found' });
        }

        if (!['Claimed', 'Assigned'].includes(donation.status)) {
            return res.status(400).json({ message: 'This task is not available for assignment' });
        }

        if (donation.assignedPartner && String(donation.assignedPartner) !== req.user.id) {
            return res.status(400).json({ message: 'Another delivery partner is already assigned' });
        }

        donation.assignedPartner = req.user.id;
        donation.status = 'Assigned';
        await donation.save();

        await logActivity({
            recipient: String(req.user.id),
            trigger: 'Delivery Task Accepted',
            message: `${donation.item} accepted by delivery partner`,
            metadata: { donationId: donation._id, partnerId: req.user.id }
        });

        await createNotification(req, {
            users: [donation.donor, donation.claimedBy, req.user.id],
            title: 'Delivery Partner Assigned',
            message: `${donation.item} now has an assigned delivery partner and pickup can be coordinated.`,
            type: 'delivery',
            link: '/delivery-dashboard'
        });

        await emitDonationUpdate(req, donation, 'A delivery partner has accepted a pickup task.');
        res.status(200).json({ success: true, data: donation });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { status, pickupProofImage, deliveryProofImage, failureReason, cancellationReason } = req.body;
        const allowedStatuses = ['Picked Up', 'In Transit', 'Delivered', 'Missed Pickup', 'Rescue Needed', 'Cancelled'];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid delivery status' });
        }

        const donation = await Donation.findById(req.params.id);
        if (!donation) {
            return res.status(404).json({ message: 'Donation not found' });
        }

        if (!donation.assignedPartner || String(donation.assignedPartner) !== req.user.id) {
            return res.status(403).json({ message: 'Only the assigned delivery partner can update this task' });
        }

        donation.status = status;
        if (pickupProofImage) {
            donation.pickupProofImage = pickupProofImage;
        }
        if (deliveryProofImage) {
            donation.deliveryProofImage = deliveryProofImage;
        }
        if (failureReason) {
            donation.failureReason = failureReason;
        }
        if (cancellationReason) {
            donation.cancellationReason = cancellationReason;
        }
        if (status === 'Rescue Needed') {
            donation.rescueRequested = true;
        }
        await donation.save();

        const partner = await User.findById(req.user.id);
        if (partner && status === 'Delivered') {
            partner.impactPoints += 15;
            await partner.save();
        }

        if (status === 'Delivered') {
            const donor = await User.findById(donation.donor);
            if (donor) {
                donor.impactPoints += 20;
                await donor.save();
            }
        }

        await logActivity({
            recipient: String(req.user.id),
            trigger: 'Delivery Status Updated',
            message: `${donation.item} updated to ${status}`,
            metadata: { donationId: donation._id, partnerId: req.user.id, status }
        });

        await DeliveryRun.findOneAndUpdate(
            { donation: donation._id },
            {
                status,
                failureReason: failureReason || '',
                cancellationReason: cancellationReason || ''
            }
        );

        await createNotification(req, {
            users: [donation.donor, donation.claimedBy, req.user.id],
            title: `Delivery Status: ${status}`,
            message: `${donation.item} is now marked as ${status}.`,
            type: 'delivery',
            severity: ['Missed Pickup', 'Rescue Needed', 'Cancelled'].includes(status) ? 'critical' : 'info',
            channels: ['in_app', ...(['Missed Pickup', 'Rescue Needed'].includes(status) ? ['email'] : [])],
            link: status === 'Delivered' ? '/donor-dashboard' : '/delivery-dashboard'
        });

        if (status === 'Delivered') {
            await NGORequest.updateMany(
                { matchedDonations: donation._id },
                { fulfillmentStatus: 'Delivered', status: 'Fulfilled' }
            );
        }

        await emitDonationUpdate(req, donation, `Donation status updated to ${status}.`);
        res.status(200).json({ success: true, data: donation });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.assignDeliveryPartner = async (req, res) => {
    try {
        const { partnerId } = req.body;
        const donation = await Donation.findById(req.params.id);
        const partner = await User.findById(partnerId);

        if (!donation) {
            return res.status(404).json({ message: 'Donation not found' });
        }

        if (!partner || !isDeliveryPartnerRole(partner.role)) {
            return res.status(400).json({ message: 'Invalid delivery partner' });
        }

        donation.assignedPartner = partner._id;
        donation.status = 'Assigned';
        await donation.save();

        await DeliveryRun.findOneAndUpdate(
            { donation: donation._id },
            {
                partner: partner._id,
                status: 'Assigned',
                $push: {
                    interventionNotes: {
                        note: 'Admin manually assigned delivery partner.',
                        createdBy: 'Admin'
                    }
                }
            },
            { upsert: true }
        );

        await logActivity({
            recipient: partner.email || String(partner._id),
            trigger: 'Delivery Partner Assigned',
            message: `${partner.name} assigned to ${donation.item}`,
            metadata: { donationId: donation._id, partnerId: partner._id }
        });

        await createNotification(req, {
            users: [donation.donor, donation.claimedBy, partner._id],
            title: 'Admin Assigned Delivery Partner',
            message: `${partner.name} has been assigned to ${donation.item}.`,
            type: 'delivery',
            severity: 'warning',
            link: '/delivery-dashboard'
        });

        await emitDonationUpdate(req, donation, 'Admin assigned a delivery partner to a donation.');
        res.status(200).json({ success: true, data: donation });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPickupDetails = async (req, res) => {
    try {
        const donation = await Donation.findById(req.params.id)
            .populate('donor', 'name mobile email address')
            .populate('claimedBy', 'name organizationName mobile email address location')
            .populate('matchedRequest', 'title deliveryAddress location');

        if (!donation) {
            return res.status(404).json({ message: 'Donation not found' });
        }

        const role = normalizeRole(req.user.role);
        const isAssignedPartner = donation.assignedPartner && String(donation.assignedPartner) === req.user.id;
        const isClaimingNgo = donation.claimedBy && String(donation.claimedBy) === req.user.id;

        if (!isAssignedPartner && !(role === 'admin') && !(role === 'ngo' && isClaimingNgo)) {
            return res.status(403).json({ message: 'Access denied for pickup details' });
        }

        res.status(200).json({
            success: true,
            exactCoordinates: donation.location.coordinates,
            exactAddress: donation.location.address,
            donorContact: donation.donor,
            ngoContact: donation.claimedBy,
            ngoDeliveryAddress: donation.matchedRequest?.deliveryAddress || donation.claimedBy?.address || '',
            ngoCoordinates: donation.matchedRequest?.location?.coordinates || donation.claimedBy?.location?.coordinates || []
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createNgoRequest = async (req, res) => {
    try {
        const {
            title,
            category,
            quantityNeeded,
            unit,
            description,
            urgency,
            coordinates,
            deliveryAddress
        } = req.body;

        if (!title || !category) {
            return res.status(400).json({ success: false, message: 'Title and category are required.' });
        }

        const locationCoordinates = Array.isArray(coordinates) && coordinates.length === 2 ? coordinates : DEFAULT_COORDINATES;
        if (!isWithinMaharashtra(locationCoordinates)) {
            return res.status(400).json({ success: false, message: 'NGO request location must be inside Maharashtra.' });
        }

        const ngoProfile = await User.findById(req.user.id);
        const resolvedDeliveryAddress = deliveryAddress || ngoProfile?.address || '';
        if (!looksLikeRealAddress(resolvedDeliveryAddress)) {
            return res.status(400).json({ success: false, message: 'NGO request must include a valid delivery address.' });
        }

        const request = await NGORequest.create({
            ngo: req.user.id,
            title,
            category,
            quantityNeeded: Number(quantityNeeded) || 0,
            unit: unit || 'units',
            description: description || '',
            urgency: urgency || 'Normal',
            deliveryAddress: resolvedDeliveryAddress,
            location: {
                type: 'Point',
                coordinates: locationCoordinates
            }
        });

        const ngo = ngoProfile;
        await logActivity({
            recipient: ngo?.email || String(req.user.id),
            trigger: 'NGO Request Created',
            message: `${title} posted with ${urgency || 'Normal'} urgency`,
            metadata: { requestId: request._id, ngoId: req.user.id }
        });

        const io = req.app.get('socketio');
        if (io) {
            io.emit('ngo_request_created', {
                message: 'A new NGO emergency request has been posted.',
                request
            });
        }

        const donors = await User.find({ role: 'donor', isBlocked: false }, '_id').lean();
        await createNotification(req, {
            users: donors.map((item) => item._id).concat([req.user.id]),
            title: 'New NGO Broadcast',
            message: `${title} was posted as an NGO request with ${urgency || 'Normal'} urgency.`,
            type: 'request',
            severity: ['Urgent', 'Critical'].includes(urgency || 'Normal') ? 'critical' : 'info',
            channels: ['in_app', ...(['Urgent', 'Critical'].includes(urgency || 'Normal') ? ['email'] : [])],
            link: '/ngo-dashboard'
        });

        res.status(201).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getOpenNgoRequests = async (req, res) => {
    try {
        const requests = await NGORequest.find({ status: 'Open' })
            .populate('ngo', 'name organizationName city address location')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMyNgoRequests = async (req, res) => {
    try {
        const requests = await NGORequest.find({ ngo: req.user.id })
            .populate({
                path: 'assignedDonation',
                populate: [
                    { path: 'donor', select: 'name mobile address location' },
                    { path: 'assignedPartner', select: 'name mobile photo vehicleType location' },
                    { path: 'claimedBy', select: 'name organizationName address location' },
                    { path: 'matchedRequest', select: 'title quantityNeeded unit urgency deliveryAddress location' }
                ]
            })
            .sort({ createdAt: -1 })
            .lean();

        const payload = requests.map((request) => ({
            ...request,
            assignedDonation: request.assignedDonation ? attachLiveTracking(request.assignedDonation) : null
        }));
        res.status(200).json({ success: true, data: payload });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAdminRequestMatches = async (req, res) => {
    try {
        const config = await getSystemConfig();
        const requests = await NGORequest.find({ status: { $in: ['Open', 'Matched'] } })
            .populate('ngo', 'name organizationName city mobile email location address')
            .sort({ createdAt: -1 })
            .lean();

        const requestIds = requests.map((item) => item._id);
        const allOpenDonations = await Donation.find({
            status: { $in: ['Available', 'Claimed', 'Assigned'] }
        })
            .populate('donor', 'name email mobile city address location')
            .populate('assignedPartner', 'name')
            .lean();

        const payload = requests.map((request) => {
            const rankedMatches = allOpenDonations
                .filter((donation) => donation.category === request.category)
                .map((donation) => {
                    const computedDistanceKm = getDistanceKm(request.location?.coordinates || [], donation.location?.coordinates || []);
                    const distanceKm = deriveAddressDistanceKm(
                        request.deliveryAddress || request.ngo?.address || '',
                        donation.location?.address || donation.donor?.address || '',
                        computedDistanceKm
                    );
                    return {
                        ...donation,
                        distanceKm,
                        cityMatch: request.ngo?.city && donation.donor?.city
                            ? String(request.ngo.city).toLowerCase() === String(donation.donor.city).toLowerCase()
                            : false,
                        alreadyLinked: donation.matchedRequest && requestIds.some((id) => String(id) === String(donation.matchedRequest)),
                        freshnessState: donation.category === 'Food' && donation.spoilAt
                            ? (new Date(donation.spoilAt) < new Date() ? 'Expired' : 'Fresh')
                            : (donation.expiryDate || 'Verified')
                    };
                })
                .sort((left, right) => {
                    if (left.cityMatch !== right.cityMatch) {
                        return left.cityMatch ? -1 : 1;
                    }
                    const distanceA = left.distanceKm ?? Number.MAX_SAFE_INTEGER;
                    const distanceB = right.distanceKm ?? Number.MAX_SAFE_INTEGER;
                    return distanceA - distanceB;
                });

            return {
                ...request,
                suggestedDonations: rankedMatches.slice(0, 6)
            };
        });

        res.status(200).json({ success: true, data: payload });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.adminAssignDonationToRequest = async (req, res) => {
    try {
        const ngoRequest = await NGORequest.findById(req.params.requestId);
        const donation = await Donation.findById(req.params.donationId);

        if (!ngoRequest || !donation) {
            return res.status(404).json({ success: false, message: 'Request or donation not found' });
        }

        if (ngoRequest.status === 'Fulfilled' || ngoRequest.fulfillmentStatus === 'Delivered') {
            return res.status(400).json({ success: false, message: 'This NGO request is already fulfilled' });
        }

        if (!['Available', 'Claimed', 'Assigned'].includes(donation.status)) {
            return res.status(400).json({ success: false, message: 'Donation is not available for orchestration' });
        }

        if (donation.matchedRequest && String(donation.matchedRequest) !== String(ngoRequest._id)) {
            return res.status(400).json({ success: false, message: 'Donation is already linked to another NGO request' });
        }

        const assignment = await buildAssignmentForRequest({
            req,
            donation,
            ngoRequest,
            actorName: req.user.name,
            actorId: req.user.id
        });

        await logActivity({
            recipient: String(ngoRequest.ngo),
            trigger: 'Admin Matched Request',
            message: `${donation.item} matched to ${ngoRequest.title}`,
            metadata: { requestId: ngoRequest._id, donationId: donation._id, adminId: req.user.id }
        });

        res.status(200).json({
            success: true,
            data: donation,
            request: ngoRequest,
            ...assignment
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateNgoRequest = async (req, res) => {
    try {
        const request = await NGORequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: 'NGO request not found' });
        }

        const role = normalizeRole(req.user.role);
        const ownsRequest = String(request.ngo) === req.user.id;
        if (!(role === 'admin' || (role === 'ngo' && ownsRequest))) {
            return res.status(403).json({ success: false, message: 'You cannot edit this request' });
        }

        const updates = {
            title: req.body.title,
            category: req.body.category,
            quantityNeeded: req.body.quantityNeeded !== undefined ? Number(req.body.quantityNeeded) : undefined,
            unit: req.body.unit,
            description: req.body.description,
            urgency: req.body.urgency,
            neededBy: req.body.neededBy || undefined,
            adminNotes: req.body.adminNotes,
            adminReviewStatus: req.body.adminReviewStatus
        };

        Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
        Object.assign(request, updates);
        await request.save();

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteNgoRequest = async (req, res) => {
    try {
        const request = await NGORequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: 'NGO request not found' });
        }

        const role = normalizeRole(req.user.role);
        const ownsRequest = String(request.ngo) === req.user.id;
        if (!(role === 'admin' || (role === 'ngo' && ownsRequest))) {
            return res.status(403).json({ success: false, message: 'You cannot delete this request' });
        }

        await NGORequest.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Request deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateDonation = async (req, res) => {
    try {
        const donation = await Donation.findById(req.params.id);
        if (!donation) {
            return res.status(404).json({ success: false, message: 'Donation not found' });
        }

        const role = normalizeRole(req.user.role);
        const ownsDonation = String(donation.donor) === req.user.id;
        if (!(role === 'admin' || (role === 'donor' && ownsDonation))) {
            return res.status(403).json({ success: false, message: 'You cannot edit this donation' });
        }

        const restrictedStatuses = ['Picked Up', 'In Transit', 'Delivered'];
        if (restrictedStatuses.includes(donation.status) && role !== 'admin') {
            return res.status(400).json({ success: false, message: 'Donation cannot be edited after delivery operations begin' });
        }

        const updates = {
            item: req.body.item,
            description: req.body.description,
            quantityValue: req.body.quantityValue !== undefined ? Number(req.body.quantityValue) : undefined,
            unit: req.body.unit,
            cookedTime: req.body.cookedTime,
            expiryDate: req.body.expiryDate,
            batchNumber: req.body.batchNumber,
            pickupWindowStart: req.body.pickupWindowStart || undefined,
            pickupWindowEnd: req.body.pickupWindowEnd || undefined,
            vehiclePreference: req.body.vehiclePreference,
            cancellationReason: req.body.cancellationReason
        };

        if (req.body.address) {
            updates.publicAddressHint = `${String(req.body.address).split(',')[0]}, area hidden until assignment`;
            donation.location.address = req.body.address;
        }

        if (Array.isArray(req.body.coordinates) && req.body.coordinates.length === 2) {
            donation.location.coordinates = req.body.coordinates;
        }

        if (updates.cookedTime) {
            const config = await getSystemConfig();
            donation.spoilAt = calculateSpoilAt(updates.cookedTime, config.freshnessHours);
        }

        Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
        Object.assign(donation, updates);
        await donation.save();

        res.status(200).json({ success: true, data: donation });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteDonation = async (req, res) => {
    try {
        const donation = await Donation.findById(req.params.id);
        if (!donation) {
            return res.status(404).json({ success: false, message: 'Donation not found' });
        }

        const role = normalizeRole(req.user.role);
        const ownsDonation = String(donation.donor) === req.user.id;
        if (!(role === 'admin' || (role === 'donor' && ownsDonation))) {
            return res.status(403).json({ success: false, message: 'You cannot delete this donation' });
        }

        if (!['Available', 'Expired', 'Cancelled'].includes(donation.status) && role !== 'admin') {
            return res.status(400).json({ success: false, message: 'Only open, expired, or cancelled donations can be removed by donors' });
        }

        await Donation.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Donation deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
