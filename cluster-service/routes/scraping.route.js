const express = require("express");
const router = express.Router();
const ScrapingController = require("../controllers/scraping.controller.js");

// Route to scrape data
router.post("/scrape", ScrapingController.scrape);
// Route to extract data from HTML
router.post("/extract", ScrapingController.extract);

module.exports = router;
