const router = require("express").Router();
const { RelistEbayItem } = require("../../../cron-jobs/relister/relister");

router.post("/relist-items", RelistEbayItem);

module.exports = router;