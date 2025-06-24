const router = require("express").Router();

const { scrape, test } = require("../../../controllers/api/v1/scrape");

router.post("/", async function (req, res) {
  scrape(req, res);
});

router.get("/test", async function (req, res) {
  test(req, res);
});

module.exports = router;
