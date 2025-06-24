const AccountBalance = require("../models/account-balance");
const assert = require('assert');

exports.convert = async (req, res) => {
    // ...currency conversion logic...
    res.json({ converted: 123 }); // Example
};

exports.getCurrency = async (req, res) => {
    try {
        const userId = req.user && req.user.id;
        assert(userId, 'userId should be present');
        const account = await AccountBalance.findOne({
            where: { user_id: userId, is_active: true }
        });
        if (!account) {
            return res.status(404).json({ success: false, message: "Account not found" });
        }
        res.json({ currency: account.currency });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.setCurrency = async (req, res) => {
    try {
        const userId = req.user && req.user.id;
        assert(userId, 'userId should be present');
        const { currency } = req.body;
        if (!userId || !currency) {
            return res.status(400).json({ success: false, message: "userId and currency are required" });
        }
        const account = await AccountBalance.findOne({
            where: { user_id: userId, is_active: true }
        });
        if (!account) {
            return res.status(404).json({ success: false, message: "Account not found" });
        }
        account.currency = currency;
        await account.save();
        res.json({ success: true, currency: account.currency });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
