const { sequelize } = require('../../../scraping/src/database/config.js');
const { STRING, DATE, BIGINT, BOOLEAN, DataTypes } = require('sequelize');

const ScrapingSettings = sequelize.define('scraping_settings', {
    id: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        unique: true,
    },
    created_at: {
        type: DATE,
        require: false,
    },
    updated_at: {
        type: DATE,
        require: false,
    },
    type: {
        type: STRING,
        require: false,
    },
    name: {
        type: STRING,
        require: false,
    },
    value: {
        type: DataTypes.JSONB,
        require: false,
    },
    is_active: {
        type: BOOLEAN,
        require: false,
    },
}, {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
});

module.exports = ScrapingSettings;
