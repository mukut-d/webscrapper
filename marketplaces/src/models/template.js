  const { Sequelize, DataTypes } = require("sequelize");
  const { sequelize } = require("../database/config");

  const Template = sequelize.define(
    "template",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      template_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      template_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      json_data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      html: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      ejs: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      ejsKeys: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        field: "ejsKeys"
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW,
      },
      is_public: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      ejsKeys: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        field: "ejsKeys"
      },
    },
    {
      tableName: "templates",
      timestamps: true,
      underscored: true,
    }
  );

  module.exports = Template;