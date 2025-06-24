const router = require("express").Router();
const {
  compareSimilarity,
} = require("../../../controllers/api/v1/compareSimilarity");

router.get("/", async function (req, res) {
  compareSimilarity(req, res);
});

module.exports = router;
