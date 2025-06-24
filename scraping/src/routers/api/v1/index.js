const router = require("express").Router();

router.use("/scrape", require("./scrape"));
router.use("/predictSales", require("./predictSales"));
router.use("/filters", require("./filters"));
router.use("/compareSimilarity", require("./compareSimilarity"));
router.use("/scraping-vendor", require("./scrapingVendor"));

module.exports = router;
