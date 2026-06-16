const express = require('express');
const router = express.Router();
const {
    createDonation,
    getMyActivity,
    getPublicDonations,
    getPickupDetails,
    getMarketplace,
    claimDonation,
    getMyClaims,
    getDeliveryTasks,
    acceptDeliveryTask,
    updateDeliveryStatus,
    assignDeliveryPartner,
    createNgoRequest,
    getOpenNgoRequests,
    getMyNgoRequests,
    getAdminRequestMatches,
    adminAssignDonationToRequest,
    updateNgoRequest,
    deleteNgoRequest,
    updateDonation,
    deleteDonation
} = require('../controllers/donationController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/create', protect, authorize('donor', 'admin'), createDonation);
router.get('/my-activity', protect, authorize('donor', 'admin'), getMyActivity);
router.put('/:id', protect, authorize('donor', 'admin'), updateDonation);
router.delete('/:id', protect, authorize('donor', 'admin'), deleteDonation);
router.get('/public', getPublicDonations);

router.get('/marketplace', protect, authorize('ngo', 'admin'), getMarketplace);
router.post('/:id/claim', protect, authorize('ngo', 'admin'), claimDonation);
router.get('/my-claims', protect, authorize('ngo', 'admin'), getMyClaims);

router.get('/delivery-tasks', protect, authorize('delivery_partner', 'admin'), getDeliveryTasks);
router.post('/:id/accept-task', protect, authorize('delivery_partner', 'admin'), acceptDeliveryTask);
router.post('/:id/update-status', protect, authorize('delivery_partner', 'admin'), updateDeliveryStatus);
router.post('/:id/assign-partner', protect, authorize('admin'), assignDeliveryPartner);

router.get('/requests', getOpenNgoRequests);
router.get('/my-requests', protect, authorize('ngo', 'admin'), getMyNgoRequests);
router.post('/requests', protect, authorize('ngo', 'admin'), createNgoRequest);
router.put('/requests/:id', protect, authorize('ngo', 'admin'), updateNgoRequest);
router.delete('/requests/:id', protect, authorize('ngo', 'admin'), deleteNgoRequest);
router.get('/admin/request-matches', protect, authorize('admin'), getAdminRequestMatches);
router.post('/admin/request-matches/:requestId/assign/:donationId', protect, authorize('admin'), adminAssignDonationToRequest);

router.get('/pickup/:id', protect, getPickupDetails);

module.exports = router;
