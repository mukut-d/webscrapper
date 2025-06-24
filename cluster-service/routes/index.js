const express = require("express");
const router = express.Router();

const projectRoute = require("./project.route");
const scrapingRoute = require("./scraping.route");

router.use("/projects", projectRoute);
router.use("/scraping", scrapingRoute);

module.exports = router;
