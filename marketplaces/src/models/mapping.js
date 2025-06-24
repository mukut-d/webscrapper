const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Mapping = sequelize.define('mapping', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mappings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Default Mapping'
    }
  }, {
    timestamps: true
  });

module.exports = Mapping;
