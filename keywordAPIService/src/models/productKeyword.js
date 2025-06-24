const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const ProductKeyWord = sequelize.define(
  "productKeywords",
  {
    /* Model attributes are defined here */
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    projectId: {
      type: DataTypes.INTEGER,
    },
    productId: {
      type: DataTypes.INTEGER,
    },
    keyword: {
      type: DataTypes.TEXT,
      underscored: false,
    },
    puid: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    marketplace: {
      type: DataTypes.STRING,
      underscored: false,
    },
    scrapingCount: {
      type: DataTypes.INTEGER,
    },
    scrapSuccessCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      underscored: false,
    },
    pagesPushed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      underscored: false,
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
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    timestamps: true,
    underscored: true,
  }
);

module.exports = ProductKeyWord;
