const {
  Presentation,
  PresentationFile,
  panel,
  text,
  fill,
  hug,
} = await import("@oai/artifact-tool");

const presentation = Presentation.create({
  slideSize: { width: 1920, height: 1080 },
});

const slide = presentation.slides.add();
slide.background = { color: "#F7F9FC" };

const colors = {
  navy: "#244A86",
  blue: "#2F6FDB",
  paleAmber: "#FFF3D0",
  green: "#DFF4E8",
  greenText: "#157347",
  slate: "#334155",
  white: "#FFFFFF",
  border: "#B9C9E8",
  soft: "#EEF4FF",
  softGray: "#EFF3F8",
  dark: "#172033",
  mint: "#9EF0C7",
  steel: "#CBD8EC",
  aqua: "#D7FFF0",
};

function box(frame, fillColor, strokeColor = colors.border, radius = "rounded-md") {
  slide.compose(
    panel({
      width: fill,
      height: fill,
      fill: fillColor,
      stroke: strokeColor,
      borderRadius: radius,
      padding: 0,
    }),
    { frame, baseUnit: 8 },
  );
}

function write(value, frame, style = {}) {
  slide.compose(
    text(value, {
      width: fill,
      height: hug,
      style: {
        fontSize: 26,
        color: colors.dark,
        ...style,
      },
    }),
    { frame, baseUnit: 8 },
  );
}

function section(title, frame, body, opts = {}) {
  box(frame, opts.fill || colors.white, opts.stroke || colors.border, "rounded-lg");
  box(
    { left: frame.left, top: frame.top, width: frame.width, height: 40 },
    colors.navy,
    colors.navy,
    "rounded-sm",
  );
  write(title, { left: frame.left + 16, top: frame.top + 8, width: frame.width - 32, height: 24 }, {
    fontSize: 23,
    bold: true,
    color: colors.white,
  });
  write(body, {
    left: frame.left + 18,
    top: frame.top + 52,
    width: frame.width - 36,
    height: frame.height - 64,
  }, {
    fontSize: opts.fontSize || 20,
    color: opts.bodyColor || colors.slate,
  });
}

// Header bands
box({ left: 24, top: 18, width: 1090, height: 46 }, colors.steel, colors.steel, "rounded-sm");
box({ left: 1612, top: 18, width: 284, height: 46 }, colors.paleAmber, colors.paleAmber, "rounded-sm");
box({ left: 316, top: 74, width: 1578, height: 86 }, colors.navy, colors.navy, "rounded-sm");
box({ left: 28, top: 125, width: 220, height: 82 }, colors.paleAmber, colors.paleAmber, "rounded-sm");

write("SSVPS B.S. Deore College of Engineering", { left: 340, top: 24, width: 950, height: 30 }, {
  fontSize: 34,
  color: colors.slate,
  fontFace: "Georgia",
  align: "center",
});
write("Class : TY COMPUTER\nGroup Id : 17", { left: 1640, top: 24, width: 240, height: 30 }, {
  fontSize: 18,
  bold: true,
  color: "#3B3020",
});
write("DEPARTMENT OF COMPUTER ENGINEERING", { left: 620, top: 84, width: 1020, height: 24 }, {
  fontSize: 24,
  bold: true,
  color: colors.mint,
  fontFace: "Georgia",
  align: "center",
});
write("Project Topic:- Donation Bridge", { left: 460, top: 112, width: 1260, height: 28 }, {
  fontSize: 42,
  italic: true,
  color: colors.white,
  align: "center",
});
write(
  "Group Members Name:- Vaibhavi Mahajan, Divya Musale, Swati Salunkhe, Tanvi Patil",
  { left: 430, top: 142, width: 1320, height: 18 },
  { fontSize: 20, italic: true, color: colors.aqua, align: "center" },
);
write("Faculty Guide:\nProf. M. P. Patil", { left: 46, top: 138, width: 180, height: 44 }, {
  fontSize: 18,
  bold: true,
  color: "#2A2113",
});

// Left column
section(
  "Problem Statement & Need",
  { left: 28, top: 230, width: 500, height: 240 },
  "Many donation systems only list items but do not verify need, quality, location, or final delivery. Donors may not know who truly needs the resource, NGOs struggle to aggregate demand, and admins cannot supervise the full chain.\n\nDonation Bridge connects verified NGO requests, donor inventory, admin-controlled matching, and delivery partner proof in one accountable workflow.",
  { fontSize: 20 },
);

section(
  "Why NGO + Admin Matter",
  { left: 28, top: 485, width: 500, height: 180 },
  "- NGO represents verified community demand, not random posting.\n- Admin acts as a control tower for KYC, matching, audit, and intervention.\n- Donor gets trust, privacy, and proof instead of blind handoff.\n- Delivery partner provides safe last-mile movement and checkpoint evidence.",
  { fill: colors.green, bodyColor: colors.greenText, fontSize: 19 },
);

section(
  "What Makes Donation Bridge Different",
  { left: 28, top: 680, width: 500, height: 220 },
  "- Demand-driven model: NGO need comes first.\n- Admin matches donor inventory to the requirement.\n- OCR validation for medicine expiry and batch traceability.\n- Freshness timer for food with admin-set expiry hours.\n- Privacy-safe pickup addresses and proof-backed delivery closure.",
  { fill: colors.paleAmber, bodyColor: "#4A3720", fontSize: 19 },
);

// Center flow
section(
  "Verified Coordination Workflow",
  { left: 550, top: 230, width: 830, height: 430 },
  "",
);

const flowBoxes = [
  { left: 585, top: 290, width: 134, height: 150, number: "1", label: "NGO raises\nverified need" },
  { left: 750, top: 290, width: 134, height: 150, number: "2", label: "Admin reviews\nand matches" },
  { left: 915, top: 290, width: 134, height: 150, number: "3", label: "Donor posts\nvalidated item" },
  { left: 1080, top: 290, width: 134, height: 150, number: "4", label: "Delivery partner\naccepts route" },
  { left: 1245, top: 290, width: 104, height: 150, number: "5", label: "NGO receives\nwith proof" },
];

flowBoxes.forEach((item, idx) => {
  box(
    { left: item.left, top: item.top, width: item.width, height: item.height },
    idx % 2 === 0 ? colors.soft : "#F8FBFF",
    colors.blue,
    "rounded-lg",
  );
  box({ left: item.left + 44, top: item.top + 14, width: 46, height: 30 }, colors.blue, colors.blue, "rounded-full");
  write(item.number, { left: item.left + 56, top: item.top + 18, width: 24, height: 16 }, {
    fontSize: 16,
    bold: true,
    color: colors.white,
    align: "center",
  });
  write(item.label, { left: item.left + 12, top: item.top + 60, width: item.width - 24, height: 70 }, {
    fontSize: 22,
    bold: true,
    color: colors.dark,
    align: "center",
  });
  if (idx < flowBoxes.length - 1) {
    write(">", { left: item.left + item.width + 10, top: item.top + 56, width: 20, height: 30 }, {
      fontSize: 30,
      bold: true,
      color: colors.blue,
      align: "center",
    });
  }
});

section(
  "System Modules",
  { left: 585, top: 460, width: 760, height: 170 },
  "",
  { fill: colors.softGray },
);

write(
  "Donor Module\n- Post donation wizard\n- OCR medicine verification\n- Food freshness countdown\n- History, rewards and live delivery status",
  { left: 610, top: 515, width: 225, height: 100 },
  { fontSize: 18 },
);
write(
  "NGO Module\n- Publish urgent needs\n- Provide verified delivery address\n- Track accepted request and delivery partner\n- Receive proof-backed delivery",
  { left: 865, top: 515, width: 245, height: 100 },
  { fontSize: 18 },
);
write(
  "Admin + Delivery Module\n- Aadhaar/KYC review\n- Match donor dataset to NGO need\n- Assign delivery run and monitor route\n- Audit proof, expiry risk and reports",
  { left: 1130, top: 515, width: 195, height: 100 },
  { fontSize: 17 },
);

// Right column
section(
  "Core Features & Algorithms",
  { left: 1400, top: 230, width: 492, height: 260 },
  "- OCR extracts medicine expiry date and batch number.\n- Expired medicine is blocked before posting.\n- Food spoil window uses admin-defined freshness hours.\n- Smart matching considers category, city, distance, role, and availability.\n- Socket-based notifications push live request, claim, and delivery updates.",
  { fontSize: 19 },
);

section(
  "Database / Recorded Data",
  { left: 1400, top: 505, width: 492, height: 160 },
  "MongoDB stores donors, NGOs, delivery partners, Aadhaar/KYC records, requests, donations, proofs, delivery runs, admin logs, notifications, and analytics history.",
  { fill: colors.green, bodyColor: colors.greenText, fontSize: 20 },
);

section(
  "Technology Stack",
  { left: 1400, top: 680, width: 492, height: 220 },
  "Frontend: React.js\nBackend: Node.js + Express.js\nDatabase: MongoDB\nMaps: Google Maps + Places\nReal-time: Socket.io\nAI/Validation: Tesseract OCR + image quality screening\nStorage & Proof: Cloudinary",
  { fill: colors.soft, fontSize: 19 },
);

// Bottom middle blocks
section(
  "Proposed Solution",
  { left: 550, top: 680, width: 270, height: 220 },
  "Donation Bridge is a verified smart donation coordination platform that transforms scattered surplus into accountable fulfillment. It bridges donors, NGOs, admin, and delivery partners through traceable workflows instead of simple listing pages.",
  { fontSize: 17 },
);

section(
  "Scope & Feasibility",
  { left: 840, top: 680, width: 250, height: 220 },
  "- Food rescue\n- Medicine distribution\n- Clothes and essentials\n- Disaster relief requests\n- College and NGO campaigns\n- City-level verified donation mapping",
  { fontSize: 18 },
);

section(
  "Trust & Safety Layer",
  { left: 1110, top: 680, width: 270, height: 220 },
  "- Aadhaar document upload for NGO KYC\n- Admin approval before live claiming\n- Exact pickup address hidden until assignment\n- Pickup and drop proof images stored for audit",
  { fontSize: 17 },
);

// Conclusion strip
box({ left: 550, top: 915, width: 1342, height: 118 }, colors.white, colors.border, "rounded-lg");
box({ left: 550, top: 915, width: 1342, height: 40 }, colors.navy, colors.navy, "rounded-sm");
write("Conclusion", { left: 570, top: 924, width: 180, height: 20 }, {
  fontSize: 23,
  bold: true,
  color: colors.white,
});
write(
  "Donation Bridge delivers a complete, transparent and scalable donation lifecycle: verified need collection, admin-controlled matching, donor validation, real-time delivery updates, and proof-backed closure. The project is designed to reduce waste, improve trust, and make community support measurable and accountable.",
  { left: 580, top: 969, width: 1280, height: 46 },
  { fontSize: 18, color: colors.slate, valign: "mid" },
);

write(
  "Poster prepared for academic presentation. All text remains editable in Microsoft PowerPoint.",
  { left: 40, top: 1020, width: 430, height: 18 },
  { fontSize: 12, italic: true, color: "#607289" },
);

const pptxBlob = await PresentationFile.exportPptx(presentation);
await pptxBlob.save("C:/Users/DELL/Desktop/resource_network/tmp/donation-bridge-poster/output/Donation-Bridge-Poster.pptx");
