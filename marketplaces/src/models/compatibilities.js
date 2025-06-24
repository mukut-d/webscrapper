const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");

const Compatibility = sequelize.define(
  "compatibilities",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      defaultValue: sequelize.literal("nextval('compatibilities_id_seq'::regclass)")
    },
    make: {
      type: DataTypes.STRING,
      allowNull: true
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true
    },
    year: {
      type: DataTypes.STRING,
      allowNull: true
    },
    variant: {
      type: DataTypes.STRING,
      allowNull: true
    },
    submodel: {
      type: DataTypes.STRING,
      allowNull: true
    },
    trim: {
      type: DataTypes.STRING,
      allowNull: true
    },
    geo_site: {
      type: DataTypes.STRING,
      allowNull: true
    },
    epid: {
      type: DataTypes.STRING,
      allowNull: true
    },
    engine: {
      type: DataTypes.STRING,
      allowNull: true
    },
    power: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    epid_1: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    epid_2: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    epid_3: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    aum_submodel: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    Vehicle_Type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    Machine_Type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    relationship: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    relationship_type: {
      type: DataTypes.STRING(256),
      allowNull: true
    },
    aum_make: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    aum_model: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    aum_power: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: 'compatibilities',
    timestamps: false,
  }
);

module.exports = Compatibility;