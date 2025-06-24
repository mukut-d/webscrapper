const { sequelize } = require("../database/config.js");
const { INTEGER, UUID, STRING } = require("sequelize");

const FormulaConfigs = sequelize.define("formulaConfigs", {
    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false, //TODO - required:true
        unique: true,
    },
    userId: {
        type: UUID,
    },
    accountName: {
        type: STRING,
    },
    marketplaceId: {
        type: INTEGER,
    },
    formula: {
        type: STRING,
    },
    status: {
        type: STRING,
        defaultValue: "active",
    },
});

module.exports = FormulaConfigs;
