const express = require('express');
const router = express.Router();
const razorpayService = require('./razorpay-payment');
const { isAuthenticated } = require('../middlewares/auth');

// Use consistent and clear endpoints for frontend integration
router.post('/create-order', isAuthenticated, razorpayService.createPayment);
router.post('/verify-payment', isAuthenticated, razorpayService.verifyPayment);
router.post('/payment-status', isAuthenticated, razorpayService.getPaymentStatus);
router.post('/razorpay-callback', razorpayService.razorpayCallback);

module.exports = router;
