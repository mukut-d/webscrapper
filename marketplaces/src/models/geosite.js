const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Geosite = sequelize.define(
  "geosite",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true,
      allowNull: false,
    },

    siteId: {
      type: DataTypes.INTEGER,
    },
    marketPlaceId: {
      type: DataTypes.INTEGER,
    },
    globalId: {
      type: DataTypes.STRING,
    },
    currency: {
      type: DataTypes.STRING,
    },
    siteName: {
      type: DataTypes.STRING,
    },
    localeValue: {
      type: DataTypes.STRING,
    },
    languageCode: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    countryName: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    // smallLogo: {
    //   type: DataTypes.STRING,
    //   defaultValue: null
    // },
  },
  { timestamps: true }
);

module.exports = Geosite;
