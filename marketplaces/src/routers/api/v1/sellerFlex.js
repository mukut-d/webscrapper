const {
    createPackages,
    generateInvoice,
    generateShipLabel,
    getInventory,
    getShipment,
    getShipments,
    processShipment,
    retrieveShippingOptions,
    retriveShipLabel,
    updateInventory,
    updatePackage,
    listReturns
} = require("../../../marketplaceapis/amazon/sellerFlex");
const router = require("express").Router();

router.post("/create-packages", createPackages);
router.post("/generate-invoice", generateInvoice);
router.post("/generate-ship-label", generateShipLabel);
router.post("/get-inventory", getInventory);
router.post("/get-shipment", getShipment);
router.post("/get-shipments", getShipments);
router.post("/process-shipment", processShipment);
router.post("/retrieve-shipping-options", retrieveShippingOptions);
router.post("/retrive-ship-label", retriveShipLabel);
router.post("/update-inventory", updateInventory);
router.post("/update-package", updatePackage);
router.post("/list-returns", listReturns);

module.exports = router;