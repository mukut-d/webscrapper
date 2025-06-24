const Razorpay = require('razorpay');
const config = require('../config');
const crypto = require('crypto');
const { sequelize } = require('../database/config');
const { createAccountTransaction } = require('../transactions/token-transactions');
const { User } = require('../models');
const AccountBalance = require('../models/account-balance');
const { initAccountBalanceForUpdate } = require('../transactions/account-balance');

const razorpay = new Razorpay({
    key_id: config.razorpay_key_id,
    key_secret: config.razorpay_key_secret,
});

async function createPayment(req, res) {
    try {
        let { amount, currency = 'INR' } = req.body || {};
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!amount) {
            return res.status(400).json({ error: 'Amount is required' });
        }
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        if (!currency) {
            return res.status(400).json({ error: 'Currency is required' });
        }
        if (typeof currency !== 'string' || currency.length !== 3) {
            return res.status(400).json({ error: 'Invalid currency format' });
        }
        // Razorpay expects amount in paise for INR
        if (currency === 'INR') {
            amount = Math.round(amount);
        }
        const options = {
            amount,
            currency,
            receipt: `rcpt_${Date.now()}`,
        };
        const order = await razorpay.orders.create(options);
        return res.status(200).json({ data: order });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create order' });
    }
}

const verifyPayment = async (req, res) => {
    let transaction;
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body || {};

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const generated_signature = crypto.createHmac('sha256', config.razorpay_key_secret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        transaction = await sequelize.transaction();

        // Fetch the order to get the amount
        const order = await razorpay.orders.fetch(razorpay_order_id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Update user wallet balance
        const user = req.user;
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = user.id;

        const accountBalance = await initAccountBalanceForUpdate(userId, {
            transaction,
        });

        if (!accountBalance) {
            return res.status(404).json({ error: 'Account not found' });
        }
        accountBalance.balance = Number(accountBalance.balance || 0) + Number(order.amount) / 100;
        await accountBalance.save({ transaction });

        await createAccountTransaction(
            req.user.id,
            {
                amount: order.amount,
                type: 'credit',
                transactionId: razorpay_payment_id,
                status: 'completed',
                description: 'Razorpay payment',
            },
            { transaction }
        );

        await transaction.commit();
        return res.status(200).json({ success: true });
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        console.error('Error in verifyPayment:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getPaymentStatus = async (req, res) => {
    const { orderId } = req.body || {};
    if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
    }
    const result = await razorpay.orders.fetch(orderId);
    if (!result) {
        return res.status(404).json({ error: 'Order not found' });
    }
    return res.status(200).json({
        status: result.status,
        amount: result.amount,
        currency: result.currency,
        created_at: result.created_at,
    });
};

/**
 * Handle Razorpay webhook/callback.
 * Verifies signature, logs event, and updates payment status.
 */
const razorpayCallback = async (req, res) => {
    const webhookSecret = config.razorpay_webhook_secret;
    let transaction;
    try {
        // Razorpay sends payload in req.body and signature in header
        const payload = JSON.stringify(req.body);
        const signature = req.headers['x-razorpay-signature'];

        if (!signature || !webhookSecret) {
            return res.status(400).json({ error: 'Missing signature or webhook secret' });
        }

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(payload)
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        // Log the event (could be to DB or just console for now)
        console.log('Razorpay webhook event:', req.body.event, req.body);

        // Example: handle payment.captured event
        if (req.body.event === 'payment.captured') {
            const paymentEntity = req.body.payload.payment.entity;
            const orderId = paymentEntity.order_id;
            const paymentId = paymentEntity.id;
            const amount = paymentEntity.amount;
            const currency = paymentEntity.currency;

            // Start transaction for atomicity
            transaction = await sequelize.transaction();

            // Find user by order (assuming you store orderId with user)
            // You may need to adjust this logic based on your schema
            const order = await razorpay.orders.fetch(orderId);
            if (!order) {
                if (transaction) await transaction.rollback();
                return res.status(404).json({ error: 'Order not found' });
            }

            // Find user by order receipt or metadata (customize as needed)
            const user = await User.findOne({ where: { id: order.notes?.userId } });
            if (!user) {
                if (transaction) await transaction.rollback();
                return res.status(404).json({ error: 'User not found' });
            }

            // Update user balance
            user.balance = Number(user.balance || 0) + Number(amount) / 100;
            await user.save({ transaction });

            // Log transaction
            await createAccountTransaction(
                user.id,
                {
                    amount,
                    type: 'credit',
                    transactionId: paymentId,
                    status: 'completed',
                    description: 'Razorpay payment (webhook)',
                },
                { transaction }
            );

            await transaction.commit();
        }

        // Respond success
        return res.status(200).json({ success: true });
    } catch (error) {
        if (transaction) await transaction.rollback();
        console.error('Error in razorpayCallback:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    createPayment,
    verifyPayment,
    getPaymentStatus,
    razorpayCallback,
};
