const router = require("express").Router();

router.use("/scrape", require("./scrape"));

module.exports = router;
