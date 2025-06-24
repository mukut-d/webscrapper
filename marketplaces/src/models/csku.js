const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");
const User = require("./user");
const Marketplace = require("./marketplace");
const csku = sequelize.define(
  "csku",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    groupProductId: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    offerId: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    siteId: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    channelId: {
      type: DataTypes.STRING,
    },
    variantId: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    isku: {
      type: DataTypes.TEXT,
    },
    currency: {
      type: DataTypes.STRING,
    },
    price: {
      type: DataTypes.STRING,
    },
    country : {
      type: DataTypes.STRING,
      allowNull : true
    },
    conditionId : {
      type:DataTypes.INTEGER, 
      allowNull : true
    },
    images: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    title: {
      type: DataTypes.TEXT,
    },
    description: {
      type: DataTypes.TEXT,
    },
    packageType: {
      type: DataTypes.TEXT,
    },
    quantity: {
      type: DataTypes.STRING,
    },
    quantityLimitPerBuyer: {
      type: DataTypes.STRING
    },
    mrp: {
      type: DataTypes.STRING,
    },
    categoryId: {
      type: DataTypes.STRING,
    },
    categoryName: {
      type: DataTypes.STRING,
    },
    storeCategoryId: {
      type: DataTypes.STRING,
    },
    storeCategoryName: {
      type: DataTypes.STRING,
    },
    collections: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    weight: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    weightUnit: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    height: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    width: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    unit: {
      type: DataTypes.STRING,
    },
    depth: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    marketplaceId: {
      type: DataTypes.INTEGER,
    },
    accountName: {
      type: DataTypes.STRING,
    },
    userId: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: "id",
      },
    },
    itemSpecifics: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    itemCompatibility: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    sellerProfile: {
      type: DataTypes.JSONB,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "live",
    },
    errors: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    languageCode: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    copied_to_account: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    sku_found: {
      type: DataTypes.BOOLEAN,
    },
    is_migrated: {
      type: DataTypes.BOOLEAN,
    },
    variation: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: null
    },
    variantImage : {
      type: DataTypes.STRING,
      defaultValue: null
    },
    merchantLocation: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    threshhold: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    noOfRetries: {
      type: DataTypes.INTEGER,
      defaultValue: 2
    },
    quantiyUpdationStatus:{
      type: DataTypes.STRING,
      defaultValue: null
    },
    quantityUpdateErrors: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    quantityUpdateDate: {
      type: DataTypes.DATE,
    },
    partnerSku: {
      type: DataTypes.STRING,
    },
    variationId: {
      type: DataTypes.STRING,
    },
    productId: {
      type: DataTypes.STRING,
      defaultValue : null
    },
    productIdType: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    brand: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    variantGroupId:{
      type: DataTypes.STRING,
      allowNull : true
    },
    mustShipAlone: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    videos: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    config_id:{
      type: DataTypes.STRING,
      defaultValue:null
    },
    config_version:{
      type: DataTypes.STRING,
      defaultValue:null
    },
    aPlusDescription: {
      type: DataTypes.STRING,
    },
    end_date: {
      type: DataTypes.DATE,
      defaultValue: null,
      allowNull: true,
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
    indexes: [
      { fields: ["userId"], },
      { fields: ["marketplaceId"], },
      { fields: ["accountName"], },
    ],
  }
);
// Add associations after the model definition
csku.belongsTo(User, {
  foreignKey: "userId",
  as: "user"
});

// Update the association alias to match what's expected
csku.belongsTo(Marketplace, {
  foreignKey: "marketplaceId",
  as: "marketplaces"
});

module.exports = csku;
