const { sequelize } = require("../../database/config");
const order = require("../../models/order");
const csku = require("../../models/csku");
const isku = require("../../models/isku");
const Tokens = require("../../models/tokens");
const moment = require("moment");
const { Op } = require("sequelize");
const { emailTemplate } = require("../../models/emailTemplate");
const axios = require("axios");
const { SendEmail } = require("../../helper/sendEmail");
const { SendMessage } = require("../../controllers/api/v1/message");
const newRelic = require("newrelic");
const { apiCallLog } = require("../../helper/apiCallLog")


async function getOrdersByStatus(shopName, accessToken, status, data, date) {
  let allOrders = [];
  let url = `https://${shopName}.myshopify.com/admin/api/2024-07/orders.json`;
  let hasNextPage = true;
  let pageInfo = data;

  while (hasNextPage) {
    try {
      let params = {
        limit: 250,
        created_at_min: date,
      };

      if (pageInfo) {
        params.page_info = pageInfo;
        if (params.created_at_min) {
          delete params.created_at_min;
        }
      } else {
        params.status = status;
      }

      console.log("Current pageInfo:", pageInfo);
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        params: params,
      });

      const orders = response.data.orders;
      orders.forEach(order => order.status = status);
      allOrders = allOrders.concat(orders);

      const linkHeader = response.headers["link"];
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const matches = linkHeader.match(/<([^>]+)>; rel="next"/);
        if (matches && matches[1]) {
          pageInfo = matches[1].split("page_info=")[1];
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    } catch (error) {
      console.error(`Error fetching orders for status ${status}:`, error.response ? error.response.data : error.message);
      break;
    }
  }
  return allOrders;
}


async function getAllOrdersForStatuses(shopName, accessToken, statuses, date) {
  let allOrders = [];

  for (let status of statuses) {
    const orders = await getOrdersByStatus(shopName, accessToken, status, null, date);
    allOrders = allOrders.concat(orders);
  }

  return allOrders;
}

exports.fetchAndPushOrders = async (
  marketplaceId,
  accountName,
  userId,
  token,
  type,
  date
) => {
  const functionName = "fetchAndPuchOrders"
  const statuses = ["open", "closed", "cancelled"];

  try {
    apiCallLog("fetchAndPuchOrders", "/order/get-order-cron", functionName,
      {
        marketplaceId: marketplaceId,
        accountName: accountName,
        userId: userId,
        token: token,
        type: type
      }
      , {}, {}, 'success');
    const data = await getAllOrdersForStatuses(accountName, token, statuses, date);
    apiCallLog("fetchAndPuchOrders", "/order/get-order-cron", functionName,
      {
        accountName: accountName,
        token: token,
        statuses: statuses,
      }
      , {}, {}, 'success');
    await pushDataShopify(
      data,
      marketplaceId,
      accountName,
      userId,
      type
    );
  } catch (error) {
    await Tokens.update(
      { status: "inactive" },
      { where: { token: token, userId: userId } }
    );
    console.error(
      `Error fetching or pushing data for status ${status}:`,
      error
    );
    apiCallLog("fetchAndPushOrders", "/order/get-order-cron", functionName,
      {
        marketplaceId: marketplaceId,
        accountName: accountName,
        userId: userId,
        token: token,
      }
      , {}, error, 'error');
  }
};

exports.updateShopifyStatus = async (
  id,
  userId,
  marketplaceId,
  accountName,
  status,
  res
) => {
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

    const orderExist = await order.findOne({ where: { id: id } });

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

    const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders/${orderExist.dataValues.orderId}.json`;

    const headers = {
      "X-Shopify-Access-Token": token.dataValues.token,
      "Content-Type": "application/json",
    };

    const shopifyOrderResponse = await axios.get(shopifyUrl, { headers });

    if (status === "partially_shipped" || status === "shipped") {
      if (!shopifyOrderResponse?.data.order?.fulfillments?.length) {
        const fulfillmentOrderUrl = `https://${accountName}.myshopify.com/admin/api/2023-04/orders/${orderExist.dataValues.orderId}/fulfillment_orders.json`;

        let fulfillmentOrders;
        try {
          const fulfillmentOrderResponse = await axios.get(
            fulfillmentOrderUrl,
            { headers }
          );
          fulfillmentOrders = fulfillmentOrderResponse.data.fulfillment_orders;
        } catch (error) {
          console.error("Error fetching Shopify fulfillment orders:", error);
          return res.status(500).json({
            success: false,
            status: 500,
            message: "Error fetching Shopify fulfillment orders.",
          });
        }

        const fulfillmentUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/fulfillments.json`;
        const fulfillmentPayload = {
          fulfillment: {
            line_items_by_fulfillment_order: fulfillmentOrders.map((order) => ({
              fulfillment_order_id: order.id,
            })),
            tracking_info: {
              number: "MS1562678",
              url: `https://www.my-shipping-company.com?tracking_number=MS1562678`,
            },
          },
        };

        console.log(
          "fulfillmentPayload",
          fulfillmentOrders,
          JSON.stringify(fulfillmentPayload)
        );

        try {
          await axios.post(fulfillmentUrl, fulfillmentPayload, { headers });
          await order.update({ status: status }, { where: { id: id } });
        } catch (error) {
          console.error("Error updating Shopify fulfillment:", error);
          return res.status(500).json({
            success: false,
            status: 500,
            message: "Error updating Shopify fulfillment.",
          });
        }
      } else {
        await order.update({ status: status }, { where: { id: id } });
      }
    } else if (status === "canceled") {
      const cancelUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders/${orderExist.dataValues.orderId}/cancel.json`;
      try {
        await axios.post(cancelUrl, {}, { headers });
        await order.update({ status: status }, { where: { id: id } });
      } catch (error) {
        return res.status(500).json({
          success: false,
          status: 500,
          message: error.response.data.error,
        });
      }
    } else if (status === "paid") {
      const transactionUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders/${orderExist.dataValues.orderId}/transactions.json`;
      const transactionPayload = {
        transaction: {
          kind: "capture",
          status: "success",
        },
      };

      try {
        await axios.post(transactionUrl, transactionPayload, { headers });
        await order.update({ status: "paid" }, { where: { id: id } });
      } catch (error) {
        console.error("Error capturing Shopify payment:", error.response.data);
        return res.status(500).json({
          success: false,
          status: 500,
          message: "Error capturing Shopify payment.",
        });
      }
    } else if (status === "delivered") {
      const cancelUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders/${orderExist.dataValues.orderId}/close.json`;
      try {
        await axios.post(cancelUrl, {}, { headers });
        await order.update({ status: status }, { where: { id: id } });
      } catch (error) {
        console.error("Error canceling Shopify order:", error);
        return res.status(500).json({
          success: false,
          status: 500,
          message: "Error canceling Shopify order.",
        });
      }
    } else {
      await order.update({ status: status }, { where: { id: id } });
    }

    const template = await emailTemplate.findOne({
      where: {
        accountName: accountName,
        userId: userId,
        order_status: status,
      },
    });

    if (template) {
      const jsonData = {
        from_email: template.dataValues.senderEmail,
        template_name: template.dataValues.templateName,
        to_email: orderExist.dataValues.buyerEmail,
      };
      await SendEmail(jsonData);
    }

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
};

exports.getShopifyDeliveredOrders = async (token, accountName, userId) => {
  try {
    const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json`;
    const headers = {
      "X-Shopify-Access-Token": token.dataValues.token,
      "Content-Type": "application/json",
    };

    const orderData = await order.findAll({
      where: {
        userId: userId,
        accountName: accountName,
        status: "shipped",
        shippedDate: { [Op.not]: null },
      },
    });

    const deliveredOrders = [];

    // for (let i = 0; i < orderData?.length; i++) {
    //   const orders = orderData[i];
    await Promise.all(
      orderData.map(async (orders) => {
        const shippedDate = moment(orders.dataValues.shippedDate);
        const today = moment();

        if (today.diff(shippedDate, "days") >= 10) {
          const response = await axios.get(shopifyUrl, {
            headers,
            params: { ids: orders.dataValues.orderId },
          });

          const shopifyOrder = response.data.orders[0];

          if (shopifyOrder && shopifyOrder.fulfillment_status === "fulfilled") {
            await order.update(
              {
                status: "delivered",
                deliveryDate:
                  shopifyOrder.fulfillments[0]?.shipment_status?.delivered_at ||
                  shopifyOrder.updated_at,
              },
              {
                where: {
                  orderId: shopifyOrder.id.toString(),
                },
              }
            );
            deliveredOrders.push(shopifyOrder);
          }
        }
      })
    );

    return deliveredOrders;
  } catch (err) {
    console.log(err);
    return [];
  }
};

exports.fetchShopifyCancelRequests = async (
  token,
  returnDate,
  startDate,
  accountName
) => {
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json`;
  const headers = {
    "X-Shopify-Access-Token": token.dataValues.token,
    "Content-Type": "application/json",
  };

  const response = await axios.get(shopifyUrl, {
    headers,
    params: {
      status: "any",
      created_at_min: returnDate,
      created_at_max: startDate,
    },
  });

  const orders = response.data.orders;

  let cancels = orders.filter((order) => order.cancelled_at !== null);

  return cancels.map((order) => ({
    orderId: order.id,
    status: "canceled",
    cancelId: order.id, // Assuming order ID is used as cancel ID in this context
  }));
};

exports.fetchShopifyReturns = async (token, returnDate, accountName) => {
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json`;
  const headers = {
    "X-Shopify-Access-Token": token.dataValues.token,
    "Content-Type": "application/json",
  };

  const response = await axios.get(shopifyUrl, {
    headers,
    params: {
      status: "any",
      created_at_min: returnDate,
    },
  });

  const orders = response.data.orders;

  let returns = orders.filter((order) => order.financial_status === "returned");

  return returns.map((order) => ({
    orderId: order.id,
    status: "return_complete",
    returnId: order.id, // Assuming order ID is used as return ID in this context
  }));
};

const syncMarketplaceQuantities = require('../../controllers/api/v1/marketplaceSync');

async function pushDataShopify(
  orders,
  marketplaceId,
  accountName,
  userId,
  type
) {
  const functionName = "pushDataShopify"
  const batchSize = 50;
  apiCallLog("pushDataShopify", "/order/get-order-cron", functionName,
    {
      accountName: accountName,
      type: type,
      orders: orders,
    }
    , {}, {}, 'success');
  const totalBatches = Math.ceil(orders.length / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchData = orders.slice(
      batchIndex * batchSize,
      (batchIndex + 1) * batchSize
    );
    console.log(`Processing batch ${batchIndex + 1}/${totalBatches}`);
    console.log('startingssss')
    try {
      const iskuData = [];
      const cskuData = [];
      let response = [];

      for (let i = 0; i < batchData.length; i++) {
        let item = batchData[i];
        let status = "unpaid";

        if (item.financial_status === "paid") {
          if (item.fulfillment_status == null) {
            status = "paid";
          } else if (item.fulfillment_status === "pending") {
            status = "unpaid";
          } else if (
            item.financial_status === "paid" &&
            item?.shipping_lines[0]?.code === "Standard"
          ) {
            status = "delivered";
          } else if (item.fulfillment_status === "fulfilled") {
            status = "shipped";
          } else if (item.fulfillment_status === "partial") {
            status = "in_progress";
          }
        } else if (
          item.status === "cancelled" ||
          item.fulfillment_status === "refunded"
        ) {
          status = "canceled";
        }

        const orderExist = await order.findOne({
          where: {
            orderId: item.id.toString(),
            userId: userId,
            accountName: accountName,
          },
        });

        if (!orderExist) {
          for (let j = 0; j < item.line_items.length; j++) {
            let line = item.line_items[j];
            if (line?.product_id) {
              const cskuExist = await csku.findOne({
                where: { channelId: line?.product_id?.toString() },
              });

              if (!cskuExist) {
                console.log("csku not found");
                const newItem = {
                  id: line.product_id,
                  title: line.title,
                  sku: line.sku,
                  price: line.price,
                  quantity: line.quantity,
                  fulfillment_status: line.fulfillment_status,
                  fulfillment_service: line.fulfillment_service,
                  variant_id: line.variant_id,
                  vendor: item.vendor,
                  images: item.image ? [item.image.src] : [],
                  description: item.note,
                  categoryId: null,
                  categoryName: null,
                  currency: item.currency,
                  marketplaceId: marketplaceId,
                  accountName: accountName,
                  userId: userId,
                };

                await Tokens.update(
                  {
                    itemsFetched: sequelize.literal(
                      `CAST("itemsFetched" AS INTEGER) + ${1}`
                    ),
                  },
                  { where: { userId: userId, accountName: accountName } }
                );

                cskuData.push({
                  channelId: newItem.id,
                  variantId: newItem.variant_id,
                  isku: newItem.sku,
                  price: newItem.price,
                  mrp: newItem.price,
                  images: newItem.images,
                  description: newItem.description,
                  categoryId: newItem.categoryId,
                  categoryName: newItem.categoryName,
                  quantity: newItem.quantity,
                  currency: newItem.currency,
                  marketplaceId: marketplaceId,
                  accountName: accountName,
                  userId: userId,
                  title: newItem.title,
                });

                console.log("quantity", newItem.quantity);

                try {
                  await syncMarketplaceQuantities(
                    newItem?.sku,
                    newItem?.quantity,
                    userId,
                    'Shopify',
                    line.quantity,
                    accountName
                  );
                  apiCallLog("pushDataShopify-syncMarketplaceQuantities", "/order/get-order-cron", functionName,
                    {
                      accountName: accountName,
                      sku: newItem?.sku,
                      quantity: newItem?.quantity,
                      userId: userId,
                      marketplace: 'Shopify',
                      lineQuantity: line.quantity,
                    }
                    , {}, {}, 'success');
                } catch (syncError) {
                  console.error('Error syncing quantities:', syncError);
                  apiCallLog("pushDataShopify-syncMarketplaceQuantities", "/order/get-order-cron", functionName,
                    {
                      accountName: accountName,
                      sku: newItem?.sku,
                      quantity: newItem?.quantity,
                      userId: userId,
                      marketplace: 'Shopify',
                      lineQuantity: line.quantity,
                    }
                    , {}, syncError, 'error');
                }

                if (!newItem.sku) {
                  iskuData.push({
                    isku: newItem.id,
                    costPrice: newItem.price,
                    title: newItem.title,
                    images: newItem.images,
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
                    iskuExist.quantity += newItem.quantity;
                    await iskuExist.save();
                  } else if (!iskuExist) {
                    iskuData.push({
                      isku: newItem.id,
                      costPrice: newItem.price,
                      title: newItem.title,
                      images: newItem.images,
                      quantity: newItem.quantity,
                      currency: newItem.currency,
                      accountName: accountName,
                      marketplaceId: marketplaceId,
                      userId: userId,
                    });
                  }
                }
              } else {
                console.log("csku found");
                try {
                  const allCskus = await csku.findAll({
                    where: {
                      channelId: cskuExist.dataValues.channelId,
                      id: {
                        [Op.ne]: cskuExist.dataValues.id,
                      },
                    },
                  });

                  const currentQuantity = cskuExist.dataValues.quantity;
                  const lineQuantity = line.quantity;

                  // Only sync if it's not the first fetch and status indicates a confirmed order
                  console.log("Syncing marketplace quantities for SKU", line.sku, "with status", status);
                  try {
                    const syncResult = await syncMarketplaceQuantities(
                      line.sku,
                      currentQuantity,
                      userId,
                      "Shopify",
                      lineQuantity,
                      accountName
                    );

                    console.log(`Marketplace sync result for SKU ${line.sku}:`, syncResult);
                    apiCallLog("pushDataShopify-syncMarketplaceQuantities", "/order/get-order-cron", functionName,
                      {
                        accountName: accountName,
                        sku: line?.sku,
                        currentQuantity: currentQuantity,
                        userId: userId,
                        marketplace: 'Shopify',
                        lineQuantity: lineQuantity,
                      }
                      , syncResult, {}, 'success');

                    if (!syncResult.success) {
                      console.error(`Failed to sync quantities for SKU ${line.sku}:`, syncResult.error);
                    }
                  } catch (syncError) {
                    console.error(`Error during marketplace sync for SKU ${line.sku}:`, syncError);
                    apiCallLog("pushDataShopify-syncMarketplaceQuantities", "/order/get-order-cron", functionName,
                      {
                        accountName: accountName,
                        sku: line?.sku,
                        currentQuantity: currentQuantity,
                        userId: userId,
                        marketplace: 'Shopify',
                        lineQuantity: lineQuantity,
                      }
                      , {}, syncError, 'error');
                  }


                  cskuExist.quantity =
                    cskuExist.dataValues.quantity - line.quantity;
                  await cskuExist.save();

                  if (allCskus.length > 0 && type !== "firstFetch") {
                    const quantity = cskuExist.dataValues.quantity - 1;
                    cskuExist.quantity = quantity;
                  }
                } catch (err) {
                  console.log(err);
                }
              }

              if (status === "paid" && type !== "firstFetch") {
                const msgData = {
                  receipientId: item.email,
                  message: "",
                  itemId: line.id,
                  subject: "Order received",
                };
                const template = await emailTemplate.findOne({
                  where: {
                    accountName: accountName,
                    userId: userId,
                    order_status: "paid",
                  },
                });
                if (template) {
                  msgData.message = template.dataValues.email_template;
                  msgData.message = msgData.message
                    .replace(/{{buyerName}}/g, item.customer.id)
                    .replace(/{{itemName}}/g, line.title)
                    .replace(/{{orderId}}/g, item.id)
                    .replace(/{{sellerId}}/g, accountName)
                    .replace(/{{totalPrice}}/g, item.total_price);
                  SendMessage(msgData);
                }
              } else if (status === "shipped" && type !== "firstFetch") {
                const msgData = {
                  receipientId: item.email,
                  message: "",
                  itemId: line.id,
                  subject: "Order shipped",
                };
                const template = await emailTemplate.findOne({
                  where: {
                    accountName: accountName,
                    userId: userId,
                    order_status: "shipped",
                  },
                });
                if (template) {
                  msgData.message = template.dataValues.email_template;
                  msgData.message = msgData.message
                    .replace(/{{buyerName}}/g, item.customer.id)
                    .replace(/{{itemName}}/g, line.title)
                    .replace(/{{orderId}}/g, item.id)
                    .replace(/{{sellerId}}/g, accountName)
                    .replace(/{{totalPrice}}/g, item.total_price);
                  SendMessage(msgData);
                }
              }
            }
          }

          response.push({
            orderId: item.id,
            creationDate: item.created_at,
            lastModifiedDate: item.updated_at,
            orderFulfillmentStatus: item.fulfillment_status,
            orderPaymentStatus: item.financial_status,
            sellerId: accountName,
            buyerUserName: item.customer.id || null,
            buyerRegistrationAddress: {
              fullName: item.billing_address.Sunreet,
              addressLine1: item.shipping_address?.address1 || null,
              city: item.shipping_address?.city || null,
              stateOrProvince: item.shipping_address?.province || null,
              postalCode: item.shipping_address?.zip || null,
              countryCode: item.shipping_address?.country || null,
              primaryPhone: item.shipping_address?.phone || null,
              email: item.email || null,
            },
            pricingSummary: {
              total: item.total_price,
              subtotal: item.subtotal_price,
              total_tax: item.total_tax,
              total_discounts: item.total_discounts,
            },
            payments: item.financial_status,
            fulfillmentStartInstructions: [],
            items: item.line_items.map((line) => ({
              lineItemId: line.id,
              itemId: line.product_id,
              sku: line.sku,
              itemCost: line.price,
              quantity: line.quantity,
              appliedPromotions: [],
              lineItemStatus: line.fulfillment_status,
            })),
            totalMarketplaceFee: 0, // Shopify doesn't provide this directly
            marketplaceId: marketplaceId,
            status: status,
            accountName: accountName,
            userId: userId,
            shippedDate: status === "shipped" ? new Date().toISOString() : null,
          });
        } else if (orderExist) {
          if (status !== orderExist.dataValues.status) {
            for (let j = 0; j < item.line_items.length; j++) {
              let line = item.line_items[j];
              const msgData = {
                receipientId: item.email,
                message: "",
                itemId: line.id,
                subject: "Order received",
              };

              const template = await emailTemplate.findOne({
                where: {
                  accountName: accountName,
                  userId: userId,
                  order_status: status,
                },
              });
              if (template) {
                msgData.message = template.dataValues.email_template;
                msgData.message = msgData.message
                  .replace(/{{buyerName}}/g, item.customer.id)
                  .replace(/{{itemName}}/g, line.title)
                  .replace(/{{orderId}}/g, item.id)
                  .replace(/{{sellerId}}/g, accountName)
                  .replace(/{{totalPrice}}/g, item.total_price);
                SendMessage(msgData);
              }
            }
          }
          await order.update(
            {
              orderFulfillmentStatus: item.fulfillment_status,
              orderPaymentStatus: item.financial_status,
              status: status,
            },
            {
              where: {
                orderId: orderExist.dataValues.orderId,
              },
            }
          );
        }
      }

      response = response.filter((item) => item != null);

      await order.bulkCreate(response);
      await isku.bulkCreate(iskuData);
      await csku.bulkCreate(cskuData);
    } catch (error) {
      newRelic.recordCustomEvent(`Error while upload bulk order data. Error ${error}`);
      console.log(error);
      apiCallLog("pushDataShopify", "/order/get-order-cron", functionName,
        {
          accountName: accountName,
          type: type,
          userId: userId,
          marketplace: marketplaceId,
        }
        , {}, error, 'error');
    }
  }
}

exports.handleShopifyOrders = async (
  token,
  marketPlace,
  startDate,
  orders,
  marketplaceId,
  accountName,
  userId
) => {
  const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json?status=any`;
  const headers = {
    "X-Shopify-Access-Token": token.dataValues.token,
    "Content-Type": "application/json",
  };
  try {
    const response = await axios.get(shopifyUrl, { headers });
    const shopifyOrders = response.data.orders;

    console.log(response.data);

    orders.push(...shopifyOrders);
    await pushDataShopify(shopifyOrders, marketplaceId, accountName, userId);
  } catch (error) {
    console.error("Error fetching Shopify orders:", error);
    throw new Error("Error fetching Shopify orders");
  }
};
