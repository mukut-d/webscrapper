const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

const User = sequelize.define(
  "user",
  {
    /* Model attributes are defined here */ 
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
    },
    password: {
      type: DataTypes.STRING,
    },
    salt: {
      type: DataTypes.STRING,
    },
    // googleId: {
    //   type: DataTypes.STRING,
    //   // field: "googleId",
    // },
    // linkedinId: {
    //   type: DataTypes.STRING,
    //   // field: "linkedinId",
    // },
    provider: {
      type: DataTypes.STRING,
    },
    // IsVerified: {
    //   type: DataTypes.BOOLEAN,
    //   defaultValue: false,
    //   // field: "IsVerified",
    // },
    secret: {
      type: DataTypes.STRING,
    },
    category: {
      type: DataTypes.JSONB,
    },
    jwt_token: {
      type: DataTypes.TEXT,
    },
    resetPasswordToken: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    signupToken: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    parentId: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: null 
    },
    firstName: { 
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: { 
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    accountExist: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    createdAt: {
      type: "TIMESTAMP",
      // field: "createdAt",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
    updatedAt: {
      type: "TIMESTAMP",
      // field: "updatedAt",
      defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      allowNull: false,
    },
  },
  {
    tableName: "user",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    timestamps: true,
    underscored: true,
  }
);

module.exports = User;
