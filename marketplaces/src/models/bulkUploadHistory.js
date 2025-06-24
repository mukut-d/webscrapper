const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");
const { HistoryStatus } = require("../utils/enum.js");
const User = require("./user.js");
const Marketplace = require("./marketplace.js");

const BulkUploadHistory = sequelize.define(
  "BulkUploadHistory",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    actionType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: "id",
      },
    },
    sourceAccountName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    destinationAccountName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    marketplaceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    merchantLocationKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    categoryData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    paymentPolicy: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    returnPolicy: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    fulfillmentPolicy: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    siteId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    uploadedFilePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    errorFilePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    totalItems: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    successItems: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    failedItems: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(Object.values(HistoryStatus)),
      allowNull: false,
    },
    createdAt: {
      type: "TIMESTAMP",
      field: "createdAt",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
    updatedAt: {
      type: "TIMESTAMP",
      field: "updatedAt",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
  },
  {
    timestamps: true,
    underscored: false,
  }
);

module.exports = BulkUploadHistory;
