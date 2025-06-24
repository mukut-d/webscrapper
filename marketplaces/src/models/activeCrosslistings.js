const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const ActiveListings = sequelize.define(
    "active_crosslistings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        config_id: {
            type: DataTypes.UUID,
            references: {
                model: 'catalogue-config',
                key: 'id',
            }
        },
        version: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        status: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        products_migrated: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0, // Default value to indicate no products migrated yet
        },
        total_products: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0, // Default value to indicate no products left
        },
        last_execution_time: {
            type: DataTypes.DATE,
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    }, {
    tableName: 'active_listings',
    timestamps: true, // Enables Sequelize to manage createdAt and updatedAt fields automatically
    createdAt: 'created_at',
    updatedAt: 'updated_at',
}
);

module.exports = ActiveListings;