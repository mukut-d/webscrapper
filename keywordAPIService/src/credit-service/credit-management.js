const { Op } = require("sequelize");
const config = require("../config");
const AccountBalance = require("../models/account-balance");

const checkSubcription = async (req) => {
    const { user } = req;

    if (!user) {
        throw new Error('User not found', {
            status: 403,
            message: 'User not found',
        });
    }
    const { id } = user;
    const credits = await AccountBalance.findOne({
        where: {
            user_id: id,
            is_active: true,
        },
    });

    if (!credits || credits.credits_remaining < config.token_per_scraping) {
        throw new Error('Insufficient credits', {
            status: 403,
            message: 'Insufficient credits',
        });
    }

    req.api_credit_balance = credits;

    // TODO: Implement soft lock for credits to 
    // INSURE that the credits are not used by other requests
    // and the request is not blocked by other requests
};

module.exports = {
    checkSubcription,
};
