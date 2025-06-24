const router = require("express").Router();
const { get } = require("mongoose");
const {
  addTemplate,
  getTemplates,
  updateTemplate,
  deleteTemplate,
  getAllPublicTemplates,
  getAllTemplates
} = require("../../../controllers/api/v1/template");


router.post("/add", addTemplate);


router.get("/get", getTemplates);

router.get("/get-all", getTemplates);
router.get("/get-all-templates/:id", getAllTemplates);


router.post("/update", updateTemplate);

router.delete("/delete", deleteTemplate);

router.get("/public", getAllPublicTemplates)



module.exports = router;