const puppeteer = require("puppeteer");
const { sequelize } = require("../../../database/config");
const order = require("../../../models/order");
const csku = require("../../../models/csku");
const isku = require("../../../models/isku");
const Marketplace = require("../../../models/marketplace");
const Tokens = require("../../../models/tokens");
const ebay = require("ebay-api");
const moment = require("moment");
const { Op } = require("sequelize");
const newRelic = require("newrelic");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const { emailTemplate } = require("../../../models/emailTemplate");
const { SendEmail } = require("../../../helper/sendEmail");
const { SendMessage } = require("./message");
const { use } = require("../../../routers/api/v1");
const { createProxyMiddleware } = require("http-proxy-middleware");
const HttpsProxyAgent = require("https-proxy-agent");
const nodemailer = require("nodemailer");
const axios = require("axios");
const {GetEtsyOrders} =require("../../../marketplaceapis/etsy/order")
const {
  GetWoocommerceOrder,
  updateWooCommerceOrder,
  handleWooCommerceOrder,
  fetchWooCommerceCancelRequests,
  fetchWooCommerceReturn,
  getWoocommerceDeliveredOrders,
} = require("../../../marketplaceapis/woocommerce/order");
const {
  GetWalmartOrder,
  updateWalmartOrder,
  handleWalmartOrder,
  fetchWalmartCancelRequests,
  fetchWalmartReturns,
  getWalmartDeliveredOrders
} = require("../../../marketplaceapis/walmart/orders")
const marketplaces = require("./marketplaces");
const {
  fetchAndPushOrders,
  fetchShopifyReturns,
  getShopifyDeliveredOrders,
  updateShopifyStatus,
  fetchShopifyCancelRequests,
  handleShopifyOrders,
} = require("../../../marketplaceapis/shopify/orders");
const { updateShopifyInventory } = require("../../../marketplaceapis/shopify/catalogue");
const { updateEbayInventory } = require("../../../marketplaceapis/ebay/catalogue");

const { apiCallLog } = require("../../../helper/apiCallLog");
const { MessageLog } = require("../../../models/messageLog");

const ebayAuthToken = new EbayAuthToken({
  clientId: process.env.APP_ID,
  clientSecret: process.env.CERT_ID,
});

const scopes = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances",
  "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.reputation",
  "https://api.ebay.com/oauth/api_scope/sell.reputation.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.stores",
  "https://api.ebay.com/oauth/api_scope/sell.stores.readonly",
];

exports.FetchOrders = async (req, res) => {
  const functionName = "FetchOrders"
  try {
    const { userId, marketplaceId, accountName, startDate, addQuantity } =
      req.body;

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
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

    let orders = [];
    if (marketPlace.url?.includes("ebay") && token) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
      });
      eBay.OAuth2.setCredentials(token.dataValues.token);

      let startdate = moment().add(5, "hours").add(30, "minutes");
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token)
      }

      // try {
      //   await eBay.trading.GetTokenStatus({
      //     RequesterCredentials: {
      //       eBayAuthToken: token.dataValues.token,
      //     },
      //   });
      //   await apiCallLog("GetTokenStatus","/order/get-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
      // } catch (err) {
      //   await apiCallLog("GetTokenStatus","/order/get-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      //   await refreshToken(eBay, token);
      // }

      if (token.dataValues.ordersFetched === 0) {
        const formattedDate = moment(startDate)
          .subtract(120, "days")
          .toISOString();
        console.log(formattedDate);
        const data = await fetchEbayOrders(eBay, 0, formattedDate);

        orders.push(...data.orders);
        await pushData(eBay, data, marketplaceId, accountName, userId, "firstFetch");
        token.ordersFetched = orders.length;
        await token.save();
        let offset = 100;
        while (orders.length < data.total) {
          console.log(orders.length);
          let startdate = moment().add(5, "hours").add(30, "minutes");
          let tokenExpiresDate = moment(token.lastTokenRefreshDate);
          let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

          if (hoursDifference >= 2) {
            refreshToken(eBay, token)
          }
          // try {
          //   await eBay.trading.GetTokenStatus({
          //     RequesterCredentials: {
          //       eBayAuthToken: token.dataValues.token,
          //     },
          //   });
          //   await apiCallLog("GetTokenStatus","/order/get-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
          // } catch (err) {
          //   await apiCallLog("GetTokenStatus","/order/get-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
          //   await refreshToken(eBay, token);
          // }
          const data = await fetchEbayOrders(eBay, offset, formattedDate);

          orders.push(...data.orders);
          offset += 100;
          await pushData(eBay, data, marketplaceId, accountName, userId, "firstFetch");
          token.ordersFetched = orders.length;
          await token.save();
        }
      } else if (token.dataValues.ordersFetched > 0) {
        const formattedDate = moment(startDate)
          .subtract(120, "days")
          .toISOString();
        const data = await fetchEbayOrders(
          eBay,
          token.dataValues.ordersFetched,
          formattedDate
        );

        orders.push(...data.orders);
        await pushData(eBay, data, marketplaceId, accountName, userId, "firstFetch");
        token.ordersFetched += orders.length;
        await token.save();

        let offset = token.dataValues.ordersFetched + 100;
        while (orders.length < data.total) {
          let startdate = moment().add(5, "hours").add(30, "minutes");
          let tokenExpiresDate = moment(token.lastTokenRefreshDate);
          let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

          if (hoursDifference >= 2) {
            await refreshToken(eBay, token)
          }
          // try {
          //   await eBay.trading.GetTokenStatus({
          //     RequesterCredentials: {
          //       eBayAuthToken: token.dataValues.token,
          //     },
          //   });
          //   await apiCallLog("GetTokenStatus","/order/get-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
          // } catch (err) {
          //   await apiCallLog("GetTokenStatus","/order/get-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
          //   await refreshToken(eBay, token);
          // }
          const data = await fetchEbayOrders(eBay, offset, formattedDate);
          orders.push(...data.orders);
          offset += 100;
          await pushData(eBay, data, marketplaceId, accountName, userId, "firstFetch");
          token.ordersFetched += orders.length;
          await token.save();
        }
      }
    } else if (marketPlace.url?.includes("shopify") && token) {

      await fetchAndPushOrders(
        marketplaceId,
        accountName,
        userId,
        token.dataValues.token,
        "firstFetch"
      );

      // const count = data.length;
      return res.status(200).json({
        success: true,
        status: 200,
        // len: data,
      });
    } else if (marketPlace.url?.includes("woocommerce")) {
      orders = await GetWoocommerceOrder(
        accountName,
        token?.dataValues?.token,
        marketplaceId,
        userId,
        addQuantity,
        "firstFetch"
      );
      // return res.status(200).json({
      //   success: true,
      //   status: 200,
      //   // len: data,
      // });
    } else if (marketPlace.url?.includes("walmart")) {
      orders = await GetWalmartOrder(
        accountName,
        token,
        marketplaceId,
        userId,
        addQuantity,
        "firstFetch",
        startDate,
      )

    } else if (marketPlace.url?.includes("sellerflex")) {

      const status = ["ACCEPTED", "UNFULFILLABLE", "CONFIRMED", "PACKAGE_CREATED", "PICKUP_SLOT_RETRIEVED", "INVOICE_GENERATED", "SHIPLABEL_GENERATED", "SHIPPED", "DELIVERED", "CANCELLED"];

      for (let i = 0; i < status.length; i++) {
        const data = {
          status: status[i],
          startDate: startDate,
          endDate: moment().toISOString(),
          clientId: token.dataValues.clientId,
          clientSecret: token.dataValues.clientSecret,
          refreshToken: token.dataValues.refreshToken,
          locationId: token.dataValues.locationId,
          lastUpdatedAfter: startDate,
          lastUpdatedBefore: moment().toISOString(),
          maxResults: 50,
          marketplaceId: marketplaceId,
          accountName: accountName,
          userId: userId
        }

        let config = {
          method: 'post',
          url: 'http://localhost:5001/sellerFlex/get-shipments',
          headers: {
            'Content-Type': 'application/json'
          },
          data: JSON.stringify(data)
        }

        await axios.request(config);

      }
    }else if( marketPlace.url?.includes("etsy")) {
      orders = await GetEtsyOrders(token,startDate,marketplaceId,accountName,userId,addQuantity,"shipped");
    }

    return res.status(200).json({
      success: true,
      status: 200,
      len: orders,
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

async function pushDataWooCommerec(
  orders,
  marketplaceId,
  accountName,
  userId,
  addQuantity
) {
  try {
    const iskuData = [];
    const cskuData = [];

    // console.log("data", orders)

    let response = await Promise.all(
      orders.map(async (item) => {
        let status = "UNPAID";
        let orderPaymentStatus = "UNPAID";
        let fulfillmentStatus = "NOT_STARTED";

        switch (item.status) {
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
            // case "completed":
            status = "shipped";
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

        const orderIdString = String(item.id);
        const orderExist = await order.findOne({
          where: {
            orderId: orderIdString,
            userId: userId,
            accountName: accountName,
          },
        });

        if (!orderExist) {
          await Promise.all(
            item.line_items.map(async (line) => {
              const cskuExist = await csku.findOne({
                where: { channelId: line.id.toString() },
              });
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
                  images: item.image ? item.image.src : {},
                  // description: item.note,
                  categoryId: null,
                  categoryName: null,
                  currency: item.currency,
                  marketplaceId: marketplaceId,
                  accountName: accountName,
                  userId: userId,
                };
                // console.log("qwerty", newItem)
                // console.log("qwertydf", cskuExist)

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
                  description: null,
                  categoryId: null,
                  categoryName: null,
                  quantity: newItem.quantity,
                  currency: newItem.currency,
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
                  if (iskuExist && addQuantity) {
                    iskuExist.quantity += newItem.quantity;
                    await iskuExist.save();
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

                  // if (allCskus.length > 0) {
                  //   updateMarketplaceData(allCskus);
                  // }
                } catch (err) {
                  console.log(err);
                }
              }

              // if (status == "paid") {
              // const msgData = {
              //   receipientId: item.email,
              //   message: "",
              //   itemId: line.id,
              //   subject: "Order received",
              // };
              // const template = await emailTemplate.findOne({
              //   where: {
              //     accountName: accountName,
              //     userId: userId,
              //     order_status: "paid",
              //   },{
              // });
              // if (template) {
              //   msgData.message = template.dataValues.email_template;
              //   msgData.message = msgData.message
              //     .replace(/{{buyerName}}/g, item.customer.first_name)
              //     .replace(/{{itemName}}/g, line.title)
              //     .replace(/{{orderId}}/g, item.id)
              //     .replace(/{{sellerId}}/g, item.vendor)
              //     .replace(/{{totalPrice}}/g, item.total_price);
              //   SendMessage(msgData);
              // }
              // } else if (status == "shipped") {
              //   const msgData = {
              //     receipientId: item.email,
              //     message: "",
              //     itemId: line.id,
              //     subject: "Order shipped",
              //   };
              //   const template = await emailTemplate.findOne({
              //     where: {
              //       accountName: accountName,
              //       userId: userId,
              //       order_status: "shipped",
              //     },
              //   });
              //   if (template) {
              //     msgData.message = template.dataValues.email_template;
              //     msgData.message = msgData.message
              //       .replace(/{{buyerName}}/g, item.customer.first_name)
              //       .replace(/{{itemName}}/g, line.title)
              //       .replace(/{{orderId}}/g, item.id)
              //       .replace(/{{sellerId}}/g, item.vendor)
              //       .replace(/{{totalPrice}}/g, item.total_price);
              //   SendMessage(msgData);
              // }
              // }
            })
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
          orderExist.dataValues.orderFulfillmentStatus = fulfillmentStatus;
          orderExist.dataValues.orderPaymentStatus = orderPaymentStatus;
          orderExist.dataValues.status = status;
          await orderExist.save();
          return null;
        }
      })
    );
    response = response.filter((item) => item != null);

    await order.bulkCreate(response);
    // await isku.bulkCreate(iskuData);
    // await csku.bulkCreate(cskuData);
  } catch (error) {
    console.log(error);
    throw error;
  }
}

//SECTION - update order Status
exports.updateStatus = async (req, res) => {
  const { id, userId, marketplaceId, accountName, status, channelId, comment, reason, orderId, packageDetails } = req.body;

  const marketPlace = await Marketplace.findOne({
    where: {
      id: marketplaceId,
    },
  });

  if (marketPlace.url?.includes("ebay")) {
    UpdateEbayStatus(id, userId, marketplaceId, accountName, status, res);
  } else if (marketPlace.url?.includes("shopify")) {
    await updateShopifyStatus(
      id,
      userId,
      marketplaceId,
      accountName,
      status,
      res
    );
  } else if (marketPlace.url?.includes("woocommerce")) {
    await updateWooCommerceOrder(
      id,
      userId,
      marketplaceId,
      accountName,
      status,
      res
    );
  } else if (marketPlace.url?.includes("walmart")) {
    await updateWalmartOrder(
      id,
      userId,
      marketplaceId,
      accountName,
      status,
      res,
      channelId,
      comment,
      reason
    );
  } else if (marketPlace.url?.includes("sellerflex")) {

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    const orderExist = await order.findOne({ where: { orderId: orderId }, raw: true });

    await updateSellerFlexOrder(
      orderId,
      orderExist.userId,
      orderExist.marketplaceId,
      orderExist.accountName,
      status,
      res,
      packageDetails
    );
  }
};

async function updateSellerFlexOrder(orderId,
  userId,
  marketplaceId,
  accountName,
  status,
  res,
  packageDetails) {

  try {

    const orderExist = await order.findOne({ where: { orderId: orderId } });

    if (!orderExist) {
      return res.status(400).json({
        success: false,
        message: "Order not found"
      });
    }

    const token = await Tokens.findOne({ where: { userId: userId, accountName: accountName, marketPlaceId: marketplaceId } });

    if (status == "confirmed") {

      let data = JSON.stringify({
        "clientId": token.dataValues.client_id,
        "clientSecret": token.dataValues.client_secret,
        "refreshToken": token.dataValues.refreshToken,
        "shipmentId": orderExist.shipmentId,
        "operation": "CONFIRM"
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://localhost:5001/sellerFlex/process-shipment',
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      };

      await axios.request(config)
        .then((response) => {
          console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
          return res.status(400).json({
            success: true,
            message: error.message
          });
        });

      orderExist.status = status;

      await orderExist.save();

      return res.status(200).json({
        success: true,
        message: "Order status updated successfully!"
      });

    }

    if (status == 'packed') {

      if (!packageDetails || packageDetails.length == 0) {
        return res.status(400).json({
          success: false,
          message: "Package details are required"
        });
      }

      const packageDetailsFinal = [];
      console.log(packageDetails);
      await Promise.all(packageDetails?.map(async (package, index) => {

        const lineItem = orderExist.dataValues.items.find(item => item.sku == package.merchantSku);
        const itemExist = await csku.findOne({ where: { isku: lineItem.sku } });
        const obj = {
          "dimensions": {
            "length": {
              "dimensionUnit": package.lengthUnit,
              "value": package.length
            },
            "width": {
              "dimensionUnit": package.widthUnit,
              "value": package.width
            },
            "height": {
              "dimensionUnit": package.heightUnit,
              "value": package.height
            }
          },
          "id": `${orderExist.dataValues.shipmentId}_package_${index}`,
          "weight": {
            "value": package.weight,
            "weightUnit": package.weightUnit
          },
          "hazmatLabels": lineItem.hazmatLabels,
          "packageLineItems": [
            {
              "packageLineItem": {
                "id": lineItem.lineItemId,
              },
              "quantity": lineItem.quantity,
              "serialNumbers": [
                package.serialNumber
              ]
            }
          ]
        }

        packageDetailsFinal.push(obj);
      }));
      console.log(packageDetailsFinal[0].packageLineItems);
      let data = JSON.stringify({
        "clientId": token.dataValues.client_id,
        "clientSecret": token.dataValues.client_secret,
        "refreshToken": token.dataValues.refreshToken,
        "shipmentId": orderExist.shipmentId,
        packageDetails: packageDetailsFinal
      });

      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://localhost:5001/sellerFlex/create-packages',
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      };

      await axios.request(config)
        .then((response) => {
          console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
          console.log(error);
          return res.status(400).json({
            success: true,
            message: error.message
          });
        });

      const packageId = packageDetailsFinal.map(item => item.id);

      orderExist.status = status;
      if (!orderExist.packageIds || orderExist.packageIds.length == 0) {
        orderExist.packageIds = packageId;
      } else if (orderExist.packageIds && orderExist.packageIds.length > 0) {
        orderExist.packageIds.push(...packageId);
      }
      await orderExist.save();

      return res.status(200).json({
        success: true,
        message: "Order status successfully updated"
      });
    }

    if (status == "ready to ship") {

      const response = [];

      for (var i = 0; i < orderExist.dataValues.packageIds.length; i++) {
        let data = JSON.stringify({
          "clientId": token.dataValues.client_id,
          "clientSecret": token.dataValues.client_secret,
          "refreshToken": token.dataValues.refreshToken,
          "shipmentId": orderExist.dataValues.shipmentId,
          packageId: orderExist.dataValues.packageIds[i],
          operation: "GENERATE"
        });

        let config = {
          method: 'post',
          maxBodyLength: Infinity,
          url: 'http://localhost:5001/sellerFlex/retrieve-shipping-options',
          headers: {
            'Content-Type': 'application/json'
          },
          data: data
        };

        await axios.request(config)
          .then((response) => {
            console.log(JSON.stringify(response.data));
          })
          .catch((error) => {
            console.log(error.response.data);
            return res.status(400).json({
              success: true,
              message: error.message
            });
          });

        let invoiceConfig = {
          method: 'post',
          maxBodyLength: Infinity,
          url: 'http://localhost:5001/sellerFlex/generate-invoice',
          headers: {
            'Content-Type': 'application/json'
          },
          data: data
        };

        const invoiceRes = await axios.request(invoiceConfig);

        let shipLabelConfig = {
          method: 'post',
          maxBodyLength: Infinity,
          url: 'http://localhost:5001/sellerFlex/generate-ship-label',
          headers: {
            'Content-Type': 'application/json'
          },
          data: data
        };

        const shipLabelRes = await axios.request(shipLabelConfig);

        response.push({
          invoice: invoiceRes.data,
          shipLabel: shipLabelRes.data
        });

      }

      return res.status(200).json({
        success: true,
        message: "Order status updated successfully!",
        data: response
      });

    }

  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message
    });
  }

}

async function fetchEbayOrders(eBay, offset, formattedDate, type) {
  try {
    const functionName = "fetchEbayOrders"
    apiCallLog("calling fetchEbayOrders", "/order/get-order-cron", functionName,
      {
        ebay: eBay,
        type: type
      }
      , {}, {}, 'success');
    console.log(type);
    const query =
      type === "shipped"
        ? {
          filter: `orderfulfillmentstatus:{FULFILLED|IN_PROGRESS},lastmodifieddate:[${formattedDate}..]`,
        }
        : { filter: `creationdate:[${formattedDate}..]` };

    const data = await eBay.sell.fulfillment.getOrders({
      ...query,
      limit: 100,
      offset: offset,
    });
    apiCallLog("fetchEbayOrders", "/order/get-order-cron", functionName,
      {
        query: query
      }
      , { data: data }, {}, 'success');
    return data;
  } catch (error) {
    console.log(error);
  }
}

const syncMarketplaceQuantities = require('./marketplaceSync');
const EbayRestock = require("./ebayRestock");
const sendUpdateReportEmail = require("../../../helper/sendUpdateReportEmail");

function isPreviousDate(dateString) {
  const inputDate = moment(dateString); // Parse the input date
  const currentDate = moment().add(5, "hours").add(30, "minutes"); // Get the current date and time

  // Check if the input date is before the current date
  return inputDate.isBefore(currentDate, 'day');
}

async function pushData(
  eBay,
  data,
  marketplaceId,
  accountName,
  userId,
  addQuantity,
  type
) {
  const functionName = "pushData"
  try {
    apiCallLog("pushData", "/order/get-order-cron", functionName,
      {
        eBay: eBay,
        data: data,
        marketplaceId: marketplaceId,
        accountName: accountName,
        userId: userId,
        type: type
      }
      , {}, {}, 'success');
    const iskuData = [];
    const cskuData = [];
    const iskusToBeUpdated = [];
    const updateMarketplaceArray = [];

    let response = await Promise.all(
      data.orders.map(async (item) => {
        let status = "unpaid";
        let shippingDate = "";
        let today = moment().add(5, "hours").add(30, "minutes");
        let creationDate = moment(item.creationDate);

        if (
          item.orderFulfillmentStatus == "NOT_STARTED" &&
          item.orderPaymentStatus == "PAID"
        ) {
          status = "paid";
        } else if (
          item.orderFulfillmentStatus == "IN_PROGRESS" &&
          item.orderPaymentStatus == "PAID"
        ) {
          status = "in_progress";
        } else if (
          item.orderFulfillmentStatus == "FULFILLED" &&
          item.orderPaymentStatus == "PAID"
        ) {
          status = "shipped";
        }

        const orderExist = await order.findOne({
          where: {
            orderId: item.orderId,
            userId: userId,
            accountName: accountName,
          },
        });

        if (!orderExist) {

          const lineItems = [];
          await Promise.all(
            item.lineItems?.map(async (line) => {
              const cskuExist = await csku.findOne({
                where: { channelId: line?.legacyItemId.toString() },
              });
              if (!cskuExist) {
                const newItem = await eBay.trading
                  .GetItem({
                    ItemID: line?.legacyItemId,
                    DetailLevel: "ReturnAll",
                  })
                  .catch((err) => {
                    console.log(err)
                    apiCallLog("GetItem", "/order/get-order-cron", functionName,
                      {
                        ItemID: line?.legacyItemId,
                        DetailLevel: "ReturnAll",
                      }
                      , {}, err.meta, 'error');
                  }
                  );
                await apiCallLog("GetItem", "/order/get-order-cron", functionName,
                  {
                    ItemID: line?.legacyItemId,
                    DetailLevel: "ReturnAll",
                  }
                  , newItem, {}, 'success');

                if (newItem) {
                  await Tokens.update(
                    {
                      itemsFetched: sequelize.literal(
                        `CAST("itemsFetched" AS INTEGER) + ${1}`
                      ),
                    },
                    { where: { userId: userId, accountName: accountName } }
                  );

                  cskuData.push({
                    channelId: newItem?.Item.ItemID,
                    variantId: newItem?.Item.SKU ? newItem?.Item.SKU : null,
                    isku: newItem?.Item.SKU
                      ? newItem?.Item.SKU
                      : newItem?.Item.ItemID,
                    price: newItem?.Item.StartPrice.value,
                    mrp: newItem?.Item.StartPrice.value,
                    images: Array.isArray(
                      newItem?.Item.PictureDetails?.PictureURL
                    )
                      ? newItem?.Item.PictureDetails?.PictureURL
                      : [newItem?.Item.PictureDetails?.PictureURL],
                    description: newItem?.Item.Description,
                    categoryId: newItem?.Item.PrimaryCategory.CategoryID,
                    categoryName: newItem?.Item.PrimaryCategory.CategoryName,
                    quantity: newItem?.Item.Quantity,
                    currency: newItem?.Item.StartPrice.currencyID,
                    marketplaceId: marketplaceId,
                    accountName: accountName,
                    userId: userId,
                    title: newItem?.Item.Title,
                  });

                  const newQuantity = newItem?.Item.Quantity;
                  console.log("newItemquantity", newItem, newQuantity)
                  if (!newItem?.Item?.SKU) {
                    iskuData.push({
                      isku: newItem.Item.ItemID,
                      costPrice: newItem.Item.StartPrice?.value,
                      title: newItem.Item.Title,
                      images: Array.isArray(item.PictureDetails?.PictureURL)
                        ? newItem.Item.PictureDetails?.PictureURL
                        : [newItem.Item.PictureDetails?.PictureURL],
                      quantity: newItem.Item.Quantity,
                      currency: newItem.Item.StartPrice.currencyID,
                      accountName: accountName,
                      marketplaceId: marketplaceId,
                      userId: userId,
                    });
                  } else if (item.SKU) {
                    const iskuExist = await isku.findOne({
                      where: { isku: newItem?.Item.SKU.toString(), userId: userId },
                    });
                    if (iskuExist) {
                      const updatedQuantity = iskuExist.quantity - newQuantity;
                      iskuExist.quantity = updatedQuantity;
                      await iskuExist.save();
                      console.log("updatedQuantity", updatedQuantity)
                      // iskusToBeUpdated.push({ isku: cskuExist.dataValues.isku, quantity: updatedQuantity, lineQuantity: line.quantity, accountName: accountName, userId: userId, ignoreChannelId: newItem.Item.ItemID });
                      if (today.diff(creationDate, 'days') < 7) {
                        iskusToBeUpdated.push({ isku: cskuExist.dataValues.isku, quantity: updatedQuantity, lineQuantity: line.quantity, accountName: accountName, userId: userId, ignoreChannelId: newItem.Item.ItemID });
                      }
                      // Sync quantity for existing SKU
                    } else if (!iskuExist) {
                      iskuData.push({
                        isku: newItem.Item.ItemID,
                        costPrice: newItem.Item.StartPrice?.value,
                        title: newItem.Item.Title,
                        images: Array.isArray(item.PictureDetails?.PictureURL)
                          ? newItem.Item.PictureDetails?.PictureURL
                          : [newItem.Item.PictureDetails?.PictureURL],
                        quantity: newItem.Item.Quantity,
                        currency: newItem.Item.StartPrice.currencyID,
                        accountName: accountName,
                        marketplaceId: marketplaceId,
                        userId: userId,
                      });
                    }
                  }
                } else {
                  status = "problematic order";
                }
              } else {
                try {
                  const allCskus = await csku.findAll({
                    where: {
                      isku: cskuExist.dataValues.isku,
                      id: {
                        [Op.ne]: cskuExist.dataValues.id,
                      },
                      userId: userId,
                    },
                  });

                  // if (allCskus.length > 0 && type != "firstFetch") {
                  //   const ebayRestockArr = await EbayRestock.updateEbayInventory(userId, allCskus, line.quantity);
                  //   updateMarketplaceArray.push(...ebayRestockArr);
                  // }

                  if (today.diff(creationDate, 'days') < 7 && type != "firstFetch") {

                    const updatedQuantity = cskuExist.dataValues.quantity - line.quantity;

                    iskusToBeUpdated.push({ isku: cskuExist.dataValues.isku, quantity: updatedQuantity, lineQuantity: line.quantity, accountName: accountName, userId: userId, ignoreChannelId: cskuExist.dataValues.channelId });
                    console.log("updatedQuantity1", updatedQuantity);

                    if (allCskus.length > 0 && type != "firstFetch") {
                      updateMarketplaceArray.push({ receivedQuantity: line.quantity, cskus: allCskus });
                    }
                  }

                  // const updatedQuantity = cskuExist.dataValues.quantity - line.quantity;
                  // await csku.update(
                  //   { quantity: updatedQuantity },
                  //   { where: { channelId: cskuExist.dataValues.channelId } }
                  // );
                  // iskusToBeUpdated.push({ isku: cskuExist.dataValues.isku, quantity: updatedQuantity, lineQuantity: line.quantity, accountName: accountName, userId: userId, ignoreChannelId: cskuExist.dataValues.channelId });
                  // console.log("updatedQuantity1", updatedQuantity)

                  lineItems.push({
                    "sku_id": cskuExist.dataValues.variationId,
                    "item_id": cskuExist.dataValues.partnerSku,
                    "quantity": line.quantity,
                    "price": cskuExist.dataValues.mrp,
                  })
                  apiCallLog("pushData(cskuExist)", "/order/get-order-cron", functionName,
                    {
                      accountName: accountName,
                      channelId: cskuExist?.dataValues.channelId
                    }
                    , {}, {}, 'success');

                } catch (err) {
                  apiCallLog("pushData", "/order/get-order-cron", functionName,
                    {
                      accountName: accountName,
                    }
                    , {}, err, 'error');
                  console.log(err);
                }
              }

              // if(!orderExist) {
              //   console.log("Order not found");
              //   const newItem = await eBay.trading
              //     .GetItem({
              //       ItemID: line?.legacyItemId,
              //       DetailLevel: "ReturnAll",
              //     })
              //     .catch((err) => {
              //       console.log(err)
              //       apiCallLog("GetItem", "/order/get-order-cron", functionName,
              //         {
              //           ItemID: line?.legacyItemId,
              //           DetailLevel: "ReturnAll",
              //         }
              //         , {}, err.meta, 'error');
              //     }
              //     );
              //     const updatedQuantity = cskuExist.dataValues.quantity - line.quantity;
              //     console.log("updatedQuantity2",line.quantity,cskuExist.dataValues.quantity);

              //   try {
              //     await syncEbayAndWalmartQuantity(
              //       line?.lineItemId,
              //       updatedQuantity,
              //       userId,
              //       'eBay',
              //       cskuExist.dataValues.quantity 
              //     );
              //   } catch (syncError) {
              //     console.error('Error syncing quantities:', syncError);
              //   }
              // }



              if (status == "paid" && type != "firstFetch") {
                let messageStatus;
                if (item?.orderId) {
                  messageStatus = await MessageLog.findOne({
                    where: {
                      order_number: item?.orderId,
                      status: "paid",
                    },
                  });
                } else {
                  console.error("orderId is null or undefined.");
                }
                if (messageStatus) {
                  await order.update(
                    { status: 'paid' },
                    {
                      where: {
                        orderId: item.orderId,
                      },
                    }
                  );
                  console.log(`Order ${item.orderId} is already paid. Skipping.`);
                  return;
                }
                else {
                  const msgData = {
                    receipientId: item.buyer?.username,
                    message: "",
                    itemId: line.legacyItemId,
                    subject: "",
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
                    msgData.subject = template.dataValues.subject;

                    const delay = template.dataValues?.sendingtrigger;
                    let delayMs = 0;

                    if (delay) {
                      const [value, unit] = delay?.split(' ');
                      delayMs = value * (unit.startsWith('hour') ? 3600000 : 0);
                    } else {
                      console.log("Sending immediately");
                    }

                    msgData.message = msgData?.message
                      ?.replace(/{{buyerName}}/g, item.buyer.username)
                      .replace(/{{itemName}}/g, line.title)
                      .replace(/{{orderId}}/g, item.orderId)
                      .replace(/{{sellerId}}/g, item.sellerId)
                      .replace(/{{totalPrice}}/g, item.pricingSummary.total.value);

                    if (delayMs > 0) {
                      console.log("Sending By delay")
                      setTimeout(() => {
                        SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                      }, delayMs);
                    } else {
                      console.log("Sending Immediately")
                      SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                    }
                  }
                }
              } else if (status == "shipped" && type != "firstFetch") {
                let messageStatus;
                if (item?.orderId) {
                  messageStatus = await MessageLog.findOne({
                    where: {
                      order_number: item.orderId,
                      status: "shipped"
                    },
                  })
                } else {
                  console.error("orderId is null or undefined.");
                }
                if (messageStatus) {
                  await order.update(
                    { status: 'shipped' },
                    {
                      where: {
                        orderId: item.orderId,
                      },
                    }
                  );
                  console.log(`Order ${item.orderId} is already shipped. Skipping.`);
                  return;
                }
                else {
                  const estDeliveryDate = moment(item?.fulfillmentStartInstructions[0]?.maxEstimatedDeliveryDate)
                  const estDeliveryDays = moment().diff(estDeliveryDate, 'days');

                  const msgData = {
                    receipientId: item.buyer?.username,
                    message: "",
                    itemId: line?.legacyItemId,
                    subject: "",
                  };
                  const template = await emailTemplate.findOne({
                    where: {
                      accountName: accountName,
                      userId: userId,
                      order_status: "shipped",
                    },
                  });
                  const fulfillmentData =
                    await eBay.sell.fulfillment.getShippingFulfillments(
                      item.orderId
                    );
                  console.log(fulfillmentData.fulfillments);
                  if (fulfillmentData && fulfillmentData?.total > 0) {
                    let found = false;
                    let tracking_number = "";
                    let shippedDate;
                    let carrierCode = "";
                    fulfillmentData.fulfillments?.map((fulfillment) => {
                      if (
                        fulfillment.lineItems?.find(
                          (lineItem) =>
                            lineItem.lineItemId.toString() ==
                            line?.lineItemId?.toString()
                        )
                      ) {
                        found = true;
                        tracking_number = fulfillment?.shipmentTrackingNumber;
                        shippedDate = fulfillment?.shippedDate;
                        carrierCode = fulfillment?.shippingCarrierCode;
                      }
                    });
                    if (template && found) {
                      shippingDate = shippedDate;
                      msgData.message = template.dataValues.email_template;
                      msgData.subject = template.dataValues.subject;

                      const carrierName = getCarrierName(carrierCode);

                      if (carrierName === "Unknown Carrier") {
                        msgData.message = msgData.message.replace(
                          "You can track the progress of your package using the provided tracking number through the {{carrierCode}} website.",
                          "You can track the progress of your package using the provided tracking number through your eBay account."
                        );
                      }

                      const delay = template.dataValues?.sendingtrigger;
                      let delayMs = 0;

                      if (delay) {
                        const [value, unit] = delay?.split(' ');
                        delayMs = value * (unit.startsWith('hour') ? 3600000 : 0);
                      } else {
                        console.log("Sending immediately.");
                      }

                      msgData.message = msgData?.message
                        ?.replace(/{{buyerName}}/g, item.buyer.username)
                        .replace(/{{itemName}}/g, line.title)
                        .replace(/{{orderId}}/g, item.orderId)
                        .replace(/{{sellerId}}/g, item.sellerId)
                        .replace(/{{trackingNumber}}/g, tracking_number)
                        .replace(/{{carrierCode}}/, carrierName)
                        .replace(/{{shippedDate}}/g, moment(shippedDate).format("DD/MM/YYYY"))
                        .replace(/{{estDeliveryDays}}/g, estDeliveryDays);

                      let maxEstimatedDeliveryDate = moment(item.fulfillmentStartInstructions[0].maxEstimatedDeliveryDate).format("YYYY-MM-DD");

                      if (!isPreviousDate(maxEstimatedDeliveryDate)) {
                        if (delayMs > 0) {
                          console.log("Sending message with delay...");
                          setTimeout(() => {
                            SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                          }, delayMs);
                        } else {
                          console.log("Sending message immediately...");
                          SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                        }
                      }
                    }
                  }
                }
              }
            })
          );

          let data = JSON.stringify({
            "email": "ebay@cartlow.com",
            "password": "Cartlow@123"
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

          let cartlowErrors = "";
          let cartLowToken = "";
          let cartlow_order_id = ""

          if (accountName.toLowerCase().includes("cartlow")) {
            await axios.request(config)
              .then(async (response) => {
                if (response.data.error) {
                  cartlowErrors = JSON.stringify(response.data);

                  let mailOptions = {
                    from: process.env.FROM_EMAIL,
                    to: "ramshad@cartlow.com",
                    cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                    subject: "Order Creation Error",
                    text: `The cartlow order creation errored out for token generation with error ${JSON.stringify(response.data)}`,
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

            let createOrder = JSON.stringify({
              "order_id": item.orderId,
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

            if (cartLowToken && cartLowToken != "") {
              await axios.request(createOrderConfig)
                .then(async (response) => {
                  if (response.data.error) {
                    cartlowErrors = JSON.stringify(response.data);

                    let mailOptions = {
                      from: process.env.FROM_EMAIL,
                      to: "ramshad@cartlow.com",
                      cc: "akhlaq@mergekart.com, aditya@mergekart.com",
                      subject: "Order Creation Error",
                      text: `The cartlow order creation errored out for order id ${item.orderId} with error ${response.data.error}`,
                    };

                    try {
                      await sendUpdateReportEmail(mailOptions);
                    } catch (err) {
                      console.log(err);
                      await apiCallLog("sendUpdateReportEmail", "/order/get-order-cron", "pushData", {}, {}, { error: err.message }, 'error');
                    }


                  } else {
                    cartlow_order_id = response.data.order_id;
                  }
                  console.log(JSON.stringify(response.data));
                })
                .catch((error) => {
                  console.log(error);
                  cartlowErrors = JSON.stringify(error);
                });
            }
          }


          return {
            orderId: item.orderId,
            creationDate: item.creationDate,
            lastModifiedDate: item.lastModifiedDate,
            orderFulfillmentStatus: item.orderFulfillmentStatus,
            orderPaymentStatus: item.orderPaymentStatus,
            sellerId: item.sellerId,
            buyerUserName: item.buyer?.username,
            buyerRegistrationAddress: {
              fullName: item.buyer.buyerRegistrationAddress.fullName,
              addressLine1:
                item.buyer.buyerRegistrationAddress.contactAddress.addressLine1,
              city: item.buyer.buyerRegistrationAddress.contactAddress.city,
              stateOrProvince:
                item.buyer.buyerRegistrationAddress.contactAddress
                  .stateOrProvince,
              postalCode:
                item.buyer.buyerRegistrationAddress.contactAddress.postalCode,
              countryCode:
                item.buyer.buyerRegistrationAddress.contactAddress.countryCode,
              primaryPhone:
                item.buyer.buyerRegistrationAddress.primaryPhone?.phoneNumber,
              secondaryPhone:
                item.buyer.buyerRegistrationAddress.secondaryPhone?.phoneNumber,
              email: item.buyer.buyerRegistrationAddress.email,
            },
            pricingSummary: item.pricingSummary,
            payments: item.paymentSummary?.payments,
            fulfillmentStartInstructions:
              item.fulfillmentStartInstructions?.map((item) => {
                return {
                  minEstimatedDeliveryDate: item.minEstimatedDeliveryDate,
                  maxEstimatedDeliveryDate: item.maxEstimatedDeliveryDate,
                  shippingStep: item.shippingStep?.shipTo,
                };
              }),
            items: item.lineItems?.map((line) => {
              return {
                lineItemId: line.lineItemId,
                itemId: line.legacyItemId,
                sku: line.sku,
                itemCost: line.lineItemCost,
                quantity: line.quantity,
                appliedPromotions: line.appliedPromotions,
                lineItemStatus: line.lineItemFulfillmentStatus,
              };
            }),
            totalMarketplaceFee: item.totalMarketplaceFee,
            marketplaceId: marketplaceId,
            status: status,
            accountName: accountName,
            userId: userId,
            shippedDate: status == "shipped" ? shippingDate : null,
            cartlowErrors: cartlowErrors,
            cartlow_order_id: cartlow_order_id
          };
        } else {
          orderExist.orderFulfillmentStatus =
            item.orderFulfillmentStatus;
          orderExist.orderPaymentStatus = item.orderPaymentStatus;
          orderExist.lastModifiedDate = item.lastModifiedDate;
          if (
            status != orderExist.dataValues.status &&
            orderExist.dataValues.status != "delivered"
          ) {
            if (status == "paid" && type != "firstFetch") {
              console.log("");
              let messageStatus;
              if (item?.orderId) {
                messageStatus = await MessageLog.findOne({
                  where: {
                    order_number: item.orderId,
                    status: "paid"
                  },
                })
              } else {
                console.error("orderId is null or undefined.");
              }
              if (messageStatus) {
                await order.update(
                  { status: 'paid' },
                  {
                    where: {
                      orderId: item.orderId,
                    },
                  }
                );
                console.log(`Order ${item.orderId} is already paid. Skipping.`);
                return;
              }
              await Promise.all(
                item?.lineItems?.map(async (line) => {
                  const msgData = {
                    receipientId: item.buyer?.username,
                    message: "",
                    itemId: line?.legacyItemId,
                    subject: "",
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
                    msgData.subject = template.dataValues.subject;

                    const delay = template.dataValues?.sendingtrigger;
                    let delayMs = 0;

                    if (delay) {
                      const [value, unit] = delay?.split(' ');
                      delayMs = value * (unit.startsWith('hour') ? 3600000 : 0);
                    } else {
                      console.log("Sending immediately");
                    }

                    msgData.message = msgData?.message
                      ?.replace(/{{buyerName}}/g, item.buyer.username)
                      .replace(/{{itemName}}/g, line.title)
                      .replace(/{{orderId}}/g, item.orderId)
                      .replace(/{{sellerId}}/g, item.sellerId)
                      .replace(/{{totalPrice}}/g, item.pricingSummary.total.value);

                    if (delayMs > 0) {
                      console.log("Sending By delay")
                      setTimeout(() => {
                        SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                      }, delayMs);
                    } else {
                      console.log("Sending Immediately")
                      SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                    }
                  }
                })
              );
            } else if (status == "shipped" && type != "firstFetch") {
              let messageStatus;
              if (item?.orderId) {
                messageStatus = await MessageLog.findOne({
                  where: {
                    order_number: item.orderId,
                    status: "shipped"
                  },
                })
              } else {
                console.error("orderId is null or undefined.");
              }
              if (messageStatus) {
                await order.update(
                  { status: 'shipped' },
                  {
                    where: {
                      orderId: item.orderId,
                    },
                  }
                );
                console.log(`Order ${item.orderId} is already shipped. Skipping.`);
                return;
              }
              await Promise.all(
                item.lineItems?.map(async (line) => {

                  const estDeliveryDate = moment(item?.fulfillmentStartInstructions[0]?.maxEstimatedDeliveryDate)
                  const estDeliveryDays = moment().diff(estDeliveryDate, 'days');

                  const msgData = {
                    receipientId: item.buyer?.username,
                    message: "",
                    itemId: line?.legacyItemId,
                    subject: "",
                  };
                  const template = await emailTemplate.findOne({
                    where: {
                      accountName: accountName,
                      userId: userId,
                      order_status: "shipped",
                    },
                  });
                  const fulfillmentData =
                    await eBay.sell.fulfillment.getShippingFulfillments(
                      item.orderId
                    );
                  if (fulfillmentData && fulfillmentData?.total > 0) {
                    let found = false;
                    let tracking_number = "";
                    let shippedDate;
                    let carrierCode;
                    fulfillmentData.fulfillments?.map((fulfillment) => {
                      if (
                        fulfillment.lineItems?.find(
                          (lineItem) =>
                            lineItem.lineItemId.toString() ==
                            line?.lineItemId.toString()
                        )
                      ) {
                        found = true;
                        tracking_number = fulfillment?.shipmentTrackingNumber;
                        shippedDate = fulfillment?.shippedDate;
                        carrierCode = fulfillment?.shippingCarrierCode;
                      }
                    });
                    console.log("shippedDate", shippedDate);
                    if (template && found) {
                      shippingDate = shippedDate;
                      msgData.message = template.dataValues.email_template;
                      msgData.subject = template.dataValues.subject;

                      const carrierName = getCarrierName(carrierCode);

                      if (carrierName === "Unknown Carrier") {
                        msgData.message = msgData.message.replace(
                          "You can track the progress of your package using the provided tracking number through the {{carrierCode}} website.",
                          "You can track the progress of your package using the provided tracking number through your eBay account."
                        );
                      }

                      const delay = template.dataValues?.sendingtrigger;
                      let delayMs = 0;

                      if (delay) {
                        const [value, unit] = delay?.split(' ');
                        delayMs = value * (unit.startsWith('hour') ? 3600000 : 0);
                      } else {
                        console.log("Sending immediately.");
                      }

                      msgData.message = msgData?.message
                        ?.replace(/{{buyerName}}/g, item.buyer.username)
                        .replace(/{{itemName}}/g, line.title)
                        .replace(/{{orderId}}/g, item.orderId)
                        .replace(/{{sellerId}}/g, item.sellerId)
                        .replace(/{{trackingNumber}}/g, tracking_number)
                        .replace(/{{carrierCode}}/, carrierName)
                        .replace(/{{shippedDate}}/g, moment(shippedDate).format("DD/MM/YYYY"))
                        .replace(/{{estDeliveryDays}}/g, estDeliveryDays);

                      let maxEstimatedDeliveryDate = moment(item.fulfillmentStartInstructions[0].maxEstimatedDeliveryDate).format("YYYY-MM-DD");

                      if (!isPreviousDate(maxEstimatedDeliveryDate)) {
                        if (delayMs > 0) {
                          console.log("Sending message with delay...");
                          setTimeout(() => {
                            SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                          }, delayMs);
                        } else {
                          console.log("Sending message immediately...");
                          SendMessage(msgData, eBay, item.orderId, status, item.sellerId);
                        }
                      }

                    }
                  }
                })
              );
              orderExist.shippedDate = shippingDate != "" ? shippingDate : null;
            }
          }
          if (orderExist.status != status && orderExist.status != 'delivered') {
            orderExist.status = status;
          }
          // await Promise.all(
          //   item.lineItems?.map(async (line) => {
          //     const cskuExist = await csku.findOne({ where: { channelId: line?.legacyItemId.toString() } });
          //     if (cskuExist) {
          //       cskuExist.dataValues.quantity = cskuExist.dataValues.quantity - 1;

          //       await cskuExist.save();

          //       const iskuExist = await isku.findOne({ where: { isku: cskuExist.dataValues.isku } });
          //       if (iskuExist) {
          //         iskuExist.dataValues.quantity = iskuExist.dataValues.quantity - 1;
          //       }
          //     }

          //   })
          // )
          console.log("orderExist", shippingDate);
          await orderExist.save();

          return null;
        }
      })
    );

    response = response.filter((item) => item != null);
    response = response.filter((item) => {
      console.log(item.shippedDate)
      if (item.shippedDate == "") {
        console.log("Here")
        item.shippedDate = null;
      }
      return item;
    });
    await order.bulkCreate(response).then(async (res) => {
      // quantityUpdate(iskusToBeUpdated);
      if (updateMarketplaceArray.length > 0) {
        updateMarketplaceData(updateMarketplaceArray);
      }
    });
    await isku.bulkCreate(iskuData);
    await csku.bulkCreate(cskuData);
  } catch (error) {
    console.log("Error in pushData", error);
    apiCallLog("pushData", "/order/get-order-cron", functionName,
      {
        accountName: accountName,
        data: data,
        type: type
      }
      , {}, error, 'error');
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: "akhlaq@mergekart.com",
      subject: "push data failed",
      text: `Error in pushing data ${JSON.stringify(data || {})} and because of ${error.message}`
    };

    // Create a transporter
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname, // Replace with your SMTP host
      port: process.env.SMTP_Port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_Username, // Replace with your SMTP username
        pass: process.env.SMTP_Password, // Replace with your SMTP password
      },
    });

    await transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });
    console.log(error);
  }
}

async function quantityUpdate(iskus) {
  try {

    for (var i = 0; i < iskus.length; i++) {

      const { isku, quantity, lineQuantity, accountName, userId, ignoreChannelId } = iskus[i];

      try {
        await syncMarketplaceQuantities(
          isku,
          quantity,
          userId,
          'eBay',
          lineQuantity,
          accountName,
          ignoreChannelId
        ).then(async (res) => {
          console.log(res);
          const mailOptions = {
            from: process.env.FROM_EMAIL,
            to: "akhlaq@mergekart.com",
            subject: "updated quantity",
            text: `updated quantity for isku ${isku} and quantity ${quantity} because of ${JSON.stringify(res)}`
          };

          // Create a transporter
          let transporter = nodemailer.createTransport({
            host: process.env.SMTP_Hostname, // Replace with your SMTP host
            port: process.env.SMTP_Port,
            secure: false, // true for 465, false for other ports
            auth: {
              user: process.env.SMTP_Username, // Replace with your SMTP username
              pass: process.env.SMTP_Password, // Replace with your SMTP password
            },
          });

          await transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
              console.log(error);
            } else {
              console.log('Email sent: ' + info.response);
            }
          });
        });
      } catch (err) {

        await apiCallLog("updateQuantity", "/order/get-order-cron", "updateQuantity", { isku, quantity, lineQuantity, accountName }, {}, err, 'error');

        const mailOptions = {
          from: process.env.FROM_EMAIL,
          to: "akhlaq@mergekart.com",
          subject: "Error in updating quantity",
          text: `Error in updating quantity for isku ${isku} and quantity ${quantity} because of ${JSON.stringify(err)}`
        };

        // Create a transporter
        let transporter = nodemailer.createTransport({
          host: process.env.SMTP_Hostname, // Replace with your SMTP host
          port: process.env.SMTP_Port,
          secure: false, // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_Username, // Replace with your SMTP username
            pass: process.env.SMTP_Password, // Replace with your SMTP password
          },
        });

        await transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          } else {
            console.log('Email sent: ' + info.response);
          }
        });

      }

    }

  } catch (err) {
    console.log(err)
  }
}

// async function pushDataShopify(
//   orders,
//   marketplaceId,
//   accountName,
//   userId,
//   addQuantity
// ) {
//   try {
//     const iskuData = [];
//     const cskuData = [];

//     let response = await Promise.all(
//       orders.map(async (item) => {
//         let status = "unpaid";
//         if (item.financial_status == "paid") {
//           if (item.fulfillment_status == null) {
//             status = "paid";
//           } else if (item.fulfillment_status == "pending") {
//             status = "pending";
//           } else if (item.fulfillment_status == "fulfilled") {
//             status = "shipped";
//           } else if (item.fulfillment_status == "partial") {
//             status = "in_progress";
//           }
//         }

//         const orderExist = await order.findOne({
//           where: {
//             orderId: item.id.toString(),
//             userId: userId,
//             accountName: accountName,
//           },
//         });

//         if (!orderExist) {
//           await Promise.all(
//             item.line_items.map(async (line) => {
//               const cskuExist = await csku.findOne({
//                 where: { channelId: line.product_id.toString() },
//               });
//               if (!cskuExist) {
//                 const newItem = {
//                   id: line.product_id,
//                   title: line.title,
//                   sku: line.sku,
//                   price: line.price,
//                   quantity: line.quantity,
//                   fulfillment_status: line.fulfillment_status,
//                   fulfillment_service: line.fulfillment_service,
//                   variant_id: line.variant_id,
//                   vendor: item.vendor,
//                   images: item.image ? [item.image.src] : [],
//                   description: item.note,
//                   categoryId: null,
//                   categoryName: null,
//                   currency: item.currency,
//                   marketplaceId: marketplaceId,
//                   accountName: accountName,
//                   userId: userId,
//                 };

//                 await Tokens.update(
//                   {
//                     itemsFetched: sequelize.literal(
//                       `CAST("itemsFetched" AS INTEGER) + ${1}`
//                     ),
//                   },
//                   { where: { userId: userId, accountName: accountName } }
//                 );

//                 cskuData.push({
//                   channelId: newItem.id,
//                   variantId: newItem.variant_id,
//                   isku: newItem.sku,
//                   price: newItem.price,
//                   mrp: newItem.price,
//                   images: newItem.images,
//                   description: newItem.description,
//                   categoryId: newItem.categoryId,
//                   categoryName: newItem.categoryName,
//                   quantity: newItem.quantity,
//                   currency: newItem.currency,
//                   marketplaceId: marketplaceId,
//                   accountName: accountName,
//                   userId: userId,
//                   title: newItem.title,
//                 });

//                 if (!newItem.sku) {
//                   iskuData.push({
//                     isku: newItem.id,
//                     costPrice: newItem.price,
//                     title: newItem.title,
//                     images: newItem.images,
//                     quantity: newItem.quantity,
//                     currency: newItem.currency,
//                     accountName: accountName,
//                     marketplaceId: marketplaceId,
//                     userId: userId,
//                   });
//                 } else {
//                   const iskuExist = await isku.findOne({
//                     where: { isku: newItem.sku.toString() },
//                   });
//                   if (iskuExist && addQuantity) {
//                     iskuExist.quantity += newItem.quantity;
//                     await iskuExist.save();
//                   } else if (!iskuExist) {
//                     iskuData.push({
//                       isku: newItem.id,
//                       costPrice: newItem.price,
//                       title: newItem.title,
//                       images: newItem.images,
//                       quantity: newItem.quantity,
//                       currency: newItem.currency,
//                       accountName: accountName,
//                       marketplaceId: marketplaceId,
//                       userId: userId,
//                     });
//                   }
//                 }
//               } else {
//                 try {
//                   const allCskus = await csku.findAll({
//                     where: {
//                       channelId: cskuExist.dataValues.channelId,
//                       id: {
//                         [Op.ne]: cskuExist.dataValues.id,
//                       },
//                     },
//                   });

//                   if (allCskus.length > 0) {
//                     updateMarketplaceData(allCskus);
//                   }
//                 } catch (err) {
//                   console.log(err);
//                 }
//               }


//               if (status == "paid") {
//                 const msgData = {
//                   receipientId: item.email,
//                   message: "",
//                   itemId: line.id,
//                   subject: "Order received",
//                 };
//                 const template = await emailTemplate.findOne({
//                   where: {
//                     accountName: accountName,
//                     userId: userId,
//                     order_status: "paid",
//                   },
//                 });
//                 if (template) {
//                   msgData.message = template.dataValues.email_template;
//                   msgData.message = msgData.message
//                     .replace(/{{buyerName}}/g, item.customer.id)
//                     .replace(/{{itemName}}/g, line.title)
//                     .replace(/{{orderId}}/g, item.id)
//                     .replace(/{{sellerId}}/g, accountName)
//                     .replace(/{{totalPrice}}/g, item.total_price);
//                   SendMessage(msgData);
//                 }
//               } else if (status == "shipped") {
//                 const msgData = {
//                   receipientId: item.email,
//                   message: "",
//                   itemId: line.id,
//                   subject: "Order shipped",
//                 };
//                 const template = await emailTemplate.findOne({
//                   where: {
//                     accountName: accountName,
//                     userId: userId,
//                     order_status: "shipped",
//                   },
//                 });
//                 if (template) {
//                   msgData.message = template.dataValues.email_template;
//                   msgData.message = msgData.message
//                     .replace(/{{buyerName}}/g, item.customer.id)
//                     .replace(/{{itemName}}/g, line.title)
//                     .replace(/{{orderId}}/g, item.id)
//                     .replace(/{{sellerId}}/g, accountName)
//                     .replace(/{{totalPrice}}/g, item.total_price);
//                   SendMessage(msgData);
//                 }
//               }
//             })
//           );

//           console.log("item.customer?.id", item);
//           return {
//             orderId: item?.id,
//             creationDate: item?.created_at,
//             lastModifiedDate: item?.updated_at,
//             orderFulfillmentStatus: item?.fulfillment_status,
//             orderPaymentStatus: item?.financial_status,
//             sellerId: accountName,
//             buyerUserName: item?.customer?.id || null,
//             buyerRegistrationAddress: {
//               // fullName:
//               //   item.customer.id + " " + item.customer.last_name,
//               addressLine1: item?.shipping_address?.address1 || null,
//               city: item?.shipping_address?.city || null,
//               stateOrProvince: item?.shipping_address?.province || null,
//               postalCode: item?.shipping_address?.zip || null,
//               countryCode: item?.shipping_address?.country || null,
//               primaryPhone: item?.shipping_address?.phone || null,
//               email: item?.email || null,
//             },
//             pricingSummary: {
//               total: item.total_price,
//               subtotal: item.subtotal_price,
//               total_tax: item.total_tax,
//               total_discounts: item.total_discounts,
//             },
//             payments: item.financial_status,
//             fulfillmentStartInstructions: [],
//             items: item.line_items.map((line) => {
//               return {
//                 lineItemId: line.id,
//                 itemId: line.product_id,
//                 sku: line.sku,
//                 itemCost: line.price,
//                 quantity: line.quantity,
//                 appliedPromotions: [],
//                 lineItemStatus: line.fulfillment_status,
//               };
//             }),
//             totalMarketplaceFee: 0, // Shopify doesn't provide this directly
//             marketplaceId: marketplaceId,
//             status: status,
//             accountName: accountName,
//             userId: userId,
//             shippedDate: status == "shipped" ? moment().toISOString() : null,
//           };
//         } else {
//           orderExist.dataValues.orderFulfillmentStatus =
//             item.fulfillment_status;
//           orderExist.dataValues.orderPaymentStatus = item.financial_status;

//           if (status != orderExist.dataValues.status) {
//             if (status == "paid") {
//               await Promise.all(
//                 item.line_items.map(async (line) => {
//                   const msgData = {
//                     receipientId: item.email,
//                     message: "",
//                     itemId: line.id,
//                     subject: "Order received",
//                   };
//                   const template = await emailTemplate.findOne({
//                     where: {
//                       accountName: accountName,
//                       userId: userId,
//                       order_status: "paid",
//                     },
//                   });
//                   if (template) {
//                     msgData.message = template.dataValues.email_template;
//                     msgData.message = msgData.message
//                       .replace(/{{buyerName}}/g, item.customer.id)
//                       .replace(/{{itemName}}/g, line.title)
//                       .replace(/{{orderId}}/g, item.id)
//                       .replace(/{{sellerId}}/g, accountName)
//                       .replace(/{{totalPrice}}/g, item.total_price);
//                     SendMessage(msgData);
//                   }
//                 })
//               );
//             } else if (status == "shipped") {
//               await Promise.all(
//                 item.line_items.map(async (line) => {
//                   const msgData = {
//                     receipientId: item.email,
//                     message: "",
//                     itemId: line.id,
//                     subject: "Order shipped",
//                   };
//                   const template = await emailTemplate.findOne({
//                     where: {
//                       accountName: accountName,
//                       userId: userId,
//                       order_status: "shipped",
//                     },
//                   });
//                   if (template) {
//                     msgData.message = template.dataValues.email_template;
//                     msgData.message = msgData.message
//                       .replace(/{{buyerName}}/g, item.customer.id)
//                       .replace(/{{itemName}}/g, line.title)
//                       .replace(/{{orderId}}/g, item.id)
//                       .replace(/{{sellerId}}/g, accountName)
//                       .replace(/{{totalPrice}}/g, item.total_price);
//                     SendMessage(msgData);
//                   }
//                 })
//               );

//               orderExist.shippedDate = moment().toISOString();
//             }
//           }

//           orderExist.dataValues.status = status;

//           await orderExist.save();

//           return null;
//         }
//       })
//     );

//     response = response.filter((item) => item != null);

//     await order.bulkCreate(response);
//     await isku.bulkCreate(iskuData);
//     await csku.bulkCreate(cskuData);
//   } catch (error) {
//     console.log(error);
//   }
// }

const handleEbayOrders = async (
  token,
  marketPlace,
  startDate,
  orders,
  marketplaceId,
  accountName,
  userId,
  addQuantity,
  type
) => {
  const functionName = "handleEbayOrders";
  const eBay = new ebay({
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID,
  });
  eBay.OAuth2.setCredentials(token.dataValues.token);
  apiCallLog("handleEbayOrders", "/order/get-order-cron", functionName,
    {
      ebay: eBay,
      accountName: accountName
    }
    , {}, {}, 'success');
  let startdate = moment().add(5, 'hours').add(30, 'minutes');
  let tokenExpiresDate = moment(token.lastTokenRefreshDate);
  let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

  if (hoursDifference >= 2) {
    await refreshToken(eBay, token)
  }
  // try {
  //   await eBay.trading.GetTokenStatus({
  //     RequesterCredentials: {
  //       eBayAuthToken: token.dataValues.token,
  //     },
  //   });
  //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
  // } catch (err) {
  //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
  //   await refreshToken(eBay, token);
  // }

  const data = await fetchEbayOrders(eBay, 0, startDate, type);
  // console.log(data);

  orders.push(...data?.orders);
  apiCallLog("handleEbayOrders (pushData)", "/order/get-order-cron", functionName,
    {
      type: type,
      data: data,
      accountName: accountName
    }
    , {}, {}, 'success');
  await pushData(eBay, data, marketplaceId, accountName, userId);
  token.ordersFetched = orders.length;
  await token.save();

  while (orders.length < data.total) {
    let startdate = moment().add(5, 'hours').add(30, 'minutes');
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

    if (hoursDifference >= 2) {
      await refreshToken(eBay, token)
    }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
    // } catch (err) {    
    //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
    //   await refreshToken(eBay, token);
    // }
    let offset = 100;
    const data = await fetchEbayOrders(eBay, offset, startDate, type);

    orders.push(...data.orders);
    offset += 100;
    await pushData(eBay, data, marketplaceId, accountName, userId);
    token.ordersFetched = orders.length;
    await token.save();
  }
};

async function refreshToken(eBay, token) {
  try {
    const newToken = await ebayAuthToken.getAccessToken(
      "PRODUCTION",
      token.dataValues.refreshToken,
      scopes
    );
    if (JSON.parse(newToken).error) {
      token.status = "inactive";
      await token.save();

      const nodemailer = require("nodemailer");

      // Create a transporter
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_Hostname, // Replace with your SMTP host
        port: process.env.SMTP_Port,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_Username, // Replace with your SMTP username
          pass: process.env.SMTP_Password, // Replace with your SMTP password
        },
      });

      const userData = await User.findOne({
        where: { id: token.dataValues.userId },
      });

      if (userData) {
        // Set up email data
        let mailOptions = {
          from: process.env.FROM_EMAIL, // Replace with your email
          to: "aditya@mergekart.com", // Replace with the receiver's email
          cc: userData.dataValues.email,
          subject: "Token Expired!",
          text: `Token for account name ${token.dataValues.accountName} associated with user ${userData.dataValues.email} has expired. Please login to your account and reauthorize the token.`,
        };

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            newRelic.recordCustomEvent(`Error while email sending:`, error);
            console.log(error);
          }
          console.log("Message sent: %s", info.messageId);
        });
      }

      newRelic.recordCustomEvent(`Error while token refresh: ${newToken}`);
      console.log(newToken.error);
      throw newToken.error;
    }

    const accessToken = JSON.parse(newToken);
    eBay.OAuth2.setCredentials(accessToken.access_token);
    token.token = accessToken.access_token;
    token.lastTokenRefreshDate = moment().add(5, 'hours').add(30, 'minutes').toISOString();
    await token.save();
  } catch (error) {
    console.log(error);
  }
}

exports.FetchOrdersCron = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName, startDate, addQuantity, type } =
      req.body;
    let functionName = 'FetchOrdersCron'
    apiCallLog("FetchOrdersCron", "/order/get-order-cron", functionName,
      {
        req: req.body,
      }
      , {}, {}, 'success');
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    apiCallLog("marketplace taking", "/order/get-order-cron", functionName,
      {
        marketplaceId: marketplaceId,
      }
      , marketPlace, {}, 'success');
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });
    functionName = "TokenTaking"
    apiCallLog("Token Taking", "/order/get-order-cron", functionName,
      {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName
      }
      , token, {}, 'success');
    if (!token) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Token for this user not found.",
      });
    }

    let orders = [];
    if (marketPlace.url?.includes("ebay") && token) {
      functionName = "eBay Order Fetching"
      apiCallLog("handleEbayOrders", "/order/get-order-cron", functionName,
        {
          token: token
        }
        , token, {}, 'success');
      await handleEbayOrders(
        token,
        marketPlace,
        startDate,
        orders,
        marketplaceId,
        accountName,
        userId,
        addQuantity,
        type
      );
    } else if (marketPlace.url?.includes("shopify") && token) {
      functionName = "Shopify Order Fetching"
      apiCallLog("fetchAndPushOrders", "/order/get-order-cron", functionName,
        {
          token: token
        }
        , token, {}, 'success');
      await fetchAndPushOrders(
        marketplaceId,
        accountName,
        userId,
        token.dataValues.token,
        "",
        startDate
      );
    } else if (marketPlace.url?.includes("woocommerce") && token) {
      functionName = "Woocommerce Order Fetching"
      apiCallLog("handleWooCommerceOrder", "/order/get-order-cron", functionName,
        {
          token: token
        }
        , token, {}, 'success');
      await handleWooCommerceOrder(
        token,
        marketPlace,
        startDate,
        orders,
        marketplaceId,
        accountName,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("walmart") && token) {
      functionName = "Walmart Order Fetching"
      apiCallLog("handleWalmartOrders", "/order/get-order-cron", functionName,
        {
          token: token
        }
        , token, {}, 'success');
      await handleWalmartOrder(
        token,
        marketPlace,
        startDate,
        orders,
        marketplaceId,
        accountName,
        userId,
        addQuantity
      );
    } else if (marketPlace.url?.includes("sellerflex")) {
      functionName = "Sellerflex Order Fetching"
      apiCallLog("handleSellerflexOrders", "/order/get-order-cron", functionName,
        {
          Sellerflex: "sellerflex"
        }
        , token, {}, 'success');
      const status = ["ACCEPTED", "DELIVERED", "CANCELLED", "UNFULFILLABLE", "CONFIRMED", "PACKAGE_CREATED", "PICKUP_SLOT_RETRIEVED", "INVOICE_GENERATED", "SHIPLABEL_GENERATED", "SHIPPED"];

      for (let i = 0; i < status.length; i++) {
        const data = {
          status: status[i],
          startDate: startDate,
          endDate: moment().toISOString(),
          clientId: token.dataValues.client_id,
          clientSecret: token.dataValues.client_secret,
          refreshToken: token.dataValues.refreshToken,
          locationId: token.dataValues.location_id,
          lastUpdatedAfter: startDate,
          lastUpdatedBefore: moment().toISOString(),
          maxResults: 50,
          marketplaceId: marketplaceId,
          accountName: accountName,
          userId: userId,
          type: "cron"
        }

        let config = {
          method: 'post',
          url: 'http://localhost:5001/sellerFlex/get-shipments',
          headers: {
            'Content-Type': 'application/json'
          },
          data: JSON.stringify(data)
        }

        await axios.request(config);
      }
    }
    else {
      functionName = "Unsupported Marketplace"
      apiCallLog("unsupportedMarketplace", "/order/get-order-cron", functionName,
        {
          message: "Unsupported marketplace"
        }
        , {}, {}, 'error');
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Unsupported marketplace",
      });
    }
    apiCallLog("FetchOrderCron", "/order/get-order-cron", "FetchOrderCron",
      {
        len: orders.length
      }
      , orders.length, {}, 'success');
    return res.status(200).json({
      success: true,
      status: 200,
      len: orders.length,
      orders: orders,
    });
  } catch (err) {
    newRelic.recordCustomEvent(`Error in order cron. Error: ${err.message}`);
    apiCallLog("FetchOrderCron", "/order/get-order-cron", "FetchOrderCron",
      {
        data: req.data || {}
      }
      , {}, { error: err.message }, 'error');
    console.log(err);
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: "akhlaq@mergekart.com",
      subject: "Order Cron Failed!!!!",
      text: `Error in updating quantity for isku ${JSON.stringify(req.data || {})} and because of ${err.message}`
    };

    // Create a transporter
    let transporter = nodemailer.createTransport({
      host: process.env.SMTP_Hostname, // Replace with your SMTP host
      port: process.env.SMTP_Port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_Username, // Replace with your SMTP username
        pass: process.env.SMTP_Password, // Replace with your SMTP password
      },
    });

    await transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};


exports.FetchOrdersCrons = async (req, res) => {
  const functionName = "FetchOrdersCrons";
  try {
    const { userId, marketplaceId, accountName, startDate, addQuantity, type } = req.body;
    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
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
    let orders = [];
    if (marketPlace.url?.includes("ebay") && token) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
      });
      eBay.OAuth2.setCredentials(token.dataValues.token);
      let startdate = moment().add(5, 'hours').add(30, 'minutes');
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token)
      }
      // try {
      //   await eBay.trading.GetTokenStatus({
      //     RequesterCredentials: {
      //       eBayAuthToken: token.dataValues.token,
      //     },
      //   });
      //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
      // } catch (err) {       
      //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      //   await refreshToken(eBay, token);
      // }
      const data = await fetchEbayOrders(eBay, 0, startDate, type);
      orders.push(...data.orders);
      await pushData(eBay, data, marketplaceId, accountName, userId);
      token.ordersFetched = orders.length;
      await token.save();
      while (orders.length < data.total) {
        let startdate = moment().add(5, 'hours').add(30, 'minutes');
        let tokenExpiresDate = moment(token.lastTokenRefreshDate);
        let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

        if (hoursDifference >= 2) {
          await refreshToken(eBay, token)
        }
        // try {
        //   await eBay.trading.GetTokenStatus({
        //     RequesterCredentials: {
        //       eBayAuthToken: token.dataValues.token,
        //     },
        //   });
        //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
        // } catch (err) {
        //   await apiCallLog("GetTokenStatus","/order/get-orders-cron",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
        //   await refreshToken(eBay, token);
        // }
        let offset = 100;
        const data = await fetchEbayOrders(eBay, offset, startDate, type);
        orders.push(...data.orders);
        offset += 100;
        await pushData(eBay, data, marketplaceId, accountName, userId);
        token.ordersFetched = orders.length;
        await token.save();
      }
    }
    return res.status(200).json({
      success: true,
      status: 200,
      len: orders.length,
      order: orders,
    });
  } catch (err) {
    newRelic.recordCustomEvent(`Error in order cron. Error: ${err.message}`);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

//SECTION - Update Ebay Status 
const UpdateEbayStatus = async (
  id,
  userId,
  marketplaceId,
  accountName,
  status,
  res
) => {
  const functionName = "UpdateEbayStatus";
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

    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
    });
    const access_token = token.dataValues.token;
    eBay.OAuth2.setCredentials(access_token);
    let startdate = moment().add(5, 'hours').add(30, 'minutes');
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

    if (hoursDifference >= 2) {
      await refreshToken(eBay, token)
    }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/order/update/status",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');

    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/order/update/status",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
    //   await refreshToken(eBay, token);
    // }

    const orderExist = await order.findOne({
      where: { id: id, userId: userId, accountName: accountName },
    });

    if (!orderExist)
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Invalid Order ID",
      });

    if (orderExist?.dataValues?.status === status) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "Cannot update order to same status.",
      });
    }

    if (
      status === "in_progress" ||
      status === "packed" ||
      status === "delivered" ||
      status === "paid" ||
      status === "unpaid"
    ) {
      await order.update({ status: status }, { where: { id: id } });

      const data = await emailTemplate.findOne({
        where: {
          accountName: accountName,
          userId: userId,
          status: status,
        }
      });

      if (data) {
        const jsonData = {
          from_email: data?.dataValues?.sender_email,
          template_name: data?.dataValues?.template_name,
          to_email: orderExist?.dataValues?.buyerRegistrationAddress?.email,
        };
        await SendEmail(jsonData);
      }
    } else if (status === "partially_shipped") {
      const { lineItems, shippedDate, shippingCarrierCode, trackingNumber } =
        req.body;

      const orderData = await order.findOne({
        where: { id: id, },
      });

      if (!orderData) {
        return res.status(500).json({
          success: false,
          status: 500,
          message: "Invalid Order ID",
        });
      }

      const data = await eBay.sell.fulfillment.createShippingFulfillment(
        orderData.dataValues.orderId,
        {
          lineItems: lineItems,
          shippedDate: shippedDate,
          shippingCarrierCode: shippingCarrierCode, // non mandatory
          trackingNumber: trackingNumber, // non mandatory
        }
      );

      // const fulfillmentId = data.headers.Location;

      const orderDetail = await eBay.sell.fulfillment.getOrder(
        orderData.orderId
      );

      await order.update(
        {
          orderFulfillmentStatus: orderDetail.orderFulfillmentStatus,
          status:
            orderDetail.orderFulfillmentStatus.toLowerCase() == "in_progress"
              ? "partially_shipped"
              : "shipped",
        },
        { where: { id: id } }
      );

      const template = await emailTemplate.findOne({
        where: {
          accountName: accountName,
          userId: userId,
          status: status,
        }
      });

      if (template) {
        const jsonData = {
          from_email: template?.dataValues?.sender_email,
          template_name: template?.dataValues?.template_name,
          to_email: orderExist?.dataValues?.buyerRegistrationAddress?.email,
        };
        await SendEmail(jsonData);
      }
    } else if (status === "canceled") {
      const { cancelId } = req.body;

      await eBay.postOrder.cancellation.approveCancellationRequest(cancelId);

      await order.update({ status: status }, { where: { id: id } });

      const template = await emailTemplate.findOne({
        where: {
          accountName: accountName,
          userId: userId,
          status: status,
        }
      });

      if (template) {
        const jsonData = {
          from_email: template?.dataValues?.sender_email,
          template_name: template?.dataValues?.template_name,
          to_email: orderExist?.dataValues?.buyerRegistrationAddress?.email,
        };
        await SendEmail(jsonData);
      }
    } else if (status === "return_accepted") {
      const { returnId, keepOriginalItem } = req.body;

      await eBay.postOrder.return.processReturnRequest(returnId, {
        decision: "APPROVE",
        keepOriginalItem: keepOriginalItem,
      });

      await order.update({ status: status }, { where: { id: id } });

      const template = await emailTemplate.findOne({
        where: {
          accountName: accountName,
          userId: userId,
          status: status,
        }
      });

      if (template) {
        const jsonData = {
          from_email: template?.dataValues?.sender_email,
          template_name: template?.dataValues?.template_name,
          to_email: orderExist?.dataValues?.buyerRegistrationAddress?.email,
        };
        await SendEmail(jsonData);
      }
    } else if (status === "return_in_progress") {
      const {
        returnId,
        carrierEnum,
        carrierName,
        carrierUsed,
        shippedDate,
        trackingNumber,
      } = req.body;

      await eBay.postOrder.return.markReturnShipped(returnId, {
        /* MarkAsShippedRequest */ carrierEnum: carrierEnum,
        carrierName: carrierName,
        carrierUsed: carrierUsed,
        shippedDate: {
          /* DateTime */ value: shippedDate,
        },
        trackingNumber: trackingNumber,
      });

      await order.update({ status: status }, { where: { id: id } });

      const template = await emailTemplate.findOne({
        where: {
          accountName: accountName,
          userId: userId,
          status: status,
        }
      });

      if (template) {
        const jsonData = {
          from_email: template?.dataValues?.sender_email,
          template_name: template?.dataValues?.template_name,
          to_email: orderExist?.dataValues?.buyerRegistrationAddress?.email,
        };
        await SendEmail(jsonData);
      }
    } else if (status === "return_complete") {
      const { returnId, addBack } = req.body;

      await eBay.postOrder.return.markReturnReceived(returnId);

      await order.update({ status: status }, { where: { id: id } });

      if (addBack == true) {
        const returnData = await eBay.postOrder.return.getReturn(returnId);

        await csku.update(
          {
            quantity: sequelize.literal(
              `CAST("quantity" AS INTEGER) + ${returnData.detail.itemDetail.returnQuantity}`
            ),
          },
          { where: { csku: returnData.detail.itemDetail.itemId } }
        );

        const data = await csku.findOne({
          where: { csku: returnData.detail.itemDetail.itemId },
        });
        await isku.update(
          {
            quantity: sequelize.literal(
              `CAST("quantity" AS INTEGER) + ${returnData.detail.itemDetail.returnQuantity}`
            ),
          },
          { where: { isku: data.isku } }
        );
      }

      const template = await emailTemplate.findOne({
        where: {
          accountName: accountName,
          userId: userId,
          status: status,
        }
      });

      if (template) {
        const jsonData = {
          from_email: template?.dataValues?.sender_email,
          template_name: template?.dataValues?.template_name,
          to_email: orderExist?.dataValues?.buyerRegistrationAddress?.email,
        };
        await SendEmail(jsonData);
      }
    } else if (status === "refunded") {
      const { returnId, refundCurrency, refundAmount, refundType, relist } =
        req.body;

      await eBay.postOrder.return.issueReturnRefund(returnId, {
        refundDetail: {
          itemizedRefundDetail: [
            {
              refundAmount: {
                currency: refundCurrency,
                value: refundAmount,
              },
              refundFeeType: refundType,
            },
          ],
          totalAmount: {
            currency: refundCurrency,
            value: refundAmount,
          },
        },
        relistItem: relist,
      });

      const template = await emailTemplate.findOne({
        where: {
          accountName: accountName,
          userId: userId,
          status: status,
        }
      });

      if (template) {
        const jsonData = {
          from_email: template?.dataValues?.sender_email,
          template_name: template?.dataValues?.template_name,
          to_email: orderExist?.dataValues?.buyerRegistrationAddress?.email,
        };
        await SendEmail(jsonData);
      }
    }

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Status update successfully",
    });
  } catch (err) {
    newRelic.recordCustomEvent(
      `Error in order status update. Error: ${err.message}`
    );
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.GetAllOrders = async (req, res) => {
  try {
    const {
      page,
      limit,
      marketplaceId,
      accountName,
      userId,
      status,
      search,
      orderBy,
      type,
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = marketplaceId
      ? {
        where: { marketplaceId: marketplaceId },
      }
      : { where: {} };

    if (search) {
      query.where[Op.or] = [
        { orderId: search },
        {
          buyerUserName: {
            [Op.iLike]: `%${search}%`,
          },
        },
      ];
    }

    if (userId) {
      const tokens = await Tokens.findAll({
        where: {
          userId: userId,
        },
      });

      const accountNames = tokens?.map(
        (token) => token?.dataValues?.accountName
      );

      if (accountNames.length > 0) {
        query.where[Op.and] = {
          accountName: {
            [Op.in]: accountNames,
          },
          userId: userId,
        };
      } else {
        query.where = { userId: userId };
      }
    }

    if (status != "all") {
      query.where.status = status;
    }

    if (accountName) {
      query.where.accountName = accountName;
    }

    const orderArg = orderBy ? { order: [[orderBy, type.toUpperCase()]] } : { order: [["createdAt", "DESC"]] };

    const data = await order.findAll({
      ...query,
      ...orderArg,
      limit: parseInt(limit),
      offset: skip,
    });

    const count = await order.count(query);

    return res.status(200).json({
      success: false,
      status: 200,
      count,
      data,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      status: 500,
      message: err.message,
    });
  }
};

exports.GetLineItem = async (req, res) => {
  try {
    const id = req.params.id;

    const orderData = await order.findByPk(id);

    if (!orderData) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid Order ID",
      });
    }

    const response = [];
    await Promise.all(
      orderData?.dataValues?.items?.map(async (item) => {
        const itemData = await csku.findOne({
          where: { channelId: item.itemId.toString() },
        });

        response.push({
          itemTitle: itemData?.title,
          itemImage: itemData?.images[0],
          lineItemId: item?.lineItemId,
          quantity: item?.quantity,
        });
      })
    );

    return res.status(200).json({
      success: true,
      status: 200,
      data: response,
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

// exports.FetchOrderReturn = async (req, res) => {
//   try {
//     const { userId, marketplaceId, accountName, startDate } = req.body;

//     const marketPlace = await Marketplace.findOne({
//       where: {
//         id: marketplaceId,
//       },
//     });
//     const token = await Tokens.findOne({
//       where: {
//         userId: userId,
//         marketPlaceId: marketplaceId,
//         accountName: accountName,
//       },
//     });

//     const returnDate = startDate;

//     let returns = [];
//     if (marketPlace.url?.includes("ebay") && token) {
//       const eBay = new ebay({
//         appId: process.env.APP_ID,
//         certId: process.env.CERT_ID,
//         sandbox: false,
//         devId: process.env.DEV_ID,
//       });
//       eBay.OAuth2.setCredentials(token.dataValues.token);

//       try {
//         await eBay.trading.GetTokenStatus({
//           RequesterCredentials: {
//             eBayAuthToken: token.dataValues.token,
//           },
//         });
//       } catch (err) {
//         await refreshToken(eBay, token);
//       }

//       const data = await eBay.postOrder.return.search({
//         creation_date_range_from: returnDate,
//         limit: 100,
//         offset: 0,
//       });

//       if (data.members && data.members.length > 0) {
//         returns.push(...data?.members);
//       }

//       while (returns.length < data.total) {
//         let offset = 100;
//         const data = await eBay.postOrder.return.search({
//           creation_date_range_from: returnDate,
//           limit: 100,
//           offset: offset,
//         });

//         returns.push(...data?.members);
//         offset += 100;
//       }
//     }else if(marketPlace.url?.includes("shopify") && token){

//     }

//     await Promise.all(
//       returns?.map(async (item) => {
//         const orderData = await order.findOne({
//           where: {
//             orderId: item.orderId.toString(),
//           },
//         });

//         if (orderData) {
//           switch (item.status) {
//             case "RETURN_REQUESTED":
//               orderData.status = "RETURN_REQUESTED".toLowerCase();
//               orderData.returnId = item.returnId;
//               break;
//             case "ESCALATED":
//               orderData.status = "return_accepted";
//               break;
//             case "ITEM_SHIPPED":
//               orderData.status = "return_in_progress";
//               break;
//             case "ITEM_DELIVERED":
//               orderData.status = "return_complete";
//               break;
//             default:
//               await orderData.save();
//           }

//           await orderData.save();
//         }
//       })
//     );

//     return res.status(200).json({
//       success: false,
//       status: 200,
//       data: returns,
//     });
//   } catch (err) {
//     newRelic.recordCustomEvent(`Error in fetch returns. Error ${err.message}`);
//     console.log(err);
//     return res.status(400).json({
//       success: false,
//       status: 400,
//       message: err.message,
//     });
//   }
// };

exports.FetchOrderReturn = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName, startDate } = req.body;

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });
    const tokenVal = token.token;

    const returnDate = startDate;

    let returns = [];
    if (marketPlace.url?.includes("ebay") && token) {
      returns = await fetchEbayReturns(token, returnDate);
    } else if (marketPlace.url?.includes("shopify") && token) {
      returns = await fetchShopifyReturns(token, returnDate, accountName);
    }
    else if (marketPlace.url?.includes("woocommerce")) {
      returns = await fetchWooCommerceReturn(tokenVal, returnDate, accountName)
    } else if (marketPlace.url?.includes("sellerFlex")) {
      returns = await fetchSellerFlexReturns(token, returnDate);
    }
    console.log(returns, "return")
    await processReturns(returns ?? [], marketplaceId, userId, accountName);

    return res.status(200).json({
      success: true,
      status: 200,
      data: returns,
    });
  } catch (err) {
    newRelic.recordCustomEvent(`Error in fetch returns. Error ${err.message}`);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

async function fetchSellerFlexReturns(token, returnDate) {

  const statuses = ["CREATED", "CARRIER_NOTIFIED_TO_PICK_UP_FROM_CUSTOMER", "CARRIER_OUT_FOR_PICK_UP_FROM_CUSTOMER", "CUSTOMER_CANCELLED_PICK_UP", "CUSTOMER_RESCHEDULED_PICK_UP", "PICKED_FROM_CUSTOMER", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

  for (var i = 0; i < statuses.length; i++) {
    let data = JSON.stringify({
      "clientId": token.clientId,
      "clientSecret": token.clientSecret,
      "refreshToken": token.refreshToken,
      "locationId": token.locationId,
      "status": statuses[i],
      "lastUpdatedAfter": returnDate
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'http://localhost:5001/sellerFlex/list-returns',
      headers: {
        'Content-Type': 'application/json'
      },
      data: data
    };

    const response = await axios.request(config);

  }



}

async function fetchEbayReturns(token, returnDate) {
  const functionName = "fetchEbayReturns"
  const eBay = new ebay({
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID,
  });
  eBay.OAuth2.setCredentials(token.dataValues.token);
  let startdate = moment().add(5, 'hours').add(30, 'minutes');
  let tokenExpiresDate = moment(token.lastTokenRefreshDate);
  let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');
  if (hoursDifference >= 2) {
    await refreshToken(eBay, token)
  }
  // try {
  //   await eBay.trading.GetTokenStatus({
  //     RequesterCredentials: {
  //       eBayAuthToken: token.dataValues.token,
  //     },
  //   });
  //   await apiCallLog("GetTokenStatus","/order/fetch-returns",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
  // } catch (err) {
  //   await apiCallLog("GetTokenStatus","/order/fetch-returns",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
  //   await refreshToken(eBay, token);
  // }

  const data = await eBay.postOrder.return.search({
    creation_date_range_from: returnDate,
    limit: 100,
    offset: 0,
  });

  let returns = data.members || [];

  while (returns.length < data.total) {
    let offset = 100;
    const moreData = await eBay.postOrder.return.search({
      creation_date_range_from: returnDate,
      limit: 100,
      offset: offset,
    });

    returns.push(...moreData?.members);
    offset += 100;
  }

  return returns;
}

async function processReturns(returns, marketplaceId, userId, accountName) {
  await Promise.all(
    returns?.map(async (item) => {
      const orderData = await order.findOne({
        where: {
          orderId: item.orderId?.toString(),
          userId: userId,
          accountName: accountName,
        },
      });

      if (orderData) {
        switch (item.status) {
          case "RETURN_REQUESTED":
            orderData.status = "return_requested";
            orderData.returnId = item.returnId;
            break;
          case "ESCALATED":
            orderData.status = "return_accepted";
            break;
          case "ITEM_SHIPPED":
            orderData.status = "return_in_progress";
            break;
          case "ITEM_DELIVERED":
          case "return_complete":
            orderData.status = "return_complete";
            break;
          case "refunded":
            orderData.status = "return_complete";
          default:
            await orderData.save();
        }

        await orderData.save();
      }
    })
  );
}

exports.GetShippingCarrierCode = async (req, res) => {
  const functionName = "GetShippingCarrierCode";
  try {
    const { userId, marketplaceId, accountName } = req.body;

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });

    if (marketPlace.url?.includes("ebay") && token) {
      const eBay = new ebay({
        appId: process.env.APP_ID,
        certId: process.env.CERT_ID,
        sandbox: false,
        devId: process.env.DEV_ID,
        authToken: token.dataValues.token,
      });
      let startdate = moment().add(5, 'hours').add(30, 'minutes');
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

      if (hoursDifference >= 2) {
        await refreshToken(eBay, token)
      }
      // try {
      //   await eBay.trading.GetTokenStatus({
      //     RequesterCredentials: {
      //       eBayAuthToken: token.dataValues.token,
      //     },
      //   });
      //   await apiCallLog("GetTokenStatus","/order/get-shipping-carrier-code",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
      // } catch (err) {
      //   await apiCallLog("GetTokenStatus","/order/get-shipping-carrier-code",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      //   await refreshToken(eBay, token);
      // }
      try {
        const data = await eBay.trading.GeteBayDetails({
          DetailName: "ShippingCarrierDetails",
        });
        await apiCallLog("GeteBayDetails", "/order/get-shipping-carrier-code", functionName, {
          DetailName: "ShippingCarrierDetails",
        }, data, {}, 'success');

        return res.status(200).json({
          success: true,
          status: 200,
          data: data,
        });
      } catch (err) {
        await apiCallLog("GeteBayDetails", "/order/get-shipping-carrier-code", functionName, {
          DetailName: "ShippingCarrierDetails"
        }, {}, err.meta, 'error');
      }
    }
  } catch (err) {
    newRelic(`Error in get shipping carrier code. Error ${err.message}`);
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

exports.FetchCancelRequests = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName, startDate } = req.body;

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });
    const token = await Tokens.findOne({
      where: {
        userId: userId,
        marketPlaceId: marketplaceId,
        accountName: accountName,
      },
    });
    const tokenVal = token.token;

    const returnDate = moment(startDate).subtract(18, "months").toISOString();

    let cancels = [];
    if (marketPlace.url?.includes("ebay") && token) {
      cancels = await fetchEbayCancelRequests(token, returnDate, startDate);
    } else if (marketPlace.url?.includes("shopify") && token) {
      cancels = await fetchShopifyCancelRequests(
        token,
        returnDate,
        startDate,
        accountName
      );
    } else if (marketPlace.url?.includes("woocommerce")) {
      cancels = await fetchWooCommerceCancelRequests(
        tokenVal,
        returnDate,
        startDate,
        accountName
      );
      console.log("cenchdjk", cancels);
    }

    await processCancelRequests(cancels ?? [], userId, accountName, marketplaceId);

    return res.status(200).json({
      success: true,
      status: 200,
      data: cancels,
    });
  } catch (err) {
    newRelic.recordCustomEvent(
      `Error in fetch cancel requests. Error: ${err.message}`
    );
    console.log(err);
    return res.status(400).json({
      success: false,
      status: 400,
      message: err.message,
    });
  }
};

async function fetchEbayCancelRequests(token, returnDate, startDate) {
  const functionName = "fetchEbayCancelRequests";
  const eBay = new ebay({
    appId: process.env.APP_ID,
    certId: process.env.CERT_ID,
    sandbox: false,
    devId: process.env.DEV_ID,
  });
  eBay.OAuth2.setCredentials(token.dataValues.token);
  let startdate = moment().add(5, 'hours').add(30, 'minutes');
  let tokenExpiresDate = moment(token.lastTokenRefreshDate);
  let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

  if (hoursDifference >= 2) {
    await refreshToken(eBay, token)
  }
  // try {
  //   await eBay.trading.GetTokenStatus({
  //     RequesterCredentials: {
  //       eBayAuthToken: token.dataValues.token,
  //     },
  //   });
  //   await apiCallLog("GetTokenStatus","/order/get-cancels",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
  // } catch (err) {
  //   await apiCallLog("GetTokenStatus","/order/get-cancels",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
  //   await refreshToken(eBay, token);
  // }

  const data = await eBay.postOrder.cancellation.search({
    creation_date_range_from: returnDate,
    creation_date_range_to: startDate,
    limit: 100,
    offset: 0,
  });

  let cancels = data.cancellations || [];

  while (cancels.length < data.total) {
    let offset = 100;
    const moreData = await eBay.postOrder.cancellation.search({
      creation_date_range_from: returnDate,
      creation_date_range_to: startDate,
      limit: 100,
      offset: offset,
    });

    cancels.push(...moreData?.cancellations);
    offset += 100;
  }

  return cancels;
}

async function processCancelRequests(
  cancels,
  userId,
  accountName,
  marketplaceId
) {
  await Promise.all(
    cancels?.map(async (item) => {
      const orderId = String(item?.legacyOrderId || item?.id);
      // console.log("rtyu", orderId);
      const orderData = await order.findOne({
        where: {
          orderId: { [Op.eq]: orderId },
          userId: userId,
          accountName: accountName,
          marketplaceId: marketplaceId,
        },
      });

      if (orderData) {
        if (item.cancelStatus === "CANCEL_REQUESTED") {
          orderData.status = "cancel_requested";
        } else if (item.cancelStatus === "CANCEL_PENDING") {
          orderData.status = "cancel_pending";
        } else if (item.cancelStatus === "CANCEL_REJECTED") {
          orderData.status = "cancel_rejected";
        } else if (item.cancelStatus.includes("CANCEL_CLOSED")) {
          orderData.status = "canceled";
        }

        await orderData.save();
      }
    })
  );
}

// exports.FetchCancelRequests = async (req, res) => {
//   try {
//     const { userId, marketplaceId, accountName, startDate } = req.body;

//     const marketPlace = await Marketplace.findOne({
//       where: {
//         id: marketplaceId,
//       },
//     });
//     const token = await Tokens.findOne({
//       where: {
//         userId: userId,
//         marketPlaceId: marketplaceId,
//         accountName: accountName,
//       },
//     });

//     const returnDate = moment(startDate).subtract(18, "months").toISOString();

//     let cancels = [];
//     if (marketPlace.url?.includes("ebay") && token) {
//       const eBay = new ebay({
//         appId: process.env.APP_ID,
//         certId: process.env.CERT_ID,
//         sandbox: false,
//         devId: process.env.DEV_ID,
//       });
//       eBay.OAuth2.setCredentials(token.dataValues.token);

//       try {
//         await eBay.trading.GetTokenStatus({
//           RequesterCredentials: {
//             eBayAuthToken: token.dataValues.token,
//           },
//         });
//       } catch (err) {
//         await refreshToken(eBay, token);
//       }

//       const data = await eBay.postOrder.cancellation.search({
//         creation_date_range_from: returnDate,
//         creation_date_range_to: startDate,
//         limit: 100,
//         offset: 0,
//       });

//       if (data.cancellations?.length > 0) {
//         await Promise.all(
//           data.cancellations?.map(async (cancel) => {
//             if (cancel.legacyOrderId) {
//               const orderData = await order.findOne({
//                 where: {
//                   orderId: cancel.legacyOrderId,
//                 },
//               });

//               if (orderData) {
//                 if (cancel.cancelStatus == "CANCEL_REQUESTED") {
//                   orderData.status = "CANCEL_REQUESTED".toLowerCase();
//                 }
//                 if (cancel.cancelStatus.includes("CANCEL_CLOSED")) {
//                   orderData.status = "canceled";
//                 }
//                 await orderData.save();
//               }
//             }
//           })
//         );
//       }

//       while (returns.length < data.total) {
//         let offset = 100;
//         const data = await eBay.postOrder.cancellation.search({
//           creation_date_range_from: returnDate,
//           creation_date_range_to: startDate,
//           limit: 100,
//           offset: offset,
//         });

//         if (data.cancellations?.length > 0) {
//           await Promise.all(
//             data.cancellations?.map(async (cancel) => {
//               if (cancel.legacyOrderId) {
//                 const orderData = await order.findOne({
//                   where: {
//                     orderId: cancel.legacyOrderId,
//                   },
//                 });

//                 if (orderData) {
//                   if (cancel.cancelStatus == "CANCEL_REQUESTED") {
//                     orderData.status = "CANCEL_REQUESTED".toLowerCase();
//                   }
//                   if (cancel.cancelStatus.includes("CANCEL_CLOSED")) {
//                     orderData.status = "canceled";
//                   }
//                   await orderData.save();
//                 }
//               }
//             })
//           );
//         }

//         cancels.push(...data?.cancellations);
//         offset += 100;
//       }

//       return res.status(200).json({
//         success: true,
//         status: 200,
//         data,
//       });
//     }
//   } catch (err) {
//     newRelic.recordCustomEvent(
//       `Error in fetch cancel requests. Error: ${err.message}`
//     );
//     console.log(err);
//     return res.status(400).json({
//       success: false,
//       status: 400,
//       message: err.message,
//     });
//   }
// };

exports.GetOrderStatusCount = async (req, res) => {
  try {
    const { userId, accountName } = req.query;

    const query = accountName ? { accountName: accountName } : {};

    const allCount = await order.count({ where: { userId: userId, ...query } });
    const unpaidCount = await order.count({
      where: { status: "unpaid", userId: userId, ...query },
    });
    const paidCount = await order.count({
      where: { status: "paid", userId: userId, ...query },
    });
    const packedCount = await order.count({
      where: { status: "packed", userId: userId, ...query },
    });
    const partiallyShippedCount = await order.count({
      where: { status: "partially_shipped", userId: userId, ...query },
    });
    const shippedCount = await order.count({
      where: { status: "shipped", userId: userId, ...query },
    });
    const deliveredCount = await order.count({
      where: { status: "delivered", userId: userId, ...query },
    });
    const canceledCount = await order.count({
      where: { status: "canceled", userId: userId, ...query },
    });

    return res.status(200).json({
      success: true,
      status: 200,
      data: {
        all: allCount,
        unpaid: unpaidCount,
        paid: paidCount,
        packed: packedCount,
        partiallyShipped: partiallyShippedCount,
        shipped: shippedCount,
        delivered: deliveredCount,
        canceled: canceledCount,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.GetDeliveredOrders = async (req, res) => {
  try {
    const { accountName, userId, marketplaceId } = req.body;

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        accountName: accountName,
        marketPlaceId: marketplaceId,
      },
    });
    if (!token) {
      return res.status(500).json({
        success: false,
        message: "Token not found for this account",
      });
    }

    const marketPlace = await Marketplace.findOne({
      where: { id: marketplaceId },
    });

    let deliveredOrders = [];

    if (marketPlace.url?.includes("ebay")) {
      deliveredOrders = await getEbayDeliveredOrders(
        token,
        accountName,
        userId
      );
    } else if (marketPlace.url?.includes("shopify")) {
      deliveredOrders = await getShopifyDeliveredOrders(
        token,
        accountName,
        userId
      );
    } else if (marketPlace.url?.includes("woocommerce")) {
      deliveredOrders = await getWoocommerceDeliveredOrders(
        token,
        accountName,
        userId
      );
    }

    return res.status(200).json({
      success: true,
      message: "Delivered data fetched",
      data: deliveredOrders,
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Delivered status api error`, error);
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

async function getEbayDeliveredOrders(token, accountName, userId) {
  const functionName = "getEbayDeliveredOrders"
  try {
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
    });
    eBay.OAuth2.setCredentials(token.dataValues.token);
    let startdate = moment().add(5, "hours").add(30, "minutes");
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

    if (hoursDifference >= 2) {
      await refreshToken(eBay, token)
    }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/order/get-delivered-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/order/get-delivered-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
    //   await refreshToken(eBay, token);
    // }

    const orderIds = [];
    let orderData;

    if (userId && accountName) {
      orderData = await order.findAll({
        where: {
          userId: userId,
          accountName: accountName,
          status: "shipped",
          shippedDate: { [Op.not]: null },
        },
      });
    }

    if (orderData?.length > 0) {
      await Promise.all(
        orderData?.map(async (orders) => {
          const existingOrder = await order.findAll({
            where: {
              orderId: orders.dataValues.orderId,
              status: "shipped",
            },
          });

          let messageStatus;
          if (orders.dataValues?.orderId) {
            messageStatus = await MessageLog.findOne({
              where: {
                order_number: orders.dataValues.orderId,
                status: "delivered"
              },
            })
          }
          if (existingOrder.length > 0 && messageStatus) {
            await order.update(
              { status: 'delivered' },
              {
                where: {
                  orderId: orders.dataValues.orderId,
                },
              }
            );
            console.log(`Order ${orders.dataValues.orderId} is already delivered. Skipping.`);
            return;
          }
          let startdate = moment().add(5, "hours").add(30, "minutes");
          let tokenExpiresDate = moment(token.lastTokenRefreshDate);
          let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

          if (hoursDifference >= 2) {
            await refreshToken(eBay, token)
          }
          // try {
          //   await eBay.trading.GetTokenStatus({
          //     RequesterCredentials: {
          //       eBayAuthToken: token.dataValues.token,
          //     },
          //   });
          //   await apiCallLog("GetTokenStatus","/order/get-delivered-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
          // } catch (err) {
          //   await apiCallLog("GetTokenStatus","/order/get-delivered-orders",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
          //   await refreshToken(eBay, token);
          // }

          const shippedDate = moment(orders.dataValues.shippedDate);
          const today = moment();
          if (today.diff(shippedDate, "days") >= 3) {
            orderIds.push(orders.dataValues.orderId);
          }
        })
      );

      if (orderIds.length > 0) {
        const orderStatusData = await eBay.trading.GetOrders({
          OrderIDArray: {
            OrderID: orderIds,
          },
          Pagination: {
            PageNumber: 1,
            EntriesPerPage: 100,
          },
        });
        await apiCallLog("GetOrders", "/order/get-delivered-orders", functionName, {
          OrderIDArray: {
            OrderID: orderIds,
          },
          Pagination: {
            PageNumber: 1,
            EntriesPerPage: 100,
          },
        }, orderStatusData, {}, 'success');
        const deliveredOrders = [];

        await Promise.all(
          orderStatusData?.OrderArray?.Order?.map(async (ord) => {
            if (
              ord?.ShippingServiceSelected?.ShippingPackageInfo
                ?.ActualDeliveryTime
            ) {
              const orderData = await order.update(
                {
                  status: "delivered",
                  deliveryDate:
                    ord?.ShippingServiceSelected?.ShippingPackageInfo
                      ?.ActualDeliveryTime,
                },
                {
                  where: {
                    orderId: ord?.OrderID,
                  },
                  returning: true,
                }
              );
              await Promise.all(
                orderData[1].map(async (orders) => {
                  await Promise.all(
                    orders.dataValues.items.map(async (item) => {
                      const cskuData = await csku.findOne({
                        where: {
                          channelId: item.itemId.toString(),
                          accountName: accountName,
                          userId: userId,
                        },
                        attributes: ["title"],
                      });

                      if (cskuData) {
                        const template = await emailTemplate.findOne({
                          where: {
                            accountName: accountName,
                            userId: userId,
                            order_status: "delivered",
                          },
                        });

                        const msgData = {
                          receipientId: orders.dataValues.buyerUserName,
                          message: "",
                          itemId: item.itemId.toString(),
                          subject: "Order delivered",
                        };

                        if (template) {
                          msgData.message = template.dataValues.email_template;
                          msgData.message = msgData?.message
                            ?.replace(/{{buyerName}}/g, orders.dataValues.buyerUserName)
                            .replace(/{{itemName}}/g, cskuData.dataValues.title)
                            .replace(/{{orderId}}/g, orders.dataValues.orderId)
                            .replace(/{{sellerId}}/g, orders.dataValues.sellerId)
                            .replace(
                              /{{delDate}}/g,
                              moment(
                                ord?.ShippingServiceSelected?.ShippingPackageInfo?.ActualDeliveryTime
                              ).format("DD/MM/YYYY")
                            );

                          const delay = template.dataValues?.sendingtrigger;
                          let delayMs = 0;

                          if (delay) {
                            const [value, unit] = delay?.split(' ');
                            delayMs = value * (unit.startsWith('hour') ? 3600000 : 0);
                            console.log(`Delay calculated: ${delayMs} ms`);
                          } else {
                            console.log("No delay specified. Sending immediately.");
                          }

                          if (delayMs > 0) {
                            console.log("Sending message with delay...");
                            setTimeout(() => {
                              SendMessage(
                                msgData,
                                eBay,
                                orders.dataValues.orderId,
                                "delivered",
                                accountName
                              );
                            }, delayMs);
                          } else {
                            console.log("Sending message immediately...");
                            SendMessage(
                              msgData,
                              eBay,
                              orders.dataValues.orderId,
                              "delivered",
                              accountName
                            );
                          }
                        }

                      }
                    })
                  );
                })
              );

              deliveredOrders.push(ord?.Order);
            }
          })
        );

        if (orderStatusData?.HasMoreItems) {
          for (
            var i = 2;
            i <= orderStatusData?.PaginationResult?.TotalNumberOfPages;
            i++
          ) {
            const moreOrderStatusData = await eBay.trading.GetOrders({
              OrderIDArray: orderIds,
              Pagination: {
                PageNumber: i,
                EntriesPerPage: 100,
              },
            });
            await apiCallLog("GetOrders", "/order/get-delivered-orders", functionName, {
              OrderIDArray: orderIds,
              Pagination: {
                PageNumber: i,
                EntriesPerPage: 100,
              },
            }, moreOrderStatusData, {}, 'success');
            await Promise.all(
              moreOrderStatusData?.OrderArray?.map(async (ord) => {
                if (
                  ord?.Order?.ShippingServiceOptions[0]?.ShippingPackageInfo[0]
                    ?.ActualDeliveryDate
                ) {
                  await order.update(
                    {
                      status: "delivered",
                      deliveryDate:
                        ord?.Order?.ShippingServiceOptions[0]
                          ?.ShippingPackageInfo[0]?.ActualDeliveryDate,
                    },
                    {
                      where: {
                        orderId: ord?.Order?.OrderID,
                      },
                    }
                  );
                  deliveredOrders.push(ord?.Order);
                }
              })
            );
          }
        }

        return deliveredOrders;
      }
    } else {
      return [];
    }
  } catch (err) {
    await apiCallLog("GetOrders", "/order/get-delivered-orders", functionName, {}, {}, err.meta, 'error');
    console.log(err);
    return [];
  }
}

// exports.GetDeliveredOrders = async (req, res) => {
//   try {
//     const { accountName, userId } = req.body;

//     const token = await Tokens.findOne({
//       where: { userId: userId, accountName: accountName },
//     });
//     if (!token) {
//       return res.status(500).json({
//         success: false,
//         message: "Token not found for this account",
//       });
//     }

//     const eBay = new ebay({
//       appId: process.env.APP_ID,
//       certId: process.env.CERT_ID,
//       sandbox: false,
//       devId: process.env.DEV_ID,
//     });
//     eBay.OAuth2.setCredentials(token.dataValues.token);

//     try {
//       await eBay.trading.GetTokenStatus({
//         RequesterCredentials: {
//           eBayAuthToken: token.dataValues.token,
//         },
//       });
//     } catch (err) {
//       await refreshToken(eBay, token);
//     }

//     const orderIds = [];

//     const orderData = await order.findAll({
//       where: {
//         userId: userId,
//         accountName: accountName,
//         status: "shipped",
//         shippedDate: { [Op.not]: null },
//       },
//     });

//     await Promise.all(
//       orderData?.map(async (orders) => {
//         try {
//           await eBay.trading.GetTokenStatus({
//             RequesterCredentials: {
//               eBayAuthToken: token.dataValues.token,
//             },
//           });
//         } catch (err) {
//           await refreshToken(eBay, token);
//         }

//         const shippedDate = moment(orders.dataValues.shippedDate);
//         const today = moment();

//         if (today.diff(shippedDate, "days") >= 10) {
//           orderIds.push({ OrderID: orders.dataValues.orderId });
//         }
//       })
//     );

//     const orderStatusData = await eBay.trading.GetOrders({
//       OrderIDArray: orderIds,
//       Pagination: {
//         PageNumber: 1,
//         EntriesPerPage: 100,
//       },
//     });

//     await Promise.all(
//       orderStatusData?.OrderArray?.map(async (ord) => {
//         if (
//           ord?.Order?.ShippingServiceOptions[0]?.ShippingPackageInfo[0]
//             ?.ActualDeliveryDate
//         ) {
//           await order.update(
//             {
//               status: "delivered",
//               deliveryDate:
//                 ord?.Order?.ShippingServiceOptions[0]?.ShippingPackageInfo[0]
//                   ?.ActualDeliveryDate,
//             },
//             {
//               where: {
//                 orderId: ord?.Order?.OrderID,
//               },
//             }
//           );
//         }
//       })
//     );

//     if (orderStatusData?.HasMoreItems) {
//       for (var i = 2; i <= data?.PaginationResult?.TotalNumberOfPages; i++) {
//         const orderStatusData = await eBay.trading.GetOrders({
//           OrderIDArray: orderIds,
//           Pagination: {
//             PageNumber: 1,
//             EntriesPerPage: 100,
//           },
//         });

//         await Promise.all(
//           orderStatusData?.OrderArray?.map(async (ord) => {
//             if (
//               ord?.Order?.ShippingServiceOptions[0]?.ShippingPackageInfo[0]
//                 ?.ActualDeliveryDate
//             ) {
//               await order.update(
//                 {
//                   status: "delivered",
//                   deliveryDate:
//                     ord?.Order?.ShippingServiceOptions[0]
//                       ?.ShippingPackageInfo[0]?.ActualDeliveryDate,
//                 },
//                 {
//                   where: {
//                     orderId: ord?.Order?.OrderID,
//                   },
//                 }
//               );
//             }
//           })
//         );
//       }
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Delivered data fetched",
//     });
//   } catch (error) {
//     newRelic.recordCustomEvent(`Delivered status api error`, error);
//     console.log(error);
//     res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

async function updateMarketplaceData(updateMarketplaceArray) {
  try {
    console.log("Updating marketplace data", updateMarketplaceArray);
    const response = [];


    for (var x = 0; x < updateMarketplaceArray.length; x++) {

      const indexes = updateMarketplaceArray[x];

      const receivedQuantity = indexes.receivedQuantity;

      for (var i = 0; i < indexes.cskus.length; i++) {
        const csku = indexes.cskus[i];
        const quantity = csku.quantity;
        const marketplace = await Marketplace.findOne({
          where: { id: csku.marketplaceId },
        });
        const token = await Tokens.findOne({
          where: {
            accountName: csku.accountName,
            userId: csku.userId,
            marketPlaceId: csku.marketplaceId,
          },
        });
        if (marketplace.dataValues.url.includes("ebay")) {
          try {
            const newQuantity = (isNaN(parseInt(receivedQuantity)) ? 0 : parseInt(quantity)) - parseInt(receivedQuantity);

            const res = await updateEbayInventory(token, { dataValues: csku }, { Quantity: (newQuantity > 0 ? newQuantity : 0) });
            await apiCallLog("ReviseInventoryStatus", "/order/update-marketplace-data", "updateMarketplaceData", { dataValues: csku }, {}, {}, 'success');
            response.push(res);
          } catch (error) {
            console.log(error);
            await apiCallLog("ReviseInventoryStatus", "/order/update-marketplace-data", "updateMarketplaceData", { dataValues: csku }, {}, { error: error.message }, 'error');
          }
          csku.quantity = quantity;
          await csku.save();
        } else if (marketplace.dataValues.url.includes("shopify")) {
          const quantity = csku.quantity;
          csku.quantity = (isNaN(parseInt(receivedQuantity)) ? 0 : parseInt(quantity || 0)) - parseInt(receivedQuantity);
          await csku.save();
          try {
            const res = await updateShopifyInventory(token, { dataValues: csku }, { Quantity: receivedQuantity });
            await apiCallLog("ReviseInventoryStatus", "/order/update-marketplace-data", "updateMarketplaceData", { dataValues: csku, res: res }, {}, {}, 'success');
            response.push(res);
          } catch (error) {
            console.log(error);
            await apiCallLog("ReviseInventoryStatus", "/order/update-marketplace-data", "updateMarketplaceData", { dataValues: csku }, {}, { error: error.message }, 'error');
          }
        } else if (marketplaces.dataValues.url.includes("woocommerce")) {
          const quantity = csku.quantity;
          csku.quantity = quantity;
          await csku.save();
        } else if (marketplace.dataValues.url.includes("walmart")) {
          const quantity = csku.quantity;
          csku.quantity = quantity;
        }
      }

      // const mailOptions = {
      //   from: process.env.FROM_EMAIL,
      //   to: "akhlaq@mergekart.com",
      //   subject: "updated quantity",
      //   text: `updated quantity for isku ${JSON.stringify(updateMarketplaceArray)} \n and because of ${JSON.stringify(response)}`
      // };

      // // Create a transporter
      // let transporter = nodemailer.createTransport({
      //   host: process.env.SMTP_Hostname, // Replace with your SMTP host
      //   port: process.env.SMTP_Port,
      //   secure: false, // true for 465, false for other ports
      //   auth: {
      //     user: process.env.SMTP_Username, // Replace with your SMTP username
      //     pass: process.env.SMTP_Password, // Replace with your SMTP password
      //   },
      // });

      // await transporter.sendMail(mailOptions, function (error, info) {
      //   if (error) {
      //     console.log(error);
      //   } else {
      //     console.log('Email sent: ' + info.response);
      //   }
      // });

    }



  } catch (error) {
    console.log(error);

    // const mailOptions = {
    //   from: process.env.FROM_EMAIL,
    //   to: "akhlaq@mergekart.com",
    //   subject: "updated quantity failed",
    //   text: `Error in updating quantity for isku ${JSON.stringify(updateMarketplaceArray)} \n and because of ${error.message}`
    // };

    // // Create a transporter
    // let transporter = nodemailer.createTransport({
    //   host: process.env.SMTP_Hostname, // Replace with your SMTP host
    //   port: process.env.SMTP_Port,
    //   secure: false, // true for 465, false for other ports
    //   auth: {
    //     user: process.env.SMTP_Username, // Replace with your SMTP username
    //     pass: process.env.SMTP_Password, // Replace with your SMTP password
    //   },
    // });

    // await transporter.sendMail(mailOptions, function (error, info) {
    //   if (error) {
    //     console.log(error);
    //   } else {
    //     console.log('Email sent: ' + info.response);
    //   }
    // });

    await apiCallLog("ReviseInventoryStatus", "/order/update-marketplace-data", "updateMarketplaceData", { dataValues: updateMarketplaceArray }, {}, { error: error.message }, 'error');

  }
}
exports.MarkReadyToShip = async (req, res) => {
  try {
    console.log("Hit");
    const browser = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--proxy-server=http://103.171.50.132:59100",
        "--disabled-setupid-sandbox",
      ],
    });
    console.log("Hit2");
    const page = await browser.newPage();
    await page.authenticate({
      username: "aditya1991arya",
      password: "TqPTQIp8bB",
    });
    await page.goto("https://whatismyipaddress.com/");
    console.log("Hit3");
    browser.on("disconnected", () => {
      res.status(200).json({ message: "Browser window closed successfully." });
    });
    console.log("Hit4");
  } catch (error) {
    console.error("Error opening browser window:", error);
    console.log("Hit5");
    res.status(200).json({
      message: "Browser window closed successfully.",
      error: error.message,
    });
  }
};

exports.GetAllOrdersShopify = async (req, res) => {
  try {
    const {
      marketplaceId,
      page = 1,
      limit = 10,
      accountName,
      search,
      status = "any",
      userId,
      orderBy,
      type,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {
      where: {},
    };

    if (search) {
      query.where[Op.or] = [
        { orderId: search },
        {
          buyerUserName: {
            [Op.iLike]: `%${search}%`,
          },
        },
      ];
    }

    if (userId) {
      const tokens = await Tokens.findAll({
        where: {
          userId: userId,
        },
      });

      const accountNames = tokens?.map(
        (token) => token?.dataValues?.accountName
      );

      if (accountNames.length > 0) {
        query.where[Op.and] = {
          accountName: {
            [Op.in]: accountNames,
          },
          userId: userId,
        };
      } else {
        query.where.userId = userId;
      }
    }

    if (status !== "any") {
      query.where.status = status;
    }

    if (accountName) {
      query.where.accountName = accountName;
    }
    // Fetch Shopify orders

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

    const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json?status=any`;

    const headers = {
      "X-Shopify-Access-Token": token.dataValues.token,
      "Content-Type": "application/json",
    };

    const response = await axios.get(shopifyUrl, {
      headers,
    });

    const data = response.data.orders;
    const count = data.length;
    return res.status(200).json({
      success: true,
      status: 200,
      data: data,
      count,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false,
      status: 500,
      message: err.message,
    });
  }
};

exports.fetchOrderReturnShopify = async (req, res) => {
  try {
    const { userId, marketplaceId, accountName, startDate } = req.body;

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

    const headers = {
      "X-Shopify-Access-Token": token.dataValues.token,
      "Content-Type": "application/json",
    };

    let fetchUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json?status=any`;
    let hasNextPage = true;
    let returns = [];

    while (hasNextPage) {
      const response = await axios.get(fetchUrl, { headers });
      const orders = response.data.orders;

      for (let order of orders) {
        const refundsResponse = await axios.get(
          `https://${accountName}.myshopify.com/admin/api/2024-01/orders/${order.id}/refunds.json`,
          { headers }
        );
        const refunds = refundsResponse.data.refunds;

        if (refunds.length > 0) {
          returns.push(...refunds);
        }
      }

      const linkHeader = response.headers.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextPageUrl = linkHeader.split(";")[0].slice(1, -1);
        fetchUrl = nextPageUrl;
      } else {
        hasNextPage = false;
      }
    }

    await Promise.all(
      returns.map(async (item) => {
        const orderData = await order.findOne({
          where: {
            orderId: item.order_id.toString(),
          },
        });

        if (orderData) {
          switch (item.status) {
            case "requested":
              orderData.status = "return_requested";
              orderData.returnId = item.id.toString();
              break;
            case "accepted":
              orderData.status = "return_accepted";
              break;
            case "restocked":
              orderData.status = "return_restocked";
              break;
            case "cancelled":
              orderData.status = "return_cancelled";
              break;
            case "refunded":
              orderData.status = "return_refunded";
              break;
            default:
              await orderData.save();
          }

          await orderData.save();
        }
      })
    );

    return res.status(200).json({
      success: true,
      status: 200,
      data: returns,
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

const extendedCarrierMapping = {
  A1CourierServices: "A-1 Courier",
  ABF: "ABF Freight",
  AeroPost: "AeroPost",
  ALLIEDEXPRESS: "Allied Express",
  AMWST: "AMWST",
  AnPost: "An Post",
  APC: "APC Postal Logistics",
  ARAMEX: "Aramex",
  ARVATO: "Arvato",
  ASM: "ASM",
  AustralianAirExpress: "Australian Air Express",
  AustraliaPost: "Australia Post",
  AVRT: "Averitt Express",
  Bartolini: "BRT Bartolini",
  BELGIANPOST: "Belgian Post Group",
  BKNS: "BKNS",
  BluePackage: "Blue Package Delivery",
  BPost: "bpost",
  BusinessPost: "BusinessPost",
  CanPar: "Canpar Courier",
  CENF: "Central Freight Lines",
  CEVA: "CEVA Logistics",
  ChinaPost: "China Post",
  Chronoexpres: "Chronoexpres",
  Chronopost: "Chronopost",
  CHUKOU1: "Chukou1",
  ChunghwaPost: "Chunghwa Post",
  CitiPost: "CitiPost",
  CityLink: "Citylink",
  ClickandQuick: "Click & Quick",
  CNWY: "XPO Logistics (formerly Con-way Freight)",
  ColiposteDomestic: "Coliposte Domestic",
  ColiposteInternational: "Coliposte International",
  Colissimo: "Colissimo",
  CollectPlus: "CollectPlus",
  Correos: "Correos",
  CPC: "CPC Logistics",
  CustomCode: "Reserved for internal or future use",
  DAIPost: "DAI Post",
  DayandRoss: "Day & Ross",
  DBSchenker: "DB Schenker",
  DeutschePost: "Deutsche Post",
  DHL: "DHL Express",
  DHLEKB: "DHL EKB",
  DHLEXPRESS: "DHL Express",
  DHLG: "Use DHLGlobalMail instead",
  DHLGlobalMail: "DHL Global Mail",
  DieSchweizerischePost: "Die Schweizerische Post",
  DPD: "DPD (Dynamic Parcel Distribution)",
  DPXThailand: "DPX Thailand",
  Ducros: "Not currently supported",
  EGO: "E-go",
  EMF: "Not currently supported",
  Exapaq: "DPD France (formerly Exapaq)",
  Fastway: "Fastway",
  FASTWAYCOURIERS: "Fastway Couriers",
  FedEx: "FedEx",
  FedExSmartPost: "FedEx SmartPost",
  FLYT: "Flyt",
  FLYTExpress: "Flyt Express",
  FlytExpressUSDirectline: "Flyt Express US Direct line",
  FourPX: "4PX",
  FourPXCHINA: "4PX China",
  FourPXExpress: "4PX Express",
  FourPXLTD: "4PX Express Co. Ltd",
  FTFT: "Not currently supported",
  FulfilExpressAccStation: "FulfilExpress-AccStation",
  FulfilExpresseForCity: "FulfilExpress-eForCity",
  FulfilExpressEverydaySource: "FulfilExpress-EverydaySource",
  FulfilExpressiTrimming: "FulfilExpress-iTrimming",
  GLS: "GLS (General Logistics Systems)",
  HDUSA: "MXD Group (formerly Home Direct USA)",
  Hermes: "Hermes Group",
  HomeDeliveryNetwork: "Use Yodel instead",
  HongKongPost: "Hong Kong Post",
  HUNTEREXPRESS: "Hunter Express",
  iLoxx: "iloxx eService",
  IndiaPost: "India Post",
  IndonesiaPost: "Indonesia Post",
  Interlink: "Interlink Express",
  InterPost: "InterPost",
  IoInvio: "IoInvio",
  Iparcel: "UPS i-parcel",
  IsraelPost: "Israel Post",
  JapanPost: "Japan Post",
  KIALA: "Kiala (UPS Access Point)",
  KoreaPost: "Korea Post",
  Landmark: "Landmark Global",
  LAPOSTE: "La Poste",
  LDSO: "Not currently supported",
  LTL: "Not currently supported",
  MALAYSIAPOST: "Malaysia Post",
  MannaFreight: "Manna Distribution Services",
  Metapack: "Metapack",
  MNGTurkey: "MNG Kargo",
  MondialRelay: "Mondial Relay",
  MRW: "MRW",
  MSI: "MSI Transportation",
  Nacex: "Nacex",
  NEMF: "New England Motor Freight",
  ODFL: "Old Dominion Freight Line",
  OFFD: "Not currently supported",
  ONTRACK: "OnTrac Shipping",
  OsterreichischePostAG: "Osterreichische Post",
  Other: "Use this code for any carrier not listed here",
  OVNT: "UPS Freight (formerly Overnite)",
  Parcelforce: "Parcelforce",
  ParcelPool: "International Bridge Domestic delivery",
  Philpost: "PHLPost (Philippine Postal Corporation)",
  Pilot: "Pilot Freight Services",
  PITD: "PITT OHIO",
  PocztaPolska: "Poczta Polska",
  Pocztex: "Pocztex",
  PosteItaliane: "Poste Italiane",
  POSTITALIANO: "Post Italiano",
  PostNL: "PostNL",
  PostNordNorway: "PostNord",
  Prestige: "LaserShip (formerly Prestige Expedite)",
  Quantium: "Quantium Solutions",
  RETL: "Reddaway",
  RoyalMail: "Royal Mail",
  RRUN: "Not currently supported",
  SAIA: "Saia LTL Freight",
  SDA: "SDA Express Courier",
  Seur: "Seur",
  SevenLSP: "Not currently supported",
  SFC: "Not currently supported",
  SFCExpress: "Not currently supported",
  SINGAPOREPOST: "Singapore Post",
  Siodemka: "Siodemka (DPD Poland)",
  SioliandFontana: "Sioli & Fontana",
  SkynetMalaysia: "Skynet (Malaysia)",
  SMARTSEND: "Smart Send Courier Service",
  Sogetras: "SGT Corriere Espresso",
  Spediamo: "Spediamo",
  SpeeDee: "Spee-Dee Delivery Service",
  StarTrack: "StarTrack",
  SuntekExpressLTD: "Suntek Express LTD",
  SwissPost: "Swiss Post",
  TELE: "TELE",
  TEMANDO: "Temando (shipping broker)",
  THAILANDPOST: "Thailand Post",
  TNT: "Not currently supported",
  TNTEXPRESS: "Not currently supported",
  TNTPost: "Not currently supported",
  Toll: "Toll (Japan Post)",
  TPG: "TPG Logistics",
  TWW: "Not currently supported",
  UBI: "UBI Smart Parcel",
  UKMail: "UK Mail",
  UPS: "United Parcel Service",
  UPSC: "Not currently supported",
  UPSMailInnovations: "UPS Mail Innovations",
  USFG: "Not currently supported",
  USPS: "U.S. Postal Service",
  USPSCeP: "USPS Commercial ePacket",
  USPSPMI: "USPS Priority Mail International",
  VietnamPost: "Vietnam Post",
  VITR: "Vitran Express",
  WATKINS: "Not currently supported",
  Winit: "WIN.IT America",
  Wise: "Not currently supported",
  WNdirect: "wnDirect",
  WPX: "WPX Delivery Solutions",
  YANWEN: "YANWEN Express",
  Yodel: "Yodel",
  YRC: "YRC Freight",
};

function getCarrierName(carrierCode) {
  return extendedCarrierMapping[carrierCode] || "Unknown Carrier";
}