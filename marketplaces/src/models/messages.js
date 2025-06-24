const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config.js");

exports.messages = sequelize.define("messages", {
    userId: {
        type: DataTypes.STRING
    },
    accountName: {
        type: DataTypes.STRING
    },
    sender: {
        type: DataTypes.STRING
    },
    subject: {
        type: DataTypes.STRING,
    },
    message: {
        type: DataTypes.TEXT
    },
    messageId: {
        type: DataTypes.STRING
    },
    itemId: {
        type: DataTypes.STRING,
        defaultValue : null
    },
    received_time: {
        type: DataTypes.DATE
    },
    read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    replied: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    reply: {
        type: DataTypes.STRING,
        defaultValue: ""
    },
    reply_date: {
        type: DataTypes.DATE
    },
    sequence : {
        type : DataTypes.INTEGER
    },
    sentBy : {
        type : DataTypes.STRING  
    }
});