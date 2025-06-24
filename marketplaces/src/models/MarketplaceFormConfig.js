const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");

const MarketplaceFormConfig = sequelize.define(
  "MarketplaceFormConfig",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    marketPlaceId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false
    }
  }, {
    tableName: 'marketplace_form_config',
    timestamps: false
  } 
);

module.exports = MarketplaceFormConfig;
