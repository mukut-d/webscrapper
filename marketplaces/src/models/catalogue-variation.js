const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");

const CatalogueVariation = sequelize.define(
  "catalogue_variation",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    channel_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    variation_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    variation: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    price: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    account_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    source_variant_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    config_id: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    config_version: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    transformed_variation: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    marketplace_id: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = CatalogueVariation;
