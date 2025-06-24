const axios = require("axios");
const order = require("../../models/order");
const csku = require("../../models/csku");
const isku = require("../../models/isku");
const Tokens = require("../../models/tokens");
const moment = require("moment");
const { uploadToS3 } = require("../../utils/uploadToS3");
const { getAccessToken } = require("./tokens");
const uuidv4 = require("uuid").v4;

exports.getInventory = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, locationId, skuId } = req.body;

        if (!locationId || !skuId) {
            return res.status(400).json({
                success: false,
                message: 'Location ID and SKU ID is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/inventory/2021-01-06/locations/${locationId ?? ""}/skus/${skuId ?? ""}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        };


        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

exports.updateInventory = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, locationId, skuId, quantity } = req.body;

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
        let config = {
            method: 'put',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/inventory/2021-01-06/locations/${locationId}/skus/${skuId}?quantity=${quantity}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        };


        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error(error.response.data);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getShipments = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, locationId, status, lastUpdatedAfter, lastUpdatedBefore, maxResults, marketplaceId, type, accountName, userId } = req.body;
        console.log(req.body.type);
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'status is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        const url = `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments?locationId=${locationId ?? ""}&status=${status ?? ""}&maxResults=${maxResults ?? ""}&lastUpdatedAfter=${lastUpdatedAfter ?? ""}&lastUpdatedBefore=${lastUpdatedBefore ?? ""}`;
        console.log(url);
        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: url,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.request(config);

        await pushOrderData(response.data.shipments, status, marketplaceId, accountName, userId, type);

        if (response.data.nextToken) {

            let nextToken = response.data.nextToken;

            while (nextToken) {
                let config = {
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments?locationId=${locationId ?? ""}&status=${status ?? ""}&maxResults=${maxResults ?? ""}&nextToken=${nextToken ?? ""}&lastUpdatedAfter=${lastUpdatedAfter ?? ""}&lastUpdatedBefore=${lastUpdatedBefore ?? ""}`,
                    headers: {
                        'x-amz-access-token': accessToken,
                        'Content-Type': 'application/json'
                    }
                };

                const response = await axios.request(config);

                nextToken = response.data.nextToken;

                await pushOrderData(response.data.shipments, status, marketplaceId, accountName, userId, type);

            }


        }

        return res.status(200).json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error("getShipmentsError:", error);
        
        await apiCallLog("getShipments", "getShipments", "Failed", {}, {}, { error: error.message }, "error");
        
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

async function pushOrderData(data, status, marketplaceId, accountName, userId, type) {
    try {
        console.log(data, type);
        if (Array.isArray(data) && data.length > 0) {
            const orderData = await Promise.all(data.map(async (ord) => {

                const inProgressStatus = ["PICKUP_SLOT_RETRIEVED", "INVOICE_GENERATED", "SHIPLABEL_GENERATED"];

                let orderStatus = "";
                let cartlowErrors = "";
                if (status == "ACCEPTED") {
                    orderStatus = "paid";
                } if (status == 'CONFIRMED') {
                    orderStatus = "confirm";
                } else if (status == "UNFULFILLABLE") {
                    orderStatus = "problematic order";
                } else if (inProgressStatus.includes(status)) {
                    orderStatus = "in_progress";
                } else if (status == "PACKAGE_CREATED") {
                    orderStatus = "packed";
                } else if (status == "SHIPPED") {
                    orderStatus = "shipped";
                } else if (status == "DELIVERED") {
                    orderStatus = "delivered";
                } else if (status == "CANCELLED") {
                    orderStatus = "canceled";
                }

                const orderExist = await order.findOne({
                    where: {
                        orderId: ord.metadata.buyerOrderId
                    }
                });
                if (orderExist && orderStatus == "delivered" && orderExist.dataValues.status != "delivered") {
                    if (orderExist.dataValues.cartlow_order_id && orderExist.dataValues.cartlow_order_id != null && type == 'cron') {
                        const token = await Tokens.findOne({
                            where: {
                                userId: userId,
                                marketPlaceId: marketplaceId,
                                accountName: accountName
                            },
                            raw: true
                        });

                        let data = JSON.stringify({
                            "email": "amazon.flex@cartlow.com",
                            "password": token.cartlow_details[0].password ?? "Cartlow@123"
                        });

                        let config = {
                            method: 'post',
                            maxBodyLength: Infinity,
                            url: 'https://www.cartlow.com/api/omni/generate-token',
                            headers: {
                                'Content-Type': 'application/json',
                                'Cookie': 'algolia_user_data=%7B%22algolia_user_token%22%3A%22ad28768ad80502731a62340cf09fd69a%22%2C%22user_id%22%3A0%2C%22ip_address%22%3A%22182.65.206.19%22%2C%22updated_at%22%3A%222024-09-06%2015%3A32%3A05%22%7D'
                            },
                            data: data
                        };

                        let cartLowToken = "";
                        await axios.request(config)
                            .then(async (response) => {

                                if (response.data.error) {
                                    orderExist.cartlowErrors = JSON.stringify(response.data);

                                    let mailOptions = {
                                        from: process.env.FROM_EMAIL,
                                        to: "ramshad@cartlow.com",
                                        cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                                        subject: "Cartlow Order Error",
                                        text: `The cartlow order updation errored out for order id ${ord.metadata.buyerOrderId} with error ${JSON.stringify(response.data)}`,
                                    };

                                    try {
                                        await sendUpdateReportEmail(mailOptions);
                                    } catch (err) {
                                        console.log(err);
                                        await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
                                    }
                                } else {
                                    cartLowToken = response.data.token;
                                }
                            })
                            .catch((error) => {
                                console.log(error);
                            });

                        let cancelOrder = JSON.stringify({
                            "status": "Delivered"
                        });

                        let cancelOrderConfig = {
                            method: 'post',
                            maxBodyLength: Infinity,
                            url: `https://www.cartlow.com/api/omni/update-order-status/${orderExist.dataValues.cartlow_order_id}`,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': "Bearer " + cartLowToken,
                                'Cookie': 'algolia_user_data=%7B%22algolia_user_token%22%3A%22ad28768ad80502731a62340cf09fd69a%22%2C%22user_id%22%3A0%2C%22ip_address%22%3A%22182.65.206.19%22%2C%22updated_at%22%3A%222024-09-06%2015%3A32%3A05%22%7D'
                            },
                            data: cancelOrder
                        };

                        await axios.request(cancelOrderConfig).then(async (response) => {
                            if (response.data.error) {
                                orderExist.cartlowErrors = JSON.stringify(response.data);

                                let mailOptions = {
                                    from: process.env.FROM_EMAIL,
                                    to: "ramshad@cartlow.com",
                                    cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                                    subject: "Cartlow Order Error",
                                    text: `The cartlow order updation errored out for order id ${ord.metadata.buyerOrderId} with error ${JSON.stringify(response.data)}`,
                                };

                                try {
                                    await sendUpdateReportEmail(mailOptions);
                                } catch (err) {
                                    console.log(err);
                                    await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
                                }
                            }
                            console.log(response.data);
                        }).catch((error) => {
                            console.log(error);
                            orderExist.cartlowErrors = JSON.stringify(error);
                        });

                    }

                    orderExist.status = orderStatus;
                    await orderExist.save();

                    return null;
                } else if (orderExist && orderStatus == "canceled" && orderExist.dataValues.status != "canceled") {
                    if (orderExist.dataValues.cartlow_order_id && orderExist.dataValues.cartlow_order_id != null && type == 'cron') {
                        const token = await Tokens.findOne({
                            where: {
                                userId: userId,
                                marketPlaceId: marketplaceId,
                                accountName: accountName
                            },
                            raw: true
                        });

                        let data = JSON.stringify({
                            "email": "amazon.flex@cartlow.com",
                            "password": token.cartlow_details[0].password ?? "Cartlow@123"
                        });

                        let config = {
                            method: 'post',
                            maxBodyLength: Infinity,
                            url: 'https://www.cartlow.com/api/omni/generate-token',
                            headers: {
                                'Content-Type': 'application/json',
                                'Cookie': 'algolia_user_data=%7B%22algolia_user_token%22%3A%22ad28768ad80502731a62340cf09fd69a%22%2C%22user_id%22%3A0%2C%22ip_address%22%3A%22182.65.206.19%22%2C%22updated_at%22%3A%222024-09-06%2015%3A32%3A05%22%7D'
                            },
                            data: data
                        };

                        let cartLowToken = "";
                        await axios.request(config)
                            .then(async (response) => {

                                if (response.data.error) {
                                    orderExist.cartlowErrors = JSON.stringify(response.data);

                                    let mailOptions = {
                                        from: process.env.FROM_EMAIL,
                                        to: "ramshad@cartlow.com",
                                        cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                                        subject: "Cartlow Order Error",
                                        text: `The cartlow order updation errored out for order id ${ord.metadata.buyerOrderId} with error ${JSON.stringify(response.data)}`,
                                    };

                                    try {
                                        await sendUpdateReportEmail(mailOptions);
                                    } catch (err) {
                                        console.log(err);
                                        await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
                                    }
                                } else {
                                    cartLowToken = response.data.token;
                                }
                            })
                            .catch((error) => {
                                console.log(error);
                            });

                        let cancelOrder = JSON.stringify({
                            "status": "Cancelled"
                        });

                        let cancelOrderConfig = {
                            method: 'post',
                            maxBodyLength: Infinity,
                            url: `https://www.cartlow.com/api/omni/update-order-status/${orderExist.dataValues.cartlow_order_id}`,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': "Bearer " + cartLowToken,
                                'Cookie': 'algolia_user_data=%7B%22algolia_user_token%22%3A%22ad28768ad80502731a62340cf09fd69a%22%2C%22user_id%22%3A0%2C%22ip_address%22%3A%22182.65.206.19%22%2C%22updated_at%22%3A%222024-09-06%2015%3A32%3A05%22%7D'
                            },
                            data: cancelOrder
                        };

                        await axios.request(cancelOrderConfig).then(async (response) => {
                            if (response.data.error) {
                                orderExist.cartlowErrors = JSON.stringify(response.data);

                                let mailOptions = {
                                    from: process.env.FROM_EMAIL,
                                    to: "ramshad@cartlow.com",
                                    cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                                    subject: "Cartlow Order Error",
                                    text: `The cartlow order updation errored out for order id ${ord.metadata.buyerOrderId} with error ${JSON.stringify(response.data)}`,
                                };

                                try {
                                    await sendUpdateReportEmail(mailOptions);
                                } catch (err) {
                                    console.log(err);
                                    await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
                                }
                            }
                            console.log(response.data);
                        }).catch((error) => {
                            console.log(error);
                            orderExist.cartlowErrors = JSON.stringify(error);
                        });

                    }

                    orderExist.status = orderStatus;
                    await orderExist.save();

                    return null;
                } else if (orderExist && orderExist.dataValues.status != orderStatus) {
                    orderExist.status = orderStatus;
                    await orderExist.save();
                    return null;
                } else if (orderExist) {
                    return null;
                }

                let cartLowOrder = "";

                if (type == 'cron' && status == "ACCEPTED") {

                    const token = await Tokens.findOne({
                        where: {
                            userId: userId,
                            marketPlaceId: marketplaceId,
                            accountName: accountName
                        },
                        raw: true
                    });

                    let data = JSON.stringify({
                        "email": "amazon.flex@cartlow.com",
                        "password": token.cartlow_details[0].password ?? "Cartlow@123"
                    });

                    let config = {
                        method: 'post',
                        maxBodyLength: Infinity,
                        url: 'https://www.cartlow.com/api/omni/generate-token',
                        headers: {
                            'Content-Type': 'application/json',
                            'Cookie': 'algolia_user_data=%7B%22algolia_user_token%22%3A%22ad28768ad80502731a62340cf09fd69a%22%2C%22user_id%22%3A0%2C%22ip_address%22%3A%22182.65.206.19%22%2C%22updated_at%22%3A%222024-09-06%2015%3A32%3A05%22%7D'
                        },
                        data: data
                    };

                    let cartLowToken = "";
                    await axios.request(config)
                        .then(async (response) => {

                            if (response.data.error) {
                                cartlowErrors = JSON.stringify(response.data);

                                let mailOptions = {
                                    from: process.env.FROM_EMAIL,
                                    to: "ramshad@cartlow.com",
                                    cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                                    subject: "Cartlow Order Error",
                                    text: `The cartlow token generation failed with error ${JSON.stringify(response.data)}`,
                                };

                                try {
                                    await sendUpdateReportEmail(mailOptions);
                                } catch (err) {
                                    console.log(err);
                                    await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
                                }

                            } else {
                                cartLowToken = response.data.token;
                            }
                        })
                        .catch((error) => {
                            console.log(error);
                            cartlowErrors = JSON.stringify(error);
                        });

                    let lineItems = [];
                    for (var i = 0; i < ord.lineItems.length; i++) {
                        console.log(ord.lineItems[i].merchantSku);
                        const item = await csku.findOne({
                            where: {
                                isku: ord.lineItems[i].merchantSku
                            }
                        });

                        lineItems.push({
                            "sku_id": item.dataValues.variationId,
                            "item_id": item.dataValues.partnerSku,
                            "quantity": ord.lineItems[i].numberOfUnits,
                            "price": item.dataValues.mrp,
                        })

                    }
                    let createOrder = JSON.stringify({
                        "order_id": ord.metadata.buyerOrderId,
                        "marketplace": 7,
                        "buyer_address": {
                            "full_name": "Akhlaq Test",
                            "phone_no": 9723423422,
                            "email": "test",
                            "address1": "test address",
                            "city": "city",
                            "state": "state",
                            "country_id": "1",
                            "country_name": "UAE",
                            "zipcode": "2342342",
                            "nick_name": "home"
                        },
                        "items": lineItems
                    });

                    let createOrderConfig = {
                        method: 'post',
                        maxBodyLength: Infinity,
                        url: 'https://www.cartlow.com/api/omni/place-order',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': "Bearer " + cartLowToken,
                            'Cookie': 'algolia_user_data=%7B%22algolia_user_token%22%3A%22ad28768ad80502731a62340cf09fd69a%22%2C%22user_id%22%3A0%2C%22ip_address%22%3A%22182.65.206.19%22%2C%22updated_at%22%3A%222024-09-06%2015%3A32%3A05%22%7D'
                        },
                        data: createOrder
                    };
                    await axios.request(createOrderConfig)
                        .then(async (response) => {
                            console.log(JSON.stringify(response.data));
                            if (response.data.error) {
                                cartlowErrors = JSON.stringify(response.data);

                                let mailOptions = {
                                    from: process.env.FROM_EMAIL,
                                    to: "ramshad@cartlow.com",
                                    cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                                    subject: "Cartlow Order Error",
                                    text: `The cartlow order creation errored out for order id ${ord.metadata.buyerOrderId} with error ${JSON.stringify(response.data)}`,
                                };

                                try {
                                    await sendUpdateReportEmail(mailOptions);
                                } catch (err) {
                                    console.log(err);
                                    await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
                                }

                            } else {
                                cartLowOrder = response.data.order_id;
                            }
                        })
                        .catch(async (error) => {
                            console.log(typeof error);
                            await apiCallLog("Cartlow", "Order Creation", "Failed", {}, {}, { error: error.message }, "error");
                            cartlowErrors = JSON.stringify(error);
                        });

                }

                return {
                    orderId: ord.metadata.buyerOrderId,
                    creationDate: ord.creationDateTime,
                    lastModifiedDate: ord.lastUpdatedDateTime,
                    orderFulfillmentStatus: status == 'SHIPPED' ? 'fulfilled' : 'unfulfilled',
                    sellerId: accountName,
                    buyerRegistrationAddress: {
                        postalCode:
                            ord.shippingInfo.shipToAddress.postalCode
                    },
                    pricingSummary: ord.charges?.find(charge => charge.chargeType == 'total'),
                    payments: ord.paymentSummary?.charges,
                    items: ord.lineItems?.map((line) => {
                        return {
                            lineItemId: line.id,
                            itemId: line.merchantSku,
                            sku: line.merchantSku,
                            itemCost: line.charges?.find(charge => charge.chargeType == 'product')?.totalCharge,
                            quantity: line.numberOfUnits,
                            hazmatLabels: line.hazmatLabels
                        };
                    }),
                    marketplaceId: marketplaceId,
                    status: orderStatus,
                    accountName: accountName,
                    userId: userId,
                    shipmentId: ord.id,
                    shippedDate: status == "SHIPPED" ? ord.shippingInfo?.expectedShippingDateTime : null,
                    cartlow_order_id: cartLowOrder,
                    cartlowErrors: cartlowErrors
                };

            }));

            await order.bulkCreate(orderData.filter(Boolean));
        }

    } catch (err) {
        console.error(err);
        await apiCallLog("pushOrderData", "getShipments", "pushOrderData", { data, status, marketplaceId, accountName, userId, type }, {}, { error: err.message }, "error");
    }
}

exports.getShipment = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, shipmentId } = req.body;

        if (!shipmentId) {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments/${shipmentId}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.updateSellerFlexOrder = async (id,
    userId,
    marketplaceId,
    accountName,
    status,
    res) => {
    try {

        const orderData = await order.findOne({
            where: {
                id: id
            }
        });

        if (!orderData) {
            return res.status(400).json({
                success: false,
                message: 'Order not found'
            });
        }

        const { clientId, clientSecret, refreshToken } = await Tokens.findOne({
            where: {
                userId: userId,
                marketplaceId: marketplaceId,
                accountName: accountName
            }
        });

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        if (status == 'confirm') {

            const body = {
                clientId: clientId, clientSecret: clientSecret, refreshToken: refreshToken, shipmentId: id, operation: "CONFIRM"
            }

            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `http://localhost:5001/sellerflex/process-shipment`,
                headers: {
                    'x-amz-access-token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            };

            const response = await axios.request(config);

            return res.status(200).json({
                success: true,
                data: response.data
            });

        } else if (status == 'packed') {

            const body = {
                clientId: clientId, clientSecret: clientSecret, refreshToken: refreshToken, shipmentId: id, operation: "CONFIRM"
            }

            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `http://localhost:5001/sellerflex/generate-ship-label`,
                headers: {
                    'x-amz-access-token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            };

            const response = await axios.request(config);

            return res.status(200).json({
                success: true,
                data: response.data
            });

        } else if (status == 'shipped') {

            const body = {
                clientId: clientId, clientSecret: clientSecret, refreshToken: refreshToken, shipmentId: id, operation: "CONFIRM"
            }

            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `http://localhost:5001/sellerflex/generate-invoice`,
                headers: {
                    'x-amz-access-token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            };

            const response = await axios.request(config);

            return res.status(200).json({
                success: true,
                data: response.data
            });

        }

    } catch (err) {
        console.error(err.response.data);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.processShipment = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, shipmentId, operation } = req.body;

        if (!shipmentId || !operation || operation != 'CONFIRM') {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID or Operation is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments/${shipmentId}?operation=${operation}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error(error.response.data);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

exports.createPackages = async (req, res) => {
    try {

        const { clientId, clientSecret, refreshToken, shipmentId, packageDetails } = req.body;

        if (!shipmentId || !packageDetails || packageDetails.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID or Package Details is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments/${shipmentId}/packages`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ packages: packageDetails })
        };

        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });

    } catch (error) {
        console.error(error.response.data);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.retrieveShippingOptions = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, shipmentId, packageId } = req.body;

        if (!shipmentId || !packageId) {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID or Package ID is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shippingOptions?shipmentId=${shipmentId}&packageId=${packageId}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const docType = {
    PDF: "application/pdf", PNG: "image/png", PLAIN_TEXT: "text/plain"
}

exports.generateInvoice = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, shipmentId, packageId } = req.body;

        if (!shipmentId) {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID is required'
            });
        }
        console.log(shipmentId, packageId);
        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments/${shipmentId}/packages/${packageId}/invoice`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            },
        };

        const response = await axios.request(config);
        console.log(response.data);
        await order.update({
            status: "invoice generated"
        }, {
            where: {
                shipmentId: shipmentId
            }
        });

        // let docType = response.data.format;

        const buffer = Buffer.from(response.data.document.content, 'base64');

        const fileName = `invoice_${shipmentId}_${Date.now()}`;
        fs.writeFileSync(fileName + ".txt", buffer);

        const pdfBase64 = fs.readFileSync(fileName + ".txt", 'utf8');
        const { Location, Key } = await uploadToS3(pdfBase64, fileName, "application/pdf");

        fs.unlinkSync(fileName + ".txt");

        return res.status(200).json({
            success: true,
            data: {
                Location,
                Key
            }
        });

    } catch (error) {
        console.log(error.response.data);
        // console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.updatePackage = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, shipmentId, packageId, packageDetails } = req.body;

        if (!shipmentId || !packageId || !packageDetails) {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID, Package ID or Package Details is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'put',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments/${shipmentId}/packages/${packageId}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(packageDetails)
        };

        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.generateShipLabel = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, shipmentId, packageId, carrierName, trackingId, shippingOptionId, operation } = req.body;
        // console.log(req.body);
        if (!shipmentId || !packageId) {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID or Package ID is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments/${shipmentId}/packages/${packageId}/shipLabel?shippingOptionId=&operation=${operation}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            },
        };

        const response = await axios.request(config);

        await order.update({
            status: "shipped"
        }, {
            where: {
                shipmentId: shipmentId
            }
        });

        // let docType = response.data.format;
        console.log(response.data.document.content);

        const buffer = Buffer.from(response.data.document.content, 'base64');

        const fileName = `shipping_label_${shipmentId}_${Date.now()}`;

        const { Location, Key } = await uploadToS3(buffer, fileName, 'image/png');

        return res.status(200).json({
            success: true,
            data: {
                Location,
                Key
            }
        });

    } catch (error) {
        console.error(error.response.data);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.retriveShipLabel = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, shipmentId, packageId } = req.body;

        if (!shipmentId || !packageId) {
            return res.status(400).json({
                success: false,
                message: 'Shipment ID or Package ID is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/shipments/2021-01-06/shipments/${shipmentId}/packages/${packageId}/shipLabel`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        };

        const response = await axios.request(config);

        let docType = response.data.document.format;

        const buffer = Buffer.from(response.data.document.content, 'base64');

        res.setHeader("Content-Type", docType);
        res.setHeader("Content-Disposition", `attachment;filename=${shipmentId}_label.${docType}`);
        return res.status(200).end(buffer);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

exports.listReturns = async (req, res) => {
    try {

        const { clientId, clientSecret, refreshToken, marketplaceId, locationId, status, lastUpdatedAfter } = req.body;

        if (!marketplaceId) {
            return res.status(400).json({
                success: false,
                message: 'Marketplace ID is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/returns/2021-08-19/returns?returnLocationId=${locationId}&rmaId=&status=${status}&lastUpdatedAfter=${lastUpdatedAfter}&lastUpdatedBefore=&maxResults=&nextToken=`,
            headers: {
                'x-amz-access-token': accessToken
            }
        };

        const response = await axios.request(config);

        let nextToken = response.data.nextToken;

        await pushReturnData(response.data.returns, status);

        while (nextToken) {
            let config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/returns/2021-08-19/returns?returnLocationId=${locationId}&rmaId=&status=${status}&lastUpdatedAfter=&lastUpdatedBefore=&maxResults=&nextToken=${nextToken}`,
                headers: {
                    'x-amz-access-token': accessToken
                }
            };

            const response = await axios.request(config);

            await pushReturnData(response.data.returns, status);

            if (response.data.nextToken) {
                nextToken = response.data.nextToken;
            } else {
                break;
            }


        }

        return res.status(200).json({
            success: true,
            data: response.data
        });

    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
}

async function pushReturnData(data, reqStatus) {
    try {

        const inProgressStatus = ["CARRIER_NOTIFIED_TO_PICK_UP_FROM_CUSTOMER", "CARRIER_OUT_FOR_PICK_UP_FROM_CUSTOMER", "CUSTOMER_CANCELLED_PICK_UP", "CUSTOMER_RESCHEDULED_PICK_UP", "PICKED_FROM_CUSTOMER", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

        if (Array.isArray(data) && data.length > 0) {
            await Promise.all(data.map(async (order) => {

                const orderExist = await order.findOne({
                    where: {
                        orderId: order.returnMetadata.fulfillmentOrderId
                    }
                });

                if (orderExist) {
                    let status = '';

                    if (reqStatus == 'CREATED') {

                        status = 'return_requested';

                    } if (reqStatus == 'DELIVERED') {

                        status = 'return_complete';

                    } else if (inProgressStatus.includes(reqStatus)) {

                        status = 'return_in_progress';

                    } else {
                        status = orderExist.dataValues.status;
                    }

                    orderExist.status = status;
                    orderExist.returnId = order.id;

                    await orderExist.save();
                }



            }));
        }

    } catch (err) {
        console.error(err);
    }
}

exports.processReturn = async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken, rmaId, operation, returnId } = req.body;

        if (!rmaId || !operation) {
            return res.status(400).json({
                success: false,
                message: 'RMA ID or Operation is required'
            });
        }

        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

        let body = {
            op: "increment",
            path: "/processedReturns",
            value: {
                Sellable: "",
                Defective: "",
                CustomerDamaged: "",
                CarrierDamaged: "",
                Fraud: "",
                WrongItem: ""
            }
        };

        let config = {
            method: 'patch',
            maxBodyLength: Infinity,
            url: `https://sellingpartnerapi-eu.amazon.com/externalFulfillment/returns/2021-08-19/returns/${returnId}`,
            headers: {
                'x-amz-access-token': accessToken,
                "x-amzn-idempotency-token": uuidv4(),
            },
            data: JSON.stringify(body)
        };

        const response = await axios.request(config);

        return res.status(200).json({
            success: true,
            data: response.data
        });

    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message
        });
    }
};

const qs = require('qs');
const fs = require('fs');
const path = require('path');
const { apiCallLog } = require("../../helper/apiCallLog");
const sendUpdateReportEmail = require("../../helper/sendUpdateReportEmail");
// const { uploadToS3 } = require("../../helper/uploadFile");

const REPORT_TYPE = 'GET_MERCHANT_LISTINGS_ALL_DATA'; // Example report type for settlements

// Function to create a report
const createReport = async (accessToken, amzMarketplaceId) => {
    const createReportUrl = 'https://sellingpartnerapi-eu.amazon.com/reports/2021-06-30/reports';
    const headers = {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json'
    };
    const data = {
        reportType: REPORT_TYPE,
        marketplaceIds: [amzMarketplaceId],
        reportOptions: {}
    };

    try {
        const response = await axios.post(createReportUrl, data, { headers });
        return response.data.reportId;
    } catch (error) {
        console.error('Error creating report:', error.response.data);
        throw error;
    }
};

// Function to get report document
const getReportDocument = async (accessToken, reportId) => {
    const getReportDocumentUrl = `https://sellingpartnerapi-eu.amazon.com/reports/2021-06-30/reports/${reportId}`;
    const headers = {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.get(getReportDocumentUrl, { headers });

        console.log('Report status:', response.data);
        return response.data.reportDocumentId;
    } catch (error) {
        console.error('Error getting report document:', error.response.data);
        throw error;
    }
};

// Function to download report
const downloadReport = async (accessToken, reportDocumentId) => {
    const getReportDocumentUrl = `https://sellingpartnerapi-eu.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`;
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.get(getReportDocumentUrl, { headers });
        const documentUrl = response.data.url;
        const fileResponse = await axios.get(documentUrl, { responseType: 'stream' });
        const filePath = path.resolve(__dirname, 'invoice_report.tsv');
        const writer = fs.createWriteStream(filePath);

        fileResponse.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading report:', error.response.data);
        throw error;
    }
};

async function convertReportToJSON(filePath) {
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n');
    const headers = lines[0].split('\t');
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].split('\t');
        const obj = {};

        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = line[j];
        }

        result.push(obj);
    }

    return result;
}

exports.fetchSellerFlexListings = async (startDate, endDate, client_id, client_secret, refresh_token, amzMarketplaceId) => {
    try {
        console.log(client_id, client_secret, refresh_token);
        const accessToken = await getAccessToken(client_id, client_secret, refresh_token);
        console.log('Access token:', accessToken);
        const reportId = await createReport(accessToken, amzMarketplaceId);
        console.log('Report created with ID:', reportId);

        // You may need to wait for the report to be generated
        // Polling the report status would be a good approach here
        // For simplicity, we'll wait for a few seconds
        await new Promise(resolve => setTimeout(resolve, 30000));

        const reportDocumentId = await getReportDocument(accessToken, reportId);
        console.log('Report document ID:', reportDocumentId);

        await downloadReport(accessToken, reportDocumentId);
        console.log('Report downloaded successfully');

        const finalData = await convertReportToJSON(path.resolve(__dirname, 'invoice_report.tsv'));

        return finalData;
    } catch (error) {
        console.error('Error in main function:', error.message);
        throw error;
    }

};
