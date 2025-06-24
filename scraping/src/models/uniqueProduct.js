const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const UniqueProduct = sequelize.define(
  "unique_products",
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
    productId: {
      type: DataTypes.INTEGER,
    },
    projectId: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
    },
    url: {
      type: DataTypes.TEXT,
    },
    ASIN: {
      type: DataTypes.STRING,
    },
    ISBN: {
      type: DataTypes.STRING,
    },
    BestSellersRank: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    Brand: {
      type: DataTypes.STRING,
    },
    Manufacturer: {
      type: DataTypes.STRING,
    },
    PUID: {
      type: DataTypes.STRING,
    },
    categories: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    category: {
      type: DataTypes.STRING,
    },
    currency: {
      type: DataTypes.STRING,
    },
    image: {
      type: DataTypes.TEXT,
    },
    keywordName: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    marketplaceId: {
      type: DataTypes.INTEGER,
    },
    marketplaceName: {
      type: DataTypes.STRING,
    },
    price: {
      type: DataTypes.DOUBLE,
    },
    mrp: {
      type: DataTypes.DOUBLE,
    },
    title: {
      type: DataTypes.TEXT,
    },
    rating: {
      type: DataTypes.DOUBLE,
    },
    totalRatings: {
      type: DataTypes.DOUBLE,
    },
    otherAttributes: {
      type: DataTypes.JSONB,
    },
    variants: {
      type: DataTypes.JSONB,
    },
    seller: {
      type: DataTypes.STRING,
    },
    description: {
      type: DataTypes.TEXT,
    },
    sellerPunditCategory: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    size: {
      type: DataTypes.INTEGER,
      underscored: false,
      allowNull: true,
      defaultValue: null,
    },
    images: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: null,
    },
    author: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    publisher: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    language: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    edition: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    pages: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    cover: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    weight: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    origin: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
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

module.exports = UniqueProduct;
