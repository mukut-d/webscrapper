const router = require("express").Router();
const {
  GetCatalogue,
  GetEbayCatalogue,
  GetAllInventory,
  UpdateQuantityForEbay,
  MergeISKU,
  GenerateCSVForBulkUpload,
  ISKUBulkUpload,
  GenerateCSVForBulkUpdate,
  ISKUBulkUpdate,
  GenerateBulkMergeCSV,
  BulkMerge,
  // GenerateBulkCSKUUpdateCSV,
  // BulkCSKUUpdate,
  GetAllISKU,
  CheckInDB,
  UpdateISKU,
  GetCatalogueStatusCount,
  GetInventoryStatusCount,
  getItemDetails,
  GenerateBulkMigrateCsv,
  GetCSVData,
  MigrateItems,
  GetSingleCKSU,
  RetryListing,
  ReSyncFromEbay,
  fetchCatalogue,
  // getListShopifyProducts,
  // updateCSKUShopify,
  getFeedWalmart,
  GetCatalogueId,
  GetCatalogue30Days,
  generateExcelForCskuData,
  CreateIndivisualISKU,
  QuantityUpdateInEbayCron,
  generateExcelforUpdateBulkQuantityAndPrice,
  updateBulkQuantityAndPrice,
  UpdateCskusPrices,
  UpdateCskusQuantities,
  GenerateBulkFetchCSV,
  GetSingleItemFromMarketplace,
  BulkFetch,
  FetchItemsFeed,
  callStitchAndUpload,
  FetchItemStatus
} = require("../../../controllers/api/v1/catalogue");
const { UpdateBulkProductMarketPlace } = require("../../../controllers/api/v1/inventory");
const upload = require("../../../helper/multer");
const { updateWalmartProductStatus, createWalmartCatalogue, createWalmartCatalogueHandler, updateWalmartCatalogueHandler, updateWalmartInventoryHandler } = require("../../../marketplaceapis/walmart/catalogue");
const { insertCategoryAttributesFromFile } = require("../../../marketplaceapis/walmart/category");
const { CreateEbayItem, UpdateEbayItem } = require("../../../marketplaceapis/ebay/catalogue");

router.post("/get-catalogue", GetCatalogue);
router.get("/get-all-catalogue", GetEbayCatalogue);
router.post("/get-catalogue-byIds", GetCatalogueId);
router.get("/get-all-inventory", GetAllInventory);
router.put("/update-quantity/:id", UpdateQuantityForEbay);
router.post("/merge-iskus", MergeISKU);
router.get("/isku-bulk-upload-csv", GenerateCSVForBulkUpload);
router.get("/isku-bulk-update-csv", GenerateCSVForBulkUpdate);
router.post("/isku-bulk-upload", upload.single("csv"), ISKUBulkUpload);
router.put("/isku-bulk-update", upload.single("csv"), ISKUBulkUpdate);
router.put("/isku-bulk-merge", upload.single("csv"), BulkMerge);
router.get("/isku-bulk-merge-csv", GenerateBulkMergeCSV);
router.get("/csku-bulk-update-csv", generateExcelForCskuData);
router.put("/csku-bulk-update", upload.single('xlsx'), UpdateBulkProductMarketPlace);
router.get("/get-isku-dropdown", GetAllISKU);
router.get("/get-isku/:sku/:userId", CheckInDB);
router.put("/update/isku/:id", UpdateISKU);
router.get("/get-catalogue-status-count", GetCatalogueStatusCount);
router.get("/get-inventory-status-count", GetInventoryStatusCount);
router.post("/get-item-details", getItemDetails);
router.get("/bulk-migrate-csv", GenerateBulkMigrateCsv);
router.post("/get-csv-data", upload.single("file"), GetCSVData);
router.post("/bulk-migrate-data", MigrateItems);
router.get("/get-csku/:id", GetSingleCKSU);
router.post("/retry-listing/:id", RetryListing);
router.get("/resync-item/:id", ReSyncFromEbay);
router.get("/fetch-untracked-csku", fetchCatalogue);
router.get("/feedid", getFeedWalmart);
router.post("/sync-catalogue", GetCatalogue30Days);
router.post("/create/isku", CreateIndivisualISKU);
router.post('/update-quantity-cron', QuantityUpdateInEbayCron)
router.get('/update-walmart-status', updateWalmartProductStatus)
router.get('/insert-attributes', insertCategoryAttributesFromFile)
router.get('/get-update-template', generateExcelforUpdateBulkQuantityAndPrice)
router.post('/bulk-quantity-price',upload.single('xlsx') , updateBulkQuantityAndPrice)
router.post('/update-cskus-price', UpdateCskusPrices)
router.post('/update-cskus-quantity', UpdateCskusQuantities);
router.post('/generate-bulk-fetch-csv', GenerateBulkFetchCSV);
router.post('/get-single-item', GetSingleItemFromMarketplace);
router.post('/bulk-fetch', upload.single("file"), BulkFetch);
router.post("/fetch-item-feed", FetchItemsFeed);
router.post("/create-ebay-item", CreateEbayItem);
router.post("/create-walmart-item", createWalmartCatalogueHandler);
router.post("/update-ebay-item", UpdateEbayItem);
router.post("/update-walmart-item", updateWalmartCatalogueHandler);
router.post("/stitch-image", callStitchAndUpload)
router.put("/update-walmart-quantity", updateWalmartInventoryHandler)
router.post("/fetch-item-status", FetchItemStatus);

module.exports = router;