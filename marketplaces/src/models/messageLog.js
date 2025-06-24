const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

exports.MessageLog = sequelize.define("messagelog", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
    },
    sender: {
        type: DataTypes.STRING
    },
    receiver: {
        type: DataTypes.STRING,
    },
    order_number: {
        type: DataTypes.STRING
    },
    status: {
        type: DataTypes.STRING
    },
    send_date: {
        type: DataTypes.DATE
    },
    message: {
        type: DataTypes.TEXT
    }
}, { timestamps: true });