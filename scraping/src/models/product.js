const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Product = sequelize.define(
  "products",
  {
    /* Model attributes are defined here */
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
    },
    PUID: {
      type: DataTypes.STRING,
      underscored: false,
    },
    url: {
      type: DataTypes.TEXT,
    },
    owned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    insertionType: {
      type: DataTypes.ENUM(["byId", "byKeyword", "byUrl", "byCategory"]),
    },
    isScraped: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "active",
    },
    listingPosition: {
      type: DataTypes.INTEGER,
    },
    matchCount: {
      type: DataTypes.INTEGER,
    },
    domain: {
      type: DataTypes.STRING,
      underscored: false,
    },
    projectId: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
    },
    uniqueproductId: {
      type: DataTypes.STRING,
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

module.exports = Product;
