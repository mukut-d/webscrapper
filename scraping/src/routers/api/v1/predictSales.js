const router = require("express").Router();

const { predictSales } = require("../../../controllers/api/v1/predictSales");

router.post("/", async function (req, res) {
  predictSales(req, res);
});

module.exports = router;
