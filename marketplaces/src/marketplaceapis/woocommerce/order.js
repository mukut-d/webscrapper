
const order = require("../../models/order");
const csku = require("../../models/csku");
const isku = require("../../models/isku");
const Tokens = require("../../models/tokens");
const { sequelize } = require("../../database/config");
const moment = require("moment");
const axios = require("axios");
const {apiCallLog} = require("../../helper/apiCallLog")

exports.GetWoocommerceOrder = async (
    accountName,
    token,
    marketplaceId,
    userId,
    addQuantity,
    type
) => {
    const orders = [];
    try {
        const today = moment();
        const twoYearsAgo = moment().subtract(120, "days");
        const perPage = 100;
        let page = 1;
        const formattedStartDate = moment(twoYearsAgo).startOf('day').toISOString();
        const formattedEndDate = moment(today).endOf('day').toISOString();
        accountName = accountName?.includes('.com') ? accountName : `${accountName}.com`
        let nextPageUrl = `https://${accountName}.com/wp-json/wc/v3/orders`;

        while (nextPageUrl) {
            const response = await axios.get(nextPageUrl, {
                headers: {
                    Authorization: `Basic ${token}`
                },
                params: {
                    after: formattedStartDate,
                    before: formattedEndDate,
                    per_page: perPage,
                    page: page
                }
            });



            const data = response.data;

            console.log("data", data, data?.length)
            if (Array.isArray(data)) {
                orders.push(...data);
            }
            await pushDataWooCommerec(data, marketplaceId, accountName, userId, type)
            const linkHeader = response.headers.link;
            nextPageUrl = null;

            if (linkHeader) {
                const links = linkHeader.split(',');

                for (let link of links) {
                    const [urlPart, relPart] = link.split(';');
                    const url = urlPart.trim().slice(1, -1);
                    const rel = relPart.trim().split('=')[1].replace(/"/g, '');

                    if (rel === 'next') {
                        nextPageUrl = url;
                        page++;
                        console.log("dfgh", nextPageUrl)
                    }
                }
            }
        }
        return orders;
    } catch (error) {
        console.log("error", error)
    }
}

exports.handleWooCommerceOrder = async (
    token,
    marketPlace,
    startDate,
    orders,
    marketplaceId,
    accountName,
    userId,
    addQuantity
) => {
    const functionName = "handleWooCommerceOrder";
    try {
        apiCallLog("handleWooCommerceOrder", "/order/get-order-cron", functionName,
            {
              accountName:accountName,
              token:token,
              marketplaceId:marketplaceId,
              userId:userId,
              startDate:startDate
            }
            , {orders}, {}, 'success');
        accountName = accountName?.includes('.com') ? accountName : `${accountName}.com`
        const url = `https://${accountName}/wp-json/wc/v3/orders`;
        const formattedStartDate = moment(startDate).startOf('day').toISOString();
        try {
            const response = await axios.get(url, {
                headers: {
                    Authorization: "Basic " + token.dataValues.token
                },
                params: {
                    after: formattedStartDate,
                    // before: formattedEndDate
                }
            })
            const wooCommerceOrders = response.data;
            console.log("Woocommerce orders", wooCommerceOrders?.data);
            if (Array.isArray(wooCommerceOrders)) {
                orders.push(...wooCommerceOrders);
            }
            await pushDataWooCommerec(
                wooCommerceOrders,
                marketplaceId,
                accountName,
                userId,
                addQuantity
            );
        }
        catch (error) {
            console.error("Error fetching  woocommerce orders:", error);
            apiCallLog("handleWooCommerceOrder", "/order/get-order-cron", functionName,
                {
                  accountName:accountName,
                  url:url,
                  marketplaceId:marketplaceId,
                  userId:userId,
                  formattedStartDate:formattedStartDate
                }
                , {}, error, 'error');
            throw new Error("Error fetching woocommerce orders");
        }
        return orders;
    } catch (err) {
        apiCallLog("handleWooCommerceOrder", "/order/get-order-cron", functionName,
            {
                accountName:accountName,
                token:token,
                marketplaceId:marketplaceId,
                userId:userId,
                startDate:startDate
            }
            , {}, err, 'error');
        console.log("error", err)
    }
}

async function pushDataWooCommerec(
    orders,
    marketplaceId,
    accountName,
    userId,
    addQuantity,
    type
) {
    const functionName = "pushDataWooCommerec"
    const quantitySync = require('../../controllers/api/v1/marketplaceSync');
    try {
        apiCallLog("pushDataWooCommerec", "/order/get-order-cron", functionName,
            {
                accountName:accountName,
                marketplaceId:marketplaceId,
                userId:userId,
                type:type
            }
            , {orders}, {}, 'success');
        const iskuData = [];
        const cskuData = [];
        let response = await Promise.all(
            orders?.map(async (item) => {
                console.log("data", item)
                let status = "UNPAID";
                let orderPaymentStatus = "UNPAID";
                let fulfillmentStatus = "NOT_STARTED";

                switch (item?.status) {
                    case "pending":
                    case "draft":
                        status = "pending";
                        orderPaymentStatus = "UNPAID";
                        fulfillmentStatus = "NOT_STARTED";
                        break;
                    case "on-hold":
                        status = "in_progress";
                        orderPaymentStatus = "UNPAID";
                        fulfillmentStatus = "NOT_STARTED";
                        break;
                    case "processing":
                        status = "shipped";
                        orderPaymentStatus = "PAID";
                        fulfillmentStatus = "NOT_STARTED";
                        break;
                    case "completed":
                        status = "paid";
                        orderPaymentStatus = "PAID";
                        fulfillmentStatus = "FULFILLED";
                        break;
                    case "failed":
                        status = "failed";
                        orderPaymentStatus = "UNPAID";
                        fulfillmentStatus = "NOT_STARTED";
                        break;
                    case "cancelled":
                        status = "canceled";
                        orderPaymentStatus = "UNPAID";
                        fulfillmentStatus = "NOT_STARTED";
                        break;
                    case "refunded":
                        status = "refunded";
                        orderPaymentStatus = "UNPAID";
                        fulfillmentStatus = "FULFILLED";
                        break;
                    default:
                        status = "unpaid";
                        orderPaymentStatus = "UNPAID";
                        fulfillmentStatus = "NOT_STARTED";
                }

                console.log("status", status, orderPaymentStatus, fulfillmentStatus)

                const orderIdString = String(item.id);
                const orderExist = await order.findOne({
                    where: { orderId: orderIdString, userId: userId, accountName: accountName },
                });
                console.log("orderExist", orderExist)
                if (!orderExist) {
                    apiCallLog("pushDataWooCommerec OrderNotExist", "/order/get-order-cron", functionName,
                        { orderId: orderIdString, userId: userId, accountName: accountName }
                        , {orderExist:"order doesnot exist"}, {}, 'success');
                    await Promise.all(
                        item?.line_items?.map(async (line) => {
                            console.log(line, 'line')
                            const cskuExist = await csku.findOne({
                                where: { channelId: line.id.toString() },
                            });
                            const imageUrl = line?.image ? line?.image.src : '';
                            if (!cskuExist) {
                                const newItem = {
                                    id: line.id,
                                    title: line.name,
                                    sku: line.sku,
                                    price: line.price,
                                    quantity: line.quantity,
                                    fulfillment_status: line.fulfillmentStatus,
                                    // fulfillment_service: line.fulfillment_service,
                                    variant_id: line.variation_id,
                                    vendor: item.vendor || null,
                                    images: imageUrl ? [imageUrl] : [],
                                    // description: item.note,
                                    categoryId: null,
                                    categoryName: null,
                                    currency: item.currency,
                                    marketplaceId: marketplaceId,
                                    accountName: accountName,
                                    userId: userId,
                                };
                                console.log("qwerty", newItem)
                                console.log("qwertydf", cskuExist)


                                await Tokens.update(
                                    {
                                        itemsFetched: sequelize.literal(
                                            `CAST("itemsFetched" AS INTEGER) + ${1}`
                                        ),
                                    },
                                    { where: { userId: userId, accountName: accountName } }
                                );

                                cskuData.push({
                                    channelId: newItem?.id,
                                    variantId: newItem?.variant_id,
                                    isku: newItem.sku,
                                    price: newItem.price,
                                    mrp: newItem.price,
                                    images: imageUrl ? [imageUrl] : [],
                                    description: null,
                                    categoryId: null,
                                    categoryName: null,
                                    quantity: newItem?.quantity,
                                    currency: newItem?.currency,
                                    marketplaceId: marketplaceId,
                                    accountName: accountName,
                                    userId: userId,
                                    title: newItem.title,
                                });

                                if (!newItem.sku) {
                                    iskuData.push({
                                        isku: newItem.id,
                                        costPrice: newItem.price,
                                        title: newItem.title,
                                        images: imageUrl ? [imageUrl] : [],
                                        quantity: newItem.quantity,
                                        currency: newItem.currency,
                                        accountName: accountName,
                                        marketplaceId: marketplaceId,
                                        userId: userId,
                                    });
                                } else {
                                    const iskuExist = await isku.findOne({
                                        where: { isku: newItem.sku.toString() },
                                    });
                                    if (iskuExist) {
                                        // Calculate new quantity based on whether it's an order or inventory update
                                        let newQuantity;
                                        if (addQuantity) {
                                            // If adding inventory
                                            newQuantity = iskuExist.quantity + newItem.quantity;
                                        } else {
                                            // If processing an order, decrease quantity
                                            newQuantity = iskuExist.quantity - newItem.quantity;

                                            // Prevent negative quantity
                                            if (newQuantity < 0) {
                                                console.warn(`Warning: Quantity would become negative for SKU ${iskuExist.isku}. Setting to 0.`);
                                                newQuantity = 0;
                                            }
                                        }

                                        // Sync quantity across marketplaces
                                        const currentQuantity = cskuExist.dataValues.quantity
                                        const lineQuantity = line.orderLineQuantity.amount


                                        await syncMarketplaceQuantities(
                                            line.item.sku,
                                            currentQuantity,
                                            userId,
                                            'WooCommerce',
                                            lineQuantity
                                        )

                                        // Update local inventory
                                        iskuExist.quantity = newQuantity;
                                        await iskuExist.save();

                                        // Update CSKU quantity as well
                                        await csku.update(
                                            { quantity: newQuantity },
                                            {
                                                where: {
                                                    isku: iskuExist.isku,
                                                    userId: userId
                                                }
                                            }
                                        );
                                    } else if (!iskuExist) {
                                        iskuData.push({
                                            isku: newItem.id,
                                            costPrice: newItem.price,
                                            title: newItem.title,
                                            images: newItem.images,
                                            quantity: newItem.quantity,
                                            // currency: newItem.currency,
                                            accountName: accountName,
                                            marketplaceId: marketplaceId,
                                            userId: userId,
                                        });
                                    }
                                }
                            } else {
                                try {
                                    const allCskus = await csku.findAll({
                                        where: {
                                            channelId: cskuExist.dataValues.channelId,
                                            id: {
                                                [Op.ne]: cskuExist.dataValues.id,
                                            },
                                        },
                                    });

                                    if (allCskus.length > 0 && type != "firstFetch") {
                                        const existingIsku = await isku.findOne({
                                            where: { isku: cskuExist.dataValues.isku }
                                        });

                                        // if (existingIsku) {
                                        //     // Update quantity for existing SKU
                                        //     const newQuantity = addQuantity ? 
                                        //         existingIsku.quantity + line.quantity :
                                        //         existingIsku.quantity - line.quantity;

                                        //     try {
                                        //         await quantitySync.syncQuantityAcrossMarketplaces({
                                        //             sourceMarketplaceId: marketplaceId,
                                        //             sku: existingIsku.isku,
                                        //             newQuantity: Math.max(0, newQuantity), // Prevent negative quantity
                                        //             userId: userId,
                                        //             accountName: accountName
                                        //         });
                                        //     } catch (syncError) {
                                        //         console.error('Error syncing quantity for existing CSKUs:', syncError);
                                        //     }
                                        // }

                                        updateMarketplaceData(allCskus);
                                    }
                                } catch (err) {
                                    console.log(err);
                                }
                            }
                        }
                        )
                    );

                    return {
                        orderId: item?.id,
                        creationDate: item?.created_at,
                        lastModifiedDate: item?.updated_at,
                        orderFulfillmentStatus: fulfillmentStatus,
                        orderPaymentStatus: orderPaymentStatus,
                        sellerId: accountName,
                        buyerUserName: item?.customer?.id || null,
                        buyerRegistrationAddress: {
                            addressLine1: item?.shipping_address?.address1 || null,
                            city: item?.shipping_address?.city || null,
                            stateOrProvince: item?.shipping_address?.province || null,
                            postalCode: item?.shipping_address?.zip || null,
                            countryCode: item?.shipping_address?.country || null,
                            primaryPhone: item?.shipping_address?.phone || null,
                            email: item?.email || null,
                        },
                        pricingSummary: {
                            total: item.total_price,
                            subtotal: item.subtotal_price,
                            total_tax: item.total_tax,
                            total_discounts: item.total_discounts,
                        },
                        payments: item.financial_status,
                        fulfillmentStartInstructions: [],
                        items: item.line_items.map((line) => {
                            return {
                                lineItemId: line.id,
                                itemId: line.product_id,
                                sku: line.sku,
                                itemCost: line.price,
                                quantity: line.quantity,
                                appliedPromotions: [],
                                lineItemStatus: line.fulfillment_status,
                            };
                        }),
                        totalMarketplaceFee: 0,
                        marketplaceId: marketplaceId,
                        status: status,
                        accountName: accountName,
                        userId: userId,
                        shippedDate: status == "shipped" ? moment().toISOString() : null,
                    };


                } else {
                    apiCallLog("pushDataWooCommerec OrderNotExist", "/order/get-order-cron", functionName,
                        { orderId: orderIdString, userId: userId, accountName: accountName }
                        , {orderExist:"order exist"}, {}, 'success');
                    orderExist.dataValues.orderFulfillmentStatus = fulfillmentStatus
                    orderExist.dataValues.orderPaymentStatus = orderPaymentStatus;
                    orderExist.dataValues.status = status;
                    // await orderExist.save();
                    return null;
                }
            })
        );
        console.log("sdfghj", { iskuData, cskuData })
        response = response.filter((item) => item != null);

        await order.bulkCreate(response);
        await isku.bulkCreate(iskuData);
        await csku.bulkCreate(cskuData);
    } catch (error) {
        console.log(error);
        apiCallLog("pushDataWooCommerec", "/order/get-order-cron", functionName,
            {
                accountName:accountName,
                marketplaceId:marketplaceId,
                userId:userId,
                type:type,
                orders:orders
            }
            , {}, error, 'error');
        throw error;
    }
}


exports.updateWooCommerceOrder = async (
    id, userId, marketplaceId, accountName, status, res
) => {
    // console.log("fghjkd", {id, userId, marketplaceId, accountName, status, res})
    try {
        const token = await Tokens.findOne({
            where: {
                userId: userId,
                marketPlaceId: marketplaceId,
                accountName: accountName,
            },
        });

        if (!token) {
            return res.status(500).json({
                success: false,
                status: 500,
                message: "Token for this user not found.",
            });
        }

        const orderExist = await order.findOne({ where: { orderId: id } });

        if (!orderExist)
            return res.status(500).json({
                success: false,
                status: 500,
                message: "Invalid Order ID",
            });

        if (orderExist.dataValues.status === status) {
            return res.status(500).json({
                success: false,
                status: 500,
                message: "Cannot update order to same status.",
            });
        }
        let statusMarket;
        let orderPaymentStatus;
        let fullfillmentStatus;

        switch (status) {
            case "paid":
                statusMarket = "completed";// Changed to "completed" as WooCommerce completed status for "paid"
                orderPaymentStatus = "PAID";
                fullfillmentStatus = "FULFILLED";
                break;
            case "shipped":
                statusMarket = "processing";
                orderPaymentStatus = "PAID";
                fullfillmentStatus = "NOT_STARTED";
                break;
            case "in_progress":
                statusMarket = "on-hold";
                orderPaymentStatus = "UNPAID";
                fullfillmentStatus = "NOT_STARTED";
                break;
            case "pending":
                statusMarket = "pending";
                orderPaymentStatus = "UNPAID";
                fullfillmentStatus = "NOT_STARTED";
                break;
            case "canceled":
                statusMarket = "cancelled";
                orderPaymentStatus = "UNPAID";
                fullfillmentStatus = "NOT_STARTED";
                break;
            case "refunded":
                statusMarket = "refunded";
                orderPaymentStatus = "PAID";
                fullfillmentStatus = "FULFILLED";
                break;
            case "unpaid":
                statusMarket = "failed";
                orderPaymentStatus = "UNPAID";
                fullfillmentStatus = "NOT_STARTED";
                break;
            case "problematic order":
                statusMarket = "trash";
                orderPaymentStatus = "UNPAID";
                fullfillmentStatus = "NOT_STARTED";
                break;
            default:
                console.log("Unknown statusDb:", status);
                statusMarket = undefined;
        }

        console.log("status", status);
        try {
            const url = `https://${accountName}.com/wp-json/wc/v3/orders/${id}`
            const payload = {
                status: statusMarket
            }
            const response = await axios.put(
                url, payload,
                {
                    headers: {
                        Authorization: "Basic " + token.token,
                        'Content-Type': 'application/json'
                    },
                }
            );
            const data = response;

            await orderExist.update({ status: status, orderFulfillmentStatus: fullfillmentStatus, orderPaymentStatus: orderPaymentStatus }, { where: { orderId: id } });

            return res.status(200).json({
                success: true,
                status: 200,
                message: "Status updated successfully",
            });
        } catch (err) {
            console.log(err);
            return res.status(400).json({
                success: false,
                status: 400,
                message: err.message,
            });
        }

    } catch (err) {
        console.log(err);
        return res.status(400).json({
            success: false,
            status: 400,
            message: err.message,
        });
    }
}



exports.fetchWooCommerceCancelRequests = async (
    tokenVal,
    returnDate,
    startDate,
    accountName
) => {
    try {
        // const perPage = 1;
        // let page = 1;
        let cancels = []

        // const formattedStartDate = moment(startDate).startOf('day').toISOString();
        // const formattedEndDate = moment(returnDate).endOf('day').toISOString();

        let nextPageUrl = `https://${accountName}.com/wp-json/wc/v3/orders`;

        while (nextPageUrl) {
            const response = await axios.get(nextPageUrl, {
                headers: {
                    Authorization: "Basic " + tokenVal
                },

                params: {
                    // after: formattedStartDate,
                    // before: formattedEndDate,
                    // per_page: perPage,
                    // page: page,
                    status: 'cancelled'
                }
            });

            const data = response.data;
            if (Array.isArray(data)) {
                cancels.push(...data);
            }

            const linkHeader = response.headers.link;
            nextPageUrl = null;

            if (linkHeader) {
                const links = linkHeader.split(',');

                for (let link of links) {
                    const [urlPart, relPart] = link.split(';');
                    const url = urlPart.trim().slice(1, -1);
                    const rel = relPart.trim().split('=')[1].replace(/"/g, '');

                    if (rel === 'next') {
                        nextPageUrl = url;
                        page++;
                        console.log("dfgh", nextPageUrl)
                    }
                }
            }
            console.log("dfghj", cancels)
            return cancels;
        }
    } catch (err) {
        console.log("error", err)
    }
}


exports.fetchWooCommerceReturn = async (
    tokenVal,
    returnDate,
    accountName
) => {
    try {

        const today = moment();
        let returns = []

        const formattedStartDate = moment(returnDate).startOf('day').toISOString();
        const formattedEndDate = moment(today).endOf('day').toISOString();


        let nextPageUrl = `https://${accountName}.com/wp-json/wc/v3/orders`;

        while (nextPageUrl) {
            const response = await axios.get(nextPageUrl, {
                headers: {
                    Authorization: "Basic " + tokenVal
                },

                params: {
                    after: formattedStartDate,
                    before: formattedEndDate,
                    // per_page: perPage,
                    // page: page,
                    status: 'refunded'
                }
            });

            const data = response.data;
            if (Array.isArray(data)) {
                returns.push(...data);
            }

            const linkHeader = response.headers.link;
            nextPageUrl = null;

            if (linkHeader) {
                const links = linkHeader.split(',');

                for (let link of links) {
                    const [urlPart, relPart] = link.split(';');
                    const url = urlPart.trim().slice(1, -1);
                    const rel = relPart.trim().split('=')[1].replace(/"/g, '');

                    if (rel === 'next') {
                        nextPageUrl = url;
                        page++;
                        console.log("dfgh", nextPageUrl)
                    }
                }
            }
            console.log("dfghj",)
            return returns;
        }
    } catch (err) {
        console.log("error", err)
    }
}




exports.getWoocommerceDeliveredOrders = async (
    token,
    accountName,
    userId
) => {
    try {
        // const perPage = 1;
        // let page = 1;
        let deliveredOrders = []
        let nextPageUrl = `https://${accountName}.com/wp-json/wc/v3/orders`;

        while (nextPageUrl) {
            const response = await axios.get(nextPageUrl, {
                headers: {
                    Authorization: "Basic " + token
                },

                params: {
                    // per_page: perPage,
                    // page: page,
                    status: 'completed'
                }
            });

            const data = response.data;
            if (Array.isArray(data)) {
                deliveredOrders.push(...data);
            }

            const linkHeader = response.headers.link;
            nextPageUrl = null;

            if (linkHeader) {
                const links = linkHeader.split(',');

                for (let link of links) {
                    const [urlPart, relPart] = link.split(';');
                    const url = urlPart.trim().slice(1, -1);
                    const rel = relPart.trim().split('=')[1].replace(/"/g, '');

                    if (rel === 'next') {
                        nextPageUrl = url;
                        page++;
                        console.log("dfgh", nextPageUrl)
                    }
                }
            }
            console.log("dfghj", deliveredOrders)
        }
        return deliveredOrders;
    } catch (err) {
        console.log(err);
        return [];
    }
}





