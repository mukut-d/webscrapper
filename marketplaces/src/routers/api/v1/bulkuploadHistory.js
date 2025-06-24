const router = require("express").Router();
const { getBulkUploadHistory } = require("../../../controllers/api/v1/bulkuploadHistory");

router.post('/get', getBulkUploadHistory)

module.exports = router;