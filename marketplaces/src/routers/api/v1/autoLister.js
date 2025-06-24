const express = require("express");
const router = express.Router();
const upload = require("../../../helper/multer");
const { autoListerForVendor } = require("../../../controllers/api/v1/autoLister");

router.post("/schedule", upload.single("file"),  autoListerForVendor);

module.exports = router;
