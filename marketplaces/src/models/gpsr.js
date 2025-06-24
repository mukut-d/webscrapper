const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");
const User = require("./user.js");
const Marketplace = require("./marketplace.js");

const Gpsr = sequelize.define(
  "Gpsr",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    company_name: {
      type: DataTypes.TEXT,
    },
    contact_url: {
      type: DataTypes.TEXT,
    },
    email: {
      type: DataTypes.TEXT,
    },
    phone: {
      type: DataTypes.TEXT,
    },
    street1: {
      type: DataTypes.TEXT,
    },
    street2: {
      type: DataTypes.TEXT,
    },
    postal_code: {
      type: DataTypes.TEXT,
    },
    city: {
      type: DataTypes.TEXT,
    },
    state: {
      type: DataTypes.TEXT,
    },
    country: {
      type: DataTypes.TEXT,
    },
    type: {
      type: DataTypes.TEXT,
    },
    account_name: {
      type: DataTypes.TEXT,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'userId', // 👈 This tells Sequelize to use the exact column name
      references: {
        model: User,
        key: "id",
      },
    },
    marketplace_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'marketplace_id', // optional if the column is already in snake_case
      references: {
        model: Marketplace,
        key: "id",
      },
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  },
  {
    tableName: "gpsr",
    timestamps: true,
    underscored: false,
  }
);

module.exports = Gpsr;
