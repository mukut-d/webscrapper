const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");
const User = require("./user.js");

const Catalogue = sequelize.define(
  "catalogue-catagory",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: "id",
      },
      allowNull:true
    },
    accountName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    marketPlace: {
      type: DataTypes.INTEGER,
    },
    categoryId: {
      type: DataTypes.INTEGER,
    },
    categoryName: {
      type: DataTypes.STRING,
    },
    parentCategory:
    {
      type: DataTypes.INTEGER,

    },
    categoryTree: {
      type: DataTypes.STRING,
    },
    leafCategoryTreeNode: {
      type: DataTypes.BOOLEAN,
    },
    siteId: {
      type: DataTypes.INTEGER,
    },
    isStoreCategory: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  },
  { timestamps: true }
);


module.exports = Catalogue;
