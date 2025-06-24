const { sequelize } = require('../../../scraping/src/database/config.js');
const { INTEGER, UUID, STRING, BOOLEAN, DATE, BIGINT } = require('sequelize');

const AccountBalance = sequelize.define('account_balance', {
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
    balance_remaining: {
        type: INTEGER,
    },
    currency: {
        type: STRING,
        require: true,
    },
    credits_remaining: {
        type: INTEGER,
        require: true,
    },
    is_active: {
        type: BOOLEAN,
    },
    type: {
        type: STRING,
        require: false,
    },

}, {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
});

module.exports = AccountBalance;
