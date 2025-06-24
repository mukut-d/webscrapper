const { sequelize } = require('../../../scraping/src/database/config.js');
const { INTEGER, UUID, STRING, BOOLEAN, DATE, BIGINT } = require('sequelize');

const TransactionHistory = sequelize.define('transaction_history', {
    id: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        unique: true,
    },
    user_id: {
        type: UUID,
        require: true,
    },
    created_at: {
        type: DATE,
        require: true,
    },
    updated_at: {
        type: DATE,
        require: true,
    },
    amount: {
        type: INTEGER,
        require: true,
    },
    currency: {
        type: STRING,
        require: true,
    },
    balance_after: {
        type: INTEGER,
        require: true,
    },
    transaction_type: {
        type: STRING,
        require: true,
        validate: {
            isIn: [['credit', 'debit']],
        },
    },
    transaction_id: {
        type: STRING,
        require: true,
    },
    status: {
        type: STRING,
        require: true,
        validate: {
            isIn: [['pending', 'completed', 'failed']],
        },
    },
}, {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
});

module.exports = TransactionHistory;
