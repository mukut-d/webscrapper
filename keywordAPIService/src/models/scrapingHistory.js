const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../database/config.js');

// Verify sequelize connection
sequelize
    .authenticate()
    .then(() => {
        console.log('ScrapingHistory model - Database connection successful');
    })
    .catch(err => {
        console.error('ScrapingHistory model - Unable to connect to the database:', err);
    });

const ScrapingHistory = sequelize.define('scraping_history', {
    id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    project_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    keyword: {
        type: DataTypes.STRING
    },
    url: {
        type: DataTypes.STRING
    },
    marketplace: {
        type: DataTypes.STRING
    },
    status: {
        type: DataTypes.STRING
    },
    started_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW
    },
    finished_at: {
        type: DataTypes.DATE
    },
    details: {
        type: DataTypes.JSONB
    },
    token_used: {
        type: DataTypes.INTEGER
    },
}, {
    tableName: 'scraping_history',
    underscored: true,
    timestamps: false
});

module.exports = ScrapingHistory;