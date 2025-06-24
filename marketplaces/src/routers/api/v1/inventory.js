const {
  CreateBulkProductMarketPlace,
  generateExcel,
  UpdateBulkProductMarketPlace,
  CreateMarketPlaceProduct,
  UpdateMarketPlaceProduct,
  GetAspectsInventory,
  GetCskusFromIsku,
  handleBulkCreateFromCustomFile
} = require("../../../controllers/api/v1/inventory");
const router = require("express").Router();
const upload = require("../../../helper/multer");
const multer = require('multer');
const uploads = multer();

router.post("/bulk-inventory", upload.single('xlsx'), CreateBulkProductMarketPlace);
router.post("/create-inventory", CreateMarketPlaceProduct)
router.put("/update-inventory/:id", UpdateMarketPlaceProduct)
router.post("/get-aspects", GetAspectsInventory);
router.get('/generate-excel', generateExcel);
router.put("/update-bulk", upload.single('xlsx'), UpdateBulkProductMarketPlace);
router.post("/generate-excle", generateExcel)
router.post("/bulk-upload-ebey", CreateBulkProductMarketPlace)
router.get("/get-products-by-isku/:isku/:userId", GetCskusFromIsku)
router.post('/bulk-inventory-custom', uploads.single('xlsx'), handleBulkCreateFromCustomFile);

module.exports = router;
