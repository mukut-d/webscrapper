const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");
const User = require("./user");

const catalogueConfig = sequelize.define("catalogue-config", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    config_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    request: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    userId: {
        type: DataTypes.UUID,
        references: {
          model: User,
          key: 'id'
        },
        defaultValue: null,
    },
    source_account: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    destination_account: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    listing_frequency: {
        type: DataTypes.STRING,
        allowNull: true,
        enum: ["daily", "weekly"],
    },
    config: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    version: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    next_run: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    batch_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 25
    },
    additional_aspects: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    description_update: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: null,
    },
    updateCron: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    updateFields: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: true,
    },
    source_data_filter: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    createdAt: {
        type: "TIMESTAMP",
        field: "created_at",
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        allowNull: false,
    },
    updatedAt: {
        type: "TIMESTAMP",
        field: "updated_at",
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        allowNull: false,
    },
}, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    timezone: '+05:30', 
});

module.exports = catalogueConfig;
