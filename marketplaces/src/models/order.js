const { DataTypes } = require("sequelize");
const { sequelize } = require("../database/config");
const Marketplace = require("./marketplace");
const User = require("./user");

const order = sequelize.define("order", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
    },
    orderId: {
        type: DataTypes.STRING,
    },
    creationDate: {
        type: DataTypes.DATE,
    },
    lastModifiedDate: {
        type: DataTypes.DATE,
    },
    orderFulfillmentStatus: {
        type: DataTypes.STRING,
    },
    orderPaymentStatus: {
        type: DataTypes.STRING,
    },
    sellerId: {
        type: DataTypes.STRING,
    },
    buyerUserName: {
        type: DataTypes.STRING,
    },
    buyerRegistrationAddress: {
        type: DataTypes.JSONB,
    },
    pricingSummary: {
        type: DataTypes.JSONB,
    },
    payments: {
        type: DataTypes.JSONB,
    },
    shippedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },
    // minEstimatedDeliveryDate: {
    //     type: DataTypes.DATE,
    // },
    // maxEstimatedDeliveryDate: {
    //     type: DataTypes.DATE,
    // },
    // shippingStep: {
    //     type: DataTypes.JSONB
    // },
    fulfillmentStartInstructions: {
        type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    items: {
        type: DataTypes.ARRAY(DataTypes.JSONB),
    },
    totalMarketplaceFee: {
        type: DataTypes.JSONB,
    },
    status: {
        type: DataTypes.ENUM,
        values: ['pending', 'unpaid', 'paid', 'confirmed', 'in_progress', 'packed', 'to_be_shipped', 'partially_shipped', 'shipped', 'delivered', "invoice generated", "cancel_requested", 'canceled', 'return_requested', 'return_accepted', 'return_in_progress', 'return_complete', 'refunded', 'problematic order', "cancel_rejected"]
    },
    marketplaceId: {
        type: DataTypes.INTEGER,
        references: {
            model: Marketplace,
            key: 'id'
        }
    },
    returnId: {
        type: DataTypes.STRING,
        defaultValue: null
    },
    cancelId: {
        type: DataTypes.STRING,
    },
    fulfillmentId: {
        type: DataTypes.STRING,
    },
    shipmentId: {
        type: DataTypes.STRING
    },
    accountName: {
        type: DataTypes.STRING
    },
    userId: {
        type: DataTypes.UUID,
        references: {
            model: User,
            key: 'id'
        },
        defaultValue: null,
    },
    deliveryDate: {
        type: DataTypes.DATE,
        defaultValue: null,
        allowNull: true
    },
    packageIds: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: null
    },
    cartlowErrors: {
        type: DataTypes.TEXT,
        defaultValue: null
    },
    cartlow_order_id: {
        type: DataTypes.STRING,
        defaultValue: null
    }
});

module.exports = order;