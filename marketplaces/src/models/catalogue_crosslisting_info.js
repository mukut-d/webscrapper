const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");

const CatalogueCrosslistingInfo = sequelize.define("catalogue_crosslisting_info", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    source_channel_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    dest_channel_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    source_account_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    dest_account_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    timestamps: true,
});

module.exports = CatalogueCrosslistingInfo;