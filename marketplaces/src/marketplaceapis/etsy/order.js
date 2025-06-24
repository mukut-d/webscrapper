const axios = require("axios");
const moment = require("moment");
const csku = require("../../models/csku");
const isku = require("../../models/isku");
const { sequelize } = require("../../database/config");
const order = require("../../models/order");
const Tokens = require("../../models/tokens");
const Marketplace = require("../../models/marketplace");
const { pushDataToEtsy } = require("./catalogue");
const { Op } = require("sequelize");

exports.GetEtsyOrders = async (
  token,
  startDate,
  marketplaceId,
  accountName,
  userId,
  addQuantity,
  type
) => {
  try {
    let orders = [];
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token.dataValues.token;

    let shopId = token.dataValues.shop_id;
    let offset = 0;
    let hasMoreReceipts = true;
    let pageNumber = 1;
    startDate = moment(startDate).unix();
    let endDate = moment().unix();

    const limit = 100;

    while (hasMoreReceipts) {
      try {
        const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts`;

        let params = {
          limit,
          offset,
          min_created: startDate,
          max_created: endDate,
          sort_on: "created",
          sort_order: "desc",
        };

        if (type === "shipped") {
          params.was_shipped = true;
        } else if (type === "firstFetch") {
          params.was_paid = true;
        }

        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            "x-api-key": token.dataValues.client_id,
          },
          params,
        });

        const { results, count } = response.data;

        if (results && results.length > 0) {
          console.log("result:");
          orders.push(...results);
          offset += results.length;
          pageNumber++;

          console.log(
            `Fetched ${results.length} receipts from page ${pageNumber}. Total so far: ${offset}`
          );
        }

        hasMoreReceipts = results.length > 0 && count > offset;
      } catch (error) {
        console.error(
          `Error fetching receipts on page ${pageNumber}:`,
          error.response?.data || error.message
        );
        throw error;
      }
    }

    // while (hasMoreReceipts) {
    //   try {
    //     const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts`;

    //     let params = {
    //       limit,
    //       offset,
    //       min_created: startDate,
    //       max_created: endDate,
    //       sort_on: "created",
    //       sort_order: "desc",
    //     };

    //     if (type === "shipped") {
    //       params.was_shipped = true;
    //     } else if (type === "firstFetch") {
    //       params.was_paid = true;
    //     }

    //     const response = await axios.get(url, {
    //       headers: {
    //         Authorization: `Bearer ${access_token}`,
    //         "Content-Type": "application/json",
    //         "x-api-key": token.dataValues.client_id,
    //       },
    //       params,
    //     });

    //     const { results, count } = response.data;

    //     if (results && results.length > 0) {
    //       console.log("result:");
    //       // Only take the first listing for testing
    //       orders.push(results[0]);
    //       offset += 1;
    //       pageNumber++;

    //       console.log(
    //         `Fetched 1 receipt from page ${pageNumber}. Total so far: ${offset}`
    //       );
    //       // Break after first listing for testing
    //       break;
    //     }

    //     hasMoreReceipts = results.length > 0 && count > offset;
    //   } catch (error) {
    //     console.error(
    //       `Error fetching receipts on page ${pageNumber}:`,
    //       error.response?.data || error.message
    //     );
    //     throw error;
    //   }
    // }

    await pushOrders(
      accountName,
      marketplaceId,
      orders,
      userId,
      type,
      addQuantity,
      token
    );
    // ...existing code...

    // await pushOrders(
    //   accountName,
    //   marketplaceId,
    //   orders,
    //   userId,
    //   type,
    //   addQuantity,
    //   token
    // );

    console.log("All receipts have been fetched and stored.");
  } catch (error) {
    console.error(
      "Error fetching Etsy receipts:",
      error.response?.data || error.message
    );
    throw error;
  }
};

async function pushOrders(
  accountName,
  marketplaceId,
  orders,
  userId,
  type,
  addQuantity,
  token
) {
  try {
    let response = await Promise.all(
      orders.map(async (item) => {
        let status = "unpaid";
        let shippingDate = "";
        let orderFulfillment = "NOT_STARTED";
        // console.log("orders >> ", orders);
        if (item.status == "payment processing" && item.is_paid == true) {
          status = "in_progress";
          orderFulfillment = "NOT_STARTED";
          orderPaymentStatus = "IN_PROGRESS";
        } else if (
          item.is_paid == true &&
          item.status.toLowerCase() == "paid"
        ) {
          status = "paid";
          orderPaymentStatus = "PAID";
          orderFulfillment = "NOT_STARTED";
        }
        console.log("status >> ", status);
        if (
          item.is_shipped == true &&
          item.status.toLowerCase() == "paid" &&
          type == "shipped"
        ) {
          status = "shipped";
          orderFulfillment = "FULFILLED";
          orderPaymentStatus = "PAID";
        } else if (
          item.is_shipped == true &&
          item.status.toLowerCase() == "completed" &&
          type == "shipped"
        ) {
          status = "shipped";
          orderFulfillment = "FULFILLED";
          orderPaymentStatus = "PAID";
        }
        const orderExist = await order.findOne({
          where: {
            orderId: item.receipt_id.toString(),
            userId: userId,
            sellerId: accountName,
          },
        });

        if (!orderExist) {
          await Promise.all(
            item.transactions.map(async (line) => {
              const cskuExist = await csku.findOne({
                where: { channelId: line.listing_id.toString() },
              });
              // if (!cskuExist) {
              //   let listing_id = line.listing_id.toString();
              //   const url = `https://openapi.etsy.com/v3/application/listings/${listing_id}`;

              //   const newItem = await axios.get(url, {
              //     headers: {
              //       Authorization: `Bearer ${token.dataValues.token}`,
              //       "x-api-key": token.dataValues.client_id,
              //       "Content-Type": "application/json",
              //     },
              //     params: {
              //       includes: ["Images", "Inventory"],
              //       sort_on: "created",
              //       sort_order: "desc",
              //     },
              //   });
              //   if (newItem) {
              //     await Tokens.update(
              //       {
              //         itemsFetched: sequelize.literal(
              //           `CAST("itemsFetched" AS INTEGER) + ${1}`
              //         ),
              //       },
              //       { where: { userId: userId, accountName: accountName } }
              //     );

              //     await pushDataToEtsy(
              //       [newItem?.data],
              //       userId,
              //       accountName,
              //       marketplaceId,
              //       addQuantity
              //     );
              //     if (!newItem?.skus) {
              //       pushDataToEtsy(
              //         [newItem?.data],
              //         userId,
              //         accountName,
              //         marketplaceId,
              //         addQuantity
              //       );
              //     } else if (item.skus) {
              //       const iskuExist = await isku.findOne({
              //         where: { isku: newItem?.listing_id.toString() },
              //       });
              //       if (iskuExist && addQuantity) {
              //         iskuExist.quantity += newItem.quantity;
              //       } else if (!iskuExist) {
              //         pushDataToEtsy(
              //           [newItem?.data],
              //           userId,
              //           accountName,
              //           marketplaceId,
              //           addQuantity
              //         );
              //       }
              //     }
              //   } else {
              //     status = "problematic order";
              //   }
              // } else {
              //   try {
              //     const allCskus = await csku.findAll({
              //       where: {
              //         channelId: cskuExist.dataValues.channelId,
              //         id: {
              //           [Op.ne]: cskuExist.dataValues.id,
              //         },
              //       },
              //     });

              //     if (allCskus.length > 0 && type != "firstFetch") {
              //       await updateMarketplaceData(allCskus);
              //     }
              //   } catch (err) {
              //     console.log(err);
              //   }
              // }
            })
          );

          return {
            orderId: item.receipt_id,
            creationDate: new Date(item.created_timestamp * 1000),
            lastModifiedDate: new Date(item.updated_timestamp * 1000),
            orderFulfillmentStatus: orderFulfillment,
            orderPaymentStatus: item.status,
            sellerId: accountName,
            buyerUserName: item.name,
            buyerRegistrationAddress: {
              fullName: item.name,
              addressLine1: item.first_line,
              city: item.city,
              stateOrProvince: item?.state || "",
              postalCode: item.zip,
              countryCode: item.country_iso,
              primaryPhone: item?.phone || null,
              secondaryPhone: item?.phone || "",
              email: item.buyer_email,
            },
            pricingSummary: {
              grandTotal: item.grandtotal,
              totalPrice: item.totalprice,
              discountAmount: item.discount_amt,
              totalTaxCost: item.total_tax_cost,
            },
            payments: {
              grandTotal: item.grandtotal,
              paymentMethod: item.payment_method,
            },
            fulfillmentStartInstructions: item?.shipments || [],
            items: item.transactions?.map((line) => {
              return {
                lineItemId: line.transaction_id,
                itemId: line.listing_id,
                sku: line.sku,
                itemCost: line.price,
                quantity: line.quantity,
                appliedPromotions: line.buyer_coupon,
                lineItemStatus: line.shipping_method,
              };
            }),
            totalMarketplaceFee: item.totalMarketplaceFee
              ? item.totalMarketplaceFee
              : null,
            marketplaceId: marketplaceId,
            status: status,
            accountName: accountName,
            userId: userId,
            shippedDate:
              status == "shipped"
                ? new Date(
                    item?.shipments[0].shipment_notification_timestamp * 1000
                  )
                : null,
          };
        } else {
          orderExist.orderFulfillmentStatus = item.status;
          orderExist.orderPaymentStatus = item.status;
          orderExist.lastModifiedDate = item.updated_timestamp;
          if (
            status != orderExist.dataValues.status &&
            orderExist.dataValues.status != "delivered"
          ) {
            if (status == "paid" && type != "firstFetch") {
              console.log("");
            } else if (status == "shipped" && type != "firstFetch") {
              orderExist.shippedDate = moment().toISOString();
            }
          }
          orderExist.status = status;

          await orderExist.save();

          return null;
        }
      })
    );
    response = response.filter((item) => item != null);
    response = response.filter((item) => {
      console.log("shipment Data >> ", item?.shipments);
      if (item?.shipments?.length == "0") {
        console.log("Here");
        item.shippedDate = null;
      }
      return item;
    });
    await order.bulkCreate(response);
  } catch (error) {
    console.log(error);
  }
}

exports.GetEtsyDeliveredOrders = async (
  token,
  startDate,
  marketplaceId,
  accountName,
  userId,
  addQuantity
) => {
  try {
    let orders = [];
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let minuteDifference = startdate.diff(tokenExpiresDate, "minutes");

    if (minuteDifference >= 45) {
      await refreshToken(token);
    }

    let access_token = token.dataValues.token;

    let shopId = token.dataValues.shop_id;
    let offset = 0;
    let hasMoreReceipts = true;
    let pageNumber = 1;
    startDate = moment(startDate).unix();
    let endDate = moment().unix();

    const limit = 100;

    while (hasMoreReceipts) {
      try {
        const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts`;

        let params = {
          limit,
          offset,
          min_created: startDate,
          max_created: endDate,
          sort_on: "created",
          sort_order: "desc",
          was_delivered: true,
        };

        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            "x-api-key": token.dataValues.client_id,
          },
          params,
        });

        const { results, count } = response.data;

        if (results && results.length > 0) {
          console.log("result:");
          orders.push(...results);
          offset += results.length;
          pageNumber++;

          console.log(
            `Fetched ${results.length} receipts from page ${pageNumber}. Total so far: ${offset}`
          );
        }

        hasMoreReceipts = results.length > 0 && count > offset;
      } catch (error) {
        console.error(
          `Error fetching receipts on page ${pageNumber}:`,
          error.response?.data || error.message
        );
        throw error;
      }
    }

    // while (hasMoreReceipts) {
    //   try {
    //     const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts`;

    //     let params = {
    //       limit,
    //       offset,
    //       min_created: startDate,
    //       max_created: endDate,
    //       sort_on: "created",
    //       sort_order: "desc",
    //     };

    //     if (type === "shipped") {
    //       params.was_shipped = true;
    //     } else if (type === "firstFetch") {
    //       params.was_paid = true;
    //     }

    //     const response = await axios.get(url, {
    //       headers: {
    //         Authorization: `Bearer ${access_token}`,
    //         "Content-Type": "application/json",
    //         "x-api-key": token.dataValues.client_id,
    //       },
    //       params,
    //     });

    //     const { results, count } = response.data;

    //     if (results && results.length > 0) {
    //       console.log("result:");
    //       // Only take the first listing for testing
    //       orders.push(results[0]);
    //       offset += 1;
    //       pageNumber++;

    //       console.log(
    //         `Fetched 1 receipt from page ${pageNumber}. Total so far: ${offset}`
    //       );
    //       // Break after first listing for testing
    //       break;
    //     }

    //     hasMoreReceipts = results.length > 0 && count > offset;
    //   } catch (error) {
    //     console.error(
    //       `Error fetching receipts on page ${pageNumber}:`,
    //       error.response?.data || error.message
    //     );
    //     throw error;
    //   }
    // }

    await pushOrders(
      accountName,
      marketplaceId,
      orders,
      userId,
      type,
      addQuantity,
      token
    );


    console.log("All receipts have been fetched and stored.");
  } catch (error) {
    console.error(
      "Error fetching Etsy receipts:",
      error.response?.data || error.message
    );
    throw error;
  }
};

async function updateMarketplaceData(cskus) {
  try {
    for (var i = 0; i < cskus.length; i++) {
      const csku = cskus[i];
      const quantity = csku.dataValues.quantity - 1;
      const marketplace = await Marketplace.findOne({
        where: { id: csku.dataValues.marketplaceId },
      });
      const token = await Tokens.findOne({
        where: {
          accountName: csku.dataValues.accountName,
          userId: csku.dataValues.userId,
          marketPlaceId: csku.dataValues.marketplaceId,
        },
      });
      if (marketplace.dataValues.url.includes("etsy")) {
        const quantity = csku.dataValues.quantity - 1;
        csku.quantity = quantity;
      }
    }
  } catch (error) {
    console.log(error);
  }
}

const refreshToken = async (token) => {
  try {
    let refreshToken = token.refreshToken;
    const response = await axios.post(
      "https://api.etsy.com/v3/public/oauth/token",
      {
        grant_type: "refresh_token",
        client_id: token.dataValues.client_id,
        client_secret: token.dataValues.client_secret,
        refresh_token: refreshToken,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Save the new token
    token.token = response.data.access_token;
    token.lastTokenRefreshDate = new Date();
    await token.save();

    console.log("Token refreshed successfully.");
  } catch (error) {
    console.error("Error refreshing token:", error);
  }
};
