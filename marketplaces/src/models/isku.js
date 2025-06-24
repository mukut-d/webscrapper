const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");
const Marketplace = require("./marketplace");
const User = require("./user");

const isku = sequelize.define("isku", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    isku: {
        type: DataTypes.TEXT,
    },
    costPrice: {
        type: DataTypes.STRING,
    },
    currency: {
        type: DataTypes.STRING
    },
    weight: {
        type: DataTypes.STRING,
        defaultValue: null
    },
    height: {
        type: DataTypes.STRING,
        defaultValue: null
    },
    width: {
        type: DataTypes.STRING,
        defaultValue: null
    },
    depth: {
        type: DataTypes.STRING,
        defaultValue: null
    },
    quantity: {
        type: DataTypes.STRING,
    },
    images: {
        type: DataTypes.ARRAY(DataTypes.STRING),
    },
    title: {
        type: DataTypes.STRING,
    },
    marketplaceId: {
        type: DataTypes.INTEGER,
        references: {
            model: Marketplace,
            key: 'id'
        }
    },
    accountName: {
        type: DataTypes.STRING,
    },
    warehouseLocation: {
        type: DataTypes.STRING,
        defaultValue: null,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'new',

    },
    lowQtyThresh: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isSellerFulfilled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    userId: {
        type: DataTypes.UUID,
        references: {
          model: User,
          key: 'id'
        },
        defaultValue: null,
      },
    created_at: {
        type: "TIMESTAMP",
        field: "created_at",
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        allowNull: false,
    },
    updated_at: {
        type: "TIMESTAMP",
        field: "updated_at",
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
        allowNull: false,
    },
});

module.exports = isku;
