const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Marketplace = sequelize.define(
  "marketplaces",
  {
    /* Model attributes are defined here */
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    country: {
      type: DataTypes.STRING,
    },
    url: {
      type: DataTypes.STRING,
    },
    searchUrl: {
      type: DataTypes.TEXT,
    },
    idUrl: {
      type: DataTypes.TEXT,
    },
    logo: {
      type: DataTypes.STRING,
    },
    image: {
      type: DataTypes.STRING,
    },
    parentMarketplace: {
      type: DataTypes.STRING,
    },
    childMarketplace: {
      type: DataTypes.STRING,
    },
    maxByDefault: {
      type: DataTypes.BOOLEAN,
    },
    ISBNAllowed: {
      type: DataTypes.BOOLEAN,
    },
    ISBNLimit: {
      type: DataTypes.INTEGER,
    },
    ASINAllowed: {
      type: DataTypes.BOOLEAN,
    },
    ASINLimit: {
      type: DataTypes.INTEGER,
    },
    keyWordSearchAllowed: {
      type: DataTypes.BOOLEAN,
    },
    keyWordSearchLimit: {
      type: DataTypes.INTEGER,
    },
    privateDomainAllowed: {
      type: DataTypes.BOOLEAN,
    },
    perfomanceCalculationType: {
      type: DataTypes.STRING,
    },
    performanceInputType: {
      type: DataTypes.STRING,
    },
    performanceHelpText: {
      type: DataTypes.STRING,
    },
    isVisibleOnNewLaunch: {
      type: DataTypes.BOOLEAN,
    },
    isVisibleOnCatalogPush: {
      type: DataTypes.BOOLEAN,
    },
    visibleTo: {
      type: DataTypes.STRING,
    },
    user_id: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: null,
    },
    marketplaceId: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    status: {
      type: Sequelize.ENUM,
      values: ["active", "inactive"],
      defaultValue: "active",
    },
    byKeyword: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    byCategory: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    byUrl: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    byId: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // marketplaceDown: {
    //   type: DataTypes.BOOLEAN,
    // },
    // proxyCountry: {
    //   type: DataTypes.ARRAY(DataTypes.STRING)
    // },
    vendor_id: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      allowNull: true,
    },
    // currentVendor: {
    //   type: DataTypes.STRING
    // },
    // currentVendorStartedAt: {
    //   type: DataTypes.DATE,
    // },
    // lastVendor: {
    //   type: DataTypes.STRING,
    // },
    // lastVendorStoppedAt: {
    //   type: DataTypes.STRING,
    // },
    // keywordjobJsRendering: {
    //   type: DataTypes.BOOLEAN
    // },
    // ProductIdJsRendering: {
    //   type: DataTypes.BOOLEAN
    // },
    // customerSegment: {
    //   type: DataTypes.ENUM,
    //   values: ["premium", "normal"]
    // },
    mandatory_attributes_1st: {
      type: DataTypes.JSONB,
    },
    mandatory_attributes_nth: {
      type: DataTypes.JSONB,
    },
    proxy_country: {
      type: DataTypes.ARRAY(DataTypes.STRING),
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
  },
  {
    createdAt: "created_at",
    updatedAt: "updated_at",
    timestamps: true,
    underscored: true,
  }
);

module.exports = Marketplace;
