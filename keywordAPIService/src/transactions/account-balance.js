const config = require('../config');
const AccountBalance = require('../models/account-balance');
const assert = require('assert');

const createAccountBalance = async (userId, options) => {
    const { transaction } = options;
    assert(userId, 'userId is required');
    assert(transaction, 'transaction should be present');

    const allowedScrapingsForFree = config.max_trials_signed_up || 10;

    const freeCredits = allowedScrapingsForFree * config.token_per_scraping;

    const accountBalance = await AccountBalance.create({
        user_id: userId,
        balance_remaining: freeCredits / config.token_per_rupee,
        credits_remaining: freeCredits,
        is_active: true,
        currency: options.currency || 'INR',
        created_at: new Date(),
        updated_at: new Date(),
    }, {
        transaction,
    });

    return accountBalance;
};

const initAccountBalanceForUpdate = async (userId, options) => {
    const { transaction } = options;
    assert(userId, 'userId is required');
    assert(transaction, 'transaction should be present');

    // create lock on user's row to update
    const accountBalance = await AccountBalance.findOne({
        where: {
            user_id: userId,
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
    });

    if (!accountBalance) {
        // create account balance if not exists
        return await createAccountBalance(userId, options);
    }

    return accountBalance;
};

module.exports = {
    createAccountBalance,
    initAccountBalanceForUpdate,
};
