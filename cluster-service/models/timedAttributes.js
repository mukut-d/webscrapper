const { DataTypes } = require('sequelize');
const {sequelize} = require('../database/config.js');

const TimedAttributes = sequelize.define('timedattributes', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  unique_product_id: {
    type: DataTypes.STRING,
  },
  title: {
    type: DataTypes.STRING,
  },
  price: {
    type: DataTypes.STRING,
  },
  brand: {
    type: DataTypes.STRING,
  },
  mrp: {
    type: DataTypes.STRING,
  },
  rating_count: {
    type: DataTypes.INTEGER,
  },
  reviews_count: {
    type: DataTypes.INTEGER,
  },
  rating: {
    type: DataTypes.FLOAT,
  },
  seller: {
    type: DataTypes.STRING,
  },
  seller_rating: {
    type: DataTypes.INTEGER,
  },
  scrap_date: {
    type: DataTypes.DATEONLY,
  },
}, {
  tableName: 'timedattributes',
  timestamps: true,
});

module.exports = TimedAttributes;
