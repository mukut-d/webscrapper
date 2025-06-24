const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const scrapingVendor = sequelize.define(
  "scrapingvendor",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    scraping_method: {
      type: DataTypes.ENUM,
      values: ["api", "proxy"],
    },
    username: {
      type: DataTypes.STRING,
    },
    password: {
      type: DataTypes.STRING,
    },
    api_url: {
      type: DataTypes.STRING,
    },
    countries_available: {
      type: DataTypes.STRING,
    },
    proxy: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    status: {
      type: DataTypes.ENUM,
      values: ["active", "blocked", "risk"],
      defaultValue: "active",
    },
    multiple_calls_supported: {
      type: DataTypes.BOOLEAN,
    },
    options: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  { timestamps: true, underscored: true }
);

module.exports = scrapingVendor;
