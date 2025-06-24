const router = require("express").Router();
const {
  scrapProductWithKeywords,
} = require("../../../controllers/api/v1/product");

router.post("/", async function (req, res) {
  scrapProductWithKeywords(req, res);
});

module.exports = router;
