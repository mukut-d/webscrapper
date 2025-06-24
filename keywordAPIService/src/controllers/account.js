const AccountBalance = require("../models/account-balance");
const assert = require('assert');

exports.getBalance = async (req, res) => {
    try {
        const { id: userId } = req.user || {}; // Assuming user ID is in the request object
        assert(userId, 'userId should be present');
        const balance = await AccountBalance.findOne({
            where: {
                user_id: userId,
                is_active: true,
            }
        });
        if (!balance) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.json({ data: balance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
