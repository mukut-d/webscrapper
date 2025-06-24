const router = require("express").Router();

const { excelSampleDownload } = require("../../../controllers/api/v1/excel");

router.post("/download", async function (req, res) {
  excelSampleDownload(req, res);
});

module.exports = router;
