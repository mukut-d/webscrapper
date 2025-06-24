const { Sequelize, DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

exports.MailCron = sequelize.define("mailcron", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    project_id: {
        type: DataTypes.ARRAY(DataTypes.STRING),
    },
    user_id: {
        type: DataTypes.STRING,
    },
    user_email: {
        type: DataTypes.STRING,
    },
    email_time: {
        type: DataTypes.TIME,
    }
}, { timestamps: true });