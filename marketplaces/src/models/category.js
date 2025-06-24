const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Category = sequelize.define(
  "category",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
    },
    keywords: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    parentCategoryId: {
      type: DataTypes.INTEGER,
      references: {
        model: "category", // This is a reference to another model
        key: "id", // This is the column name of the referenced model
      },
    },
    bestSellerIdentified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "category",
    timestamps: true,
    underscored: false,
    indexes: [
      {
        unique: true,
        fields: ["name"],
      },
    ],
  }
);

// Self-referencing association
Category.hasMany(Category, {
  as: "children",
  foreignKey: "parentCategoryId",
});
Category.belongsTo(Category, {
  as: "parentCategory",
  foreignKey: {
    name: "parentCategoryId",
    allowNull: true,
  },
});

module.exports = Category;
