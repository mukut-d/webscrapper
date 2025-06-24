const router = require("express").Router();

const { scrapeList } = require("../../../controllers/api/v1/scrape");

router.post("/list", async function (req, res) {
  scrapeList(req, res);
});

module.exports = router;
