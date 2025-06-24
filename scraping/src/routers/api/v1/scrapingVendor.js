const express = require('express');
const router = express.Router();
const scrapingVendorController = require('../../../controllers/scrapingVendor');

// Define your routes here
router.get('/list', scrapingVendorController.getAll);
router.get('/:id', scrapingVendorController.getById);
router.post('/create', scrapingVendorController.create);
router.put('/update/:id', scrapingVendorController.update);
router.delete('/delete/:id', scrapingVendorController.delete);

module.exports = router;
