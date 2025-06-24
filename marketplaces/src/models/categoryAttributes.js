const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");
const categoryAttributes = sequelize.define(
  "categoryAttributes",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    marketPlaceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    categoryName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    attributes: {
        type: DataTypes.JSONB, 
        allowNull: false,
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
);

module.exports = categoryAttributes;
