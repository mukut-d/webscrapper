const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Prompt = sequelize.define('Prompt', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    category_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.STRING,
        allowNull: true, // Nullable for non-user-defined prompts
    },
    prompt: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    marketplace_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('user_defined', 'category_tree', 'category'),
        allowNull: false,
    },
}, {
    timestamps: true,
    tableName: 'prompts',
});

module.exports = Prompt;