const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");
const User = require("./user");

const inbound = sequelize.define('inbound', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    isku: {
        type: DataTypes.STRING,
    },
    goodQty: {
        type: DataTypes.INTEGER
    },
    badQty: {
        type: DataTypes.INTEGER
    },
    totalQty: {
        type: DataTypes.INTEGER
    },
    userId: {
        type: DataTypes.UUID,
        references: {
            model: User,
            key: "id",
        },
    },
}, { timestamps: true });

module.exports = inbound;