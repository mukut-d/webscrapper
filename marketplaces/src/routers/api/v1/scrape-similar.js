const router = require('express').Router();
const { FindSimilarProducts, GetSimilarProducts, DeleteSimilarProducts, ExportSimilarProducts } = require('../../../controllers/api/v1/catalogue');

router.post("/fetch-similar-products", FindSimilarProducts);
router.post("/get-similar-products", GetSimilarProducts);
router.get("/export-similar-products", ExportSimilarProducts);
router.delete("/delete-similar-products", DeleteSimilarProducts);

module.exports = router;