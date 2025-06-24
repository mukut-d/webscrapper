const router = require("express").Router();

const {
  Create,
  list,
  getByProject,
  exportToDoc,
  bulkUpload,
} = require("../../../controllers/api/v1/product");

router.post("/", async function (req, res) {
  console.log("object");
  Create(req, res);
});

router.post("/getAll", async function (req, res) {
  list(req, res);
});

router.get("/get-by-Project", async function (req, res) {
  getByProject(req, res);
});

router.post("/cloud-storage/file", async function (req, res) {
  bulkUpload(req, res);
});

router.get("/export", async function (req, res) {
  exportToDoc(req, res);
});



module.exports = router;
