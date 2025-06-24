const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");
const User = require("./user.js");
const Marketplace = require("./marketplace.js");
const Tokens = sequelize.define("tokens", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  userId: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: "id",
    },
  },
  accountName: {
    type: DataTypes.STRING,
  },
  marketPlaceId: {
    type: DataTypes.INTEGER,
    references: {
      model: Marketplace,
      key: "id",
    },
  },
  token: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  expiresIn: {
    type: DataTypes.INTEGER,
  },
  accessToken: {
    type: DataTypes.TEXT,
  },
  refreshToken: {
    type: DataTypes.TEXT,
  },
  refreshTokenExpiresIn: {
    type: DataTypes.INTEGER,
  },
  lastTokenRefreshDate:{
    type: DataTypes.DATE,
  },
  isDataFetched: {
    type: DataTypes.STRING,
  },
  fetchDate: {
    type: DataTypes.DATE
  },
  itemsFetched: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  ordersFetched: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: "active",
  },
  client_id: {
    type: DataTypes.STRING,
  },
  client_secret: {
    type: DataTypes.STRING,
  },
  location_id: {
    type: DataTypes.STRING,
  },
  amzMarketplaceId: {
    type: DataTypes.STRING,
  },
  proxy_details: {
    type: DataTypes.JSONB,
  },
  cartlow_details: {
    type: DataTypes.JSONB,
  },
  sellerId: {
    type: DataTypes.STRING,
  },
  top_banner: {
    type: DataTypes.STRING,
  },
  bottom_banner: {
    type: DataTypes.STRING,
  },
  shop_id:{
    type: DataTypes.STRING,
    defaultValue: null
  },
  fetchItemStatus: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  fetchItemEndReason: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  }
});

Tokens.belongsTo(User, { foreignKey: "userId" });
Tokens.belongsTo(Marketplace, { foreignKey: "marketPlaceId" });

module.exports = Tokens;
