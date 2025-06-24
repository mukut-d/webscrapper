const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Currency = sequelize.define(
  "currency",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true,
      allowNull: false,
    },

    currency: {
      type: DataTypes.STRING,
    },
    value: {
      type: DataTypes.FLOAT,
    },
    newCurrency: {
      type: DataTypes.STRING,
    },
    newValue: {
      type: DataTypes.FLOAT,
    },
  }, 
  { timestamps: true }
);

module.exports = Currency;
