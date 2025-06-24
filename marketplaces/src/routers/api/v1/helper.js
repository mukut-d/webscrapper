const express = require("express");
const router = express.Router();
const {generateQRHandler} = require("../../../helper/QRGenerator");

router.post("/generate-qr", generateQRHandler);

module.exports = router;