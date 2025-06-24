const { webAuthMiddleware, isAuthenticated } = require('../../../middlewares/auth');
const marketplaceScraping = require('../../../mp-scraping/mp-scraping-api');
const razorpayApi = require('../../../payment/payment-api');

// Add missing controllers
const accountController = require('../../../controllers/account');
const currencyController = require('../../../controllers/currency');
const historyController = require('../../../controllers/api/v1/history');

const router = require('express').Router();

router.use('/product', require('./product'));

router.use('/mp-scraping', webAuthMiddleware, marketplaceScraping);
router.use('/payment', isAuthenticated, razorpayApi);

// Account balance APIs
router.get('/account/balance', isAuthenticated, accountController.getBalance);

// Currency conversion API
router.get('/currency/convert', isAuthenticated, currencyController.convert);

// History APIs
router.get('/history/scraping', isAuthenticated, historyController.getScrapingHistory);
router.get('/history/transaction', isAuthenticated, historyController.getTransactionHistory);

module.exports = router;