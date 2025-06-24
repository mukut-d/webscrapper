const router = require("express").Router();

const {
  easeOfRankFilter,
  priceFilter,
  combinedFilter,
} = require("../../../controllers/api/v1/filters");

// router.post("/rank", async function (req, res) {
//   easeOfRankFilter(req, res);
// });

// router.post("/price", async function (req, res) {
//   priceFilter(req, res);
// });

router.post("/", async function (req, res) {
  combinedFilter(req, res);
});

module.exports = router;
