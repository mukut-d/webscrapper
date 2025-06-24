const express = require('express');
const router = express.Router();
const scrapingService = require('./scrapping');

const { checkApiUsage } = require('../middlewares/api-usage');

router.post('/search', checkApiUsage, scrapingService.searchProduct);
router.post('/search/bulk', checkApiUsage, scrapingService.searchBulk);
router.get('/allowed-marketplaces', scrapingService.getMarketplaces);

module.exports = router;
