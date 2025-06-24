const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");

exports.emailTemplate = sequelize.define("emailtemplate", {
    id: {
        type: DataTypes.INTEGER,   
        primaryKey: true,
        autoIncrement: true,       
        allowNull: false  
    },
    name: {
        type: DataTypes.STRING,
    },
    marketplaces: {
        type: DataTypes.STRING,
    },
    accountName: {
        type: DataTypes.STRING,
    },
    subject: {
        type: DataTypes.STRING,
    },
    title: {
        type: DataTypes.STRING,
    },
    content: {
        type: DataTypes.TEXT,
    },
    sendingtrigger: {
        type: DataTypes.STRING,
    },
    sendafter: {
        type: DataTypes.STRING,
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    email_sent_status: {
        type: DataTypes.STRING,
    },
    userId: {
        type: DataTypes.STRING,
    },
    sender_email: {
        type: DataTypes.STRING
    },
    email_template: {
        type: DataTypes.TEXT
    },
    order_status: {
        type: DataTypes.STRING
    },
    email_sent_time: {
        type: DataTypes.DATE
    },
});