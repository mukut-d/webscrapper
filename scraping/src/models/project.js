const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const Project = sequelize.define(
  "projects",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
    },
    userId: {
      type: DataTypes.STRING,
    },
    projectuuid: {
      type: DataTypes.STRING,
      defaultValue: Sequelize.UUIDV4,
    },
    filePath: {
      type: DataTypes.TEXT,
    },
    fileOriginalName: {
      type: DataTypes.TEXT,
    },
    description: {
      type: DataTypes.TEXT,
    },
    marketplaces: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "started",
    },
    variant: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    competitors: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    productCount: {
      type: DataTypes.INTEGER,
    },
    projectStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    to_be_scraped: {
      type: DataTypes.BOOLEAN,
    },
    is_frequency: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    frequency_time: {
      type: DataTypes.TIME,
    },
    scrap_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    first_fetch: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    price_comparision: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    compare_marketplaces: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    mandatory_attributes: {
      type: DataTypes.JSONB,
    },
    createdAt: {
      type: "TIMESTAMP",
      field: "createdAt",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
    updatedAt: {
      type: "TIMESTAMP",
      field: "updatedAt",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
  },
  {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    timestamps: true,
    underscored: true,
  }
);

module.exports = Project;
