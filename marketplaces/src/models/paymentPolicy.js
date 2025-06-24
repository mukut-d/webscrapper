const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");
const User = require("./user");
const Marketplace = require("./marketplace");

const paymentPolicies = sequelize.define("paymentPolicies", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: "id",
    },
  },
  accountName: {
    type: DataTypes.STRING,
  },
  name: {
    type: DataTypes.STRING,
  },
  paymentPolicyId: {
    type: DataTypes.STRING,
  },
  marketplaceId: {
    type: DataTypes.INTEGER,
    references: {
      model: Marketplace,
      key: "id",
    },
  },
  geoSite: {
    type: DataTypes.STRING,
  },
  policy_details: {
    type: DataTypes.JSON
  },
  copied_acc_name: {
    type: DataTypes.STRING,
  },
  copied_policy_id: {
    type: DataTypes.STRING,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'live'
  },
  error: {
    type: DataTypes.JSON,
    allowNull: true
  }
});

module.exports = paymentPolicies;
