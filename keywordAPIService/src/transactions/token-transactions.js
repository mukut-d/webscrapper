const AccountBalance = require('../models/account-balance.js');
const TransactionHistory = require('../models/transaction-history.js');
const assert = require('assert');
const User = require('../models/user.js');
const { initAccountBalanceForUpdate } = require('./account-balance.js');
const { getAmountFromTokens } = require('../helper/helper.js');
const config = require('../config.js');

const createAccountTransaction = async (userId, params, options = {}) => {
    const { transaction } = options;
    assert(userId, 'userId is required');
    assert(transaction, 'transaction should be present');
    assert(params, 'params should be present');

    const {
        type,
        transactionId,
        status,
        description,
        token_usage,
    } = params;

    let amount = params.amount || 0;

    assert(type, 'type is required');
    assert(transactionId, 'transactionId is required');
    assert(
        ['credit', 'debit'].includes(type),
        'type should be either credit or debit'
    );
    assert(transactionId, 'transactionId should be present');
    assert(
        ['pending', 'completed', 'failed'].includes(params.status),
        'status should be either pending, completed or failed'
    );

    const user = await User.findOne({
        where: {
            id: userId,
        }
    });

    if (!user) {
        throw new Error('User not found');
    }

    const existingTransaction = await TransactionHistory.findOne({
        where: {
            user_id: userId,
            transaction_id: transactionId,
        },
        transaction,
    });

    // Check if the transaction already exists
    if (existingTransaction) {
        throw new Error('Transaction already exists');
    }
    // Check if the user has an account balance
    const account = await initAccountBalanceForUpdate(userId, {
        transaction,
    });

    if (type === 'credit') {
        assert(amount, 'amount is required');
    } else if (type === 'debit') {
        assert(token_usage, 'token_usage is required');
        amount = getAmountFromTokens(token_usage, account.currency)
    }

    const userBalance = account.balance_remaining;

    let newBalance = userBalance;

    // If the transaction is completed, update the balance
    if (status === 'completed') {
        if (type === 'credit') {
            amount = amount / 100;
            newBalance += amount;
        } else if (type === 'debit') {
            newBalance -= amount;
        }
        if (newBalance < 0) {
            throw new Error('Insufficient balance');
        }
    }

    // Update user credits
    await account.update({
        balance_remaining: newBalance,
        credits_remaining: newBalance * config.token_per_rupee,
        updated_at: new Date(),
    }, { transaction });

    const createParams = {
        user_id: userId,
        amount,
        transaction_type: type,
        transaction_id: transactionId,
        currency: account.currency,
        type,
        status,
        description,
        balance_after: newBalance || 0,
        created_at: new Date(),
        updated_at: new Date(),
    };

    const transactionHistory = await TransactionHistory.create(createParams, {
        transaction,
    });

    return transactionHistory;
};

module.exports = {
    createAccountTransaction,
};
