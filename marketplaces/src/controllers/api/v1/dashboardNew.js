const Project = require("../../../models/project");
const UniqueProduct = require("../../../models/uniqueProduct");
const order = require("../../../models/order");
const csku = require("../../../models/csku");
const { messages } = require("../../../models/messages");
const isku = require("../../../models/isku");
const inbound = require("../../../models/inbound");
const Tokens = require("../../../models/tokens");
const Marketplace = require("../../../models/marketplace");
const Geosite = require("../../../models/geosite");
const ebay = require("ebay-api");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const { Op, Sequelize } = require("sequelize");
const moment = require("moment");
const getSymbolFromCurrency = require("currency-symbol-map");
const { apiCallLog } = require("../../../helper/apiCallLog");
const { search } = require("../../../routers/api/v1/dashboard");

exports.Dashboard = async (req, res) => {
  const { userId } = req.query;

  try {
    // Execute all tasks simultaneously
    const results = await Promise.allSettled([
      TodaysInsights(userId),
      YourMarketplaces(userId),
      TopSellingProduct(userId),
      // TopSellingProductDetails(channelId),
      // SearchProduct(searchInput, accountName, marketplaceId),
      TotalRevenue(userId),
      RevenueStatistics(userId),
      StorePerformance(userId),
    ]);

    const insightsResult = results[0];
    const marketplacesResult = results[1];
    const topSellingProductsResult = results[2];
    // const topSellingProductsDetailsResult = results[3];
    // const SearchInputResult = results[4];
    const totalRevenueResult = results[3];
    const StorePerformanceResult = results[5];

    const todaysInsights =
      insightsResult.status === "fulfilled"
        ? insightsResult.value
        : { error: insightsResult.reason };

    const marketplaces =
      marketplacesResult.status === "fulfilled"
        ? marketplacesResult.value.marketplaces
        : { error: marketplacesResult.reason };

    const topSellingProducts =
      topSellingProductsResult.status === "fulfilled"
        ? topSellingProductsResult.value
        : { error: topSellingProductsResult.reason };

    // const topSellingProductsDetails =
    //   topSellingProductsDetailsResult.status === "fulfilled"
    //     ? topSellingProductsDetailsResult.value
    //     : { error: topSellingProductsDetailsResult.reason };

    // const SearchInput =
    //   SearchInputResult.status === "fulfilled"
    //     ? SearchInputResult.value
    //     : { error: SearchInputResult.reason };

    const totalRevenue =
      totalRevenueResult.status === "fulfilled"
        ? totalRevenueResult.value
        : { error: totalRevenueResult.reason };
    const storePerformance =
      StorePerformanceResult.status === "fulfilled"
        ? StorePerformanceResult.value
        : { error: StorePerformanceResult.reason };
    const dashboardData = {
      todaysInsights,
      marketplaces,
      topSellingProducts,
      // topSellingProductsDetails,
      // SearchInput,
      totalRevenue,
      storePerformance,
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error generating dashboard data:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

const TodaysInsights = async (userId) => {
  const totalOrders = await order.findAll({
    where: {
      userId: userId,
      createdAt: {
        [Op.gte]: new Date(new Date() - 1 * 24 * 60 * 60 * 1000), // 30 days ago
      },
    },
  });
  const newOrders = totalOrders.length;

  console.log("Orders length >", newOrders);

  const returnOrders = await order.findAll({
    where: {
      userId: userId,
      createdAt: {
        [Op.gte]: new Date(new Date() - 1 * 24 * 60 * 60 * 1000), // 30 days ago
      },
      [Op.and]: [
        Sequelize.where(Sequelize.cast(Sequelize.col("status"), "TEXT"), {
          [Op.like]: "%return%",
        }),
      ],
    },
  });

  const returns = returnOrders.length;
  console.log("return length > ", returns);

  const cancelledOrders = await order.findAll({
    where: {
      userId: userId,
      status: {
        [Op.and]: [
          Sequelize.where(Sequelize.cast(Sequelize.col("status"), "TEXT"), {
            [Op.like]: "%cancel%",
          }),
        ],
      },
      createdAt: {
        [Op.gte]: new Date(new Date() - 1 * 24 * 60 * 60 * 1000), // 30 days ago
      },
    },
  });
  const cancels = cancelledOrders.length;
  console.log("Cancelled order >>", cancels);

  let newMessages = 0;
  const messagesList = await messages.findAll({
    where: {
      userId: userId,
      sentBy: "buyer",
      createdAt: {
        [Op.gte]: new Date(new Date() - 1 * 24 * 60 * 60 * 1000),
      },
    },
  });
  newMessages = messagesList.length;
  console.log("Total Messages >>", newMessages);

  return {
    newOrders,
    newMessages,
    returns,
    cancels,
  };
};

const YourMarketplaces = async (userId) => {
  const accounts = await Tokens.findAll({
    where: {
      userId: userId,
    },
  });

  let marketplaces = accounts.map((account) => ({
    accountName: account.accountName,
    marketplaceId: account.marketPlaceId,
  }));

  const marketplaceIds = marketplaces.map(
    (marketplace) => marketplace.marketplaceId
  );
  const marketplacesLogos = await Marketplace.findAll({
    where: {
      id: marketplaceIds,
    },
  });
  const result = marketplaces.map((marketplace) => {
    const matchedLogo = marketplacesLogos.find(
      (logo) => logo.id === marketplace.marketplaceId
    );
    return {
      accountName: marketplace.accountName,
      image: matchedLogo ? matchedLogo.logo : null,
    };
  });

  console.log({ marketplaces: result });

  return { marketplaces: result };
};

exports.SearchProduct = async (req, res) => {
  let { searchInput, userId } = req.query;

  if (!searchInput) {
    return res.status(400).json({ error: "Search input is required." });
  }

  try {
    const products = await csku.findAll({
      where: {
        userId: userId,
        [Op.or]: [
          {
            isku: {
              [Op.like]: `%${searchInput}%`,
            },
          },
          {
            title: {
              [Op.like]: `%${searchInput}%`,
            },
          },
          {
            channelId: searchInput, // Exact match for ItemId
          },
        ],
      },
    });

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No products found.",
        data: [],
      });
    }

    return res.status(200).json({
      success: true,
      totalResults: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Error searching for product:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const TopSellingProduct = async (userId) => {
  if (!userId) {
    return {
      status: 400,
      message: "Required Fields Missing",
    };
  }
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const orders = await order.findAll({
      where: {
        userId: userId,
        createdAt: {
          [Op.gte]: threeMonthsAgo,
        },
      },
    });

    const groupedOrders = orders.reduce((acc, order) => {
      const createdAt = new Date(order.createdAt);
      const yearMonth = `${createdAt.getFullYear()}-${
        createdAt.getMonth() + 1
      }`;

      if (!acc[yearMonth]) {
        acc[yearMonth] = [];
      }

      acc[yearMonth].push(order);
      return acc;
    }, {});

    const groupedOrdersArray = Object.entries(groupedOrders).map(
      ([month, orders]) => ({
        month,
        orders,
      })
    );

    const mostOrderedItemsByMonth = groupedOrdersArray.map(
      ({ month, orders }) => {
        const itemStats = {};

        orders.forEach((order) => {
          if (!order.items || order.items.length === 0) {
            return;
          }

          order.items.forEach((item) => {
            const itemId = item.itemId;
            if (!itemId) {
              return;
            }

            const quantity = item.quantity || 1;
            const itemCost = parseFloat(item.itemCost?.value || 0);
            const revenue = itemCost * quantity;

            if (!itemStats[itemId]) {
              itemStats[itemId] = {
                totalQuantity: 0,
                totalRevenue: 0,
                monthlyData: [],
              };
            }

            itemStats[itemId].totalQuantity += quantity;
            itemStats[itemId].totalRevenue += revenue;
          });
        });

        let mostOrderedItem = null;
        let maxCount = 0;

        for (const [itemId, stats] of Object.entries(itemStats)) {
          if (stats.totalQuantity > maxCount) {
            mostOrderedItem = {
              itemId: itemId,
              totalQuantity: stats.totalQuantity,
              totalRevenue: stats.totalRevenue,
            };
            maxCount = stats.totalQuantity;
          }
        }

        return {
          month,
          mostOrderedItem: mostOrderedItem || { itemId: "No valid items" },
          totalOrders: orders.length,
          totalQuantity: mostOrderedItem?.totalQuantity || 0,
          totalRevenue: mostOrderedItem?.totalRevenue || 0,
        };
      }
    );

    const topSellingProducts = await Promise.all(
      mostOrderedItemsByMonth.map(async (monthData) => {
        const { month, mostOrderedItem } = monthData;

        const otherMonthSales = groupedOrdersArray
          .filter((data) => data.month !== month)
          .map(({ month, orders }) => {
            const itemStats = {};

            orders.forEach((order) => {
              if (!order.items || order.items.length === 0) {
                return;
              }

              order.items.forEach((item) => {
                const itemId = item.itemId;
                if (!itemId) {
                  return;
                }

                if (itemId === mostOrderedItem.itemId) {
                  const quantity = item.quantity || 1;
                  const itemCost = parseFloat(item.itemCost?.value || 0);
                  const revenue = itemCost * quantity;

                  if (!itemStats[itemId]) {
                    itemStats[itemId] = {
                      totalQuantity: 0,
                      totalRevenue: 0,
                    };
                  }

                  itemStats[itemId].totalQuantity += quantity;
                  itemStats[itemId].totalRevenue += revenue;
                }
              });
            });

            return {
              month,
              revenue: itemStats[mostOrderedItem.itemId]?.totalRevenue || 0,
              itemsSold: itemStats[mostOrderedItem.itemId]?.totalQuantity || 0,
            };
          });

        const itemDetails = await csku.findOne({
          where: {
            channelId: mostOrderedItem.itemId,
          },
        });

        const channelId = itemDetails?.channelId || "Unknown";
        const sku = itemDetails?.isku || "Unknown";
        const categoryNames =
          itemDetails?.categoryName?.split(":").pop() || "No category";
        const title = itemDetails?.title || "No title";
        const price = itemDetails?.mrp || 0;
        const quantity = itemDetails?.quantity || 0;
        const accountName = itemDetails?.accountName || "N/A";
        const images = itemDetails?.images || [];
        const marketplaceId = itemDetails?.marketplaceId || "N/A";

        const logo = await Marketplace.findOne({
          where: {
            id: marketplaceId,
          },
          attributes: ["logo"],
        });

        return {
          name: title,
          category: categoryNames,
          channelId: channelId,
          sku: sku,
          price: price,
          quantity: quantity,
          accountName: accountName,
          images: images,
          logo: logo?.logo,
          monthlyData: [
            {
              month,
              revenue: mostOrderedItem?.totalRevenue || 0,
              itemsSold: mostOrderedItem?.totalQuantity || 0,
            },
            ...otherMonthSales,
          ],
        };
      })
    );

    console.log({
      topSellingProducts,
    });
    return topSellingProducts;
  } catch (error) {
    console.log("Top Selling Product Error : ", error);
  }
};

const TopSellingProductDetails = async (channelIdParam) => {
  if (!channelIdParam) {
    return {
      status: 400,
      message: "Channel ID is required",
    };
  }

  try {
    const itemDetails = await csku.findOne({
      where: {
        channelId: channelIdParam,
      },
    });

    if (!itemDetails) {
      return {
        status: 404,
        message: "Product not found",
      };
    }

    const productTitle = itemDetails.title;
    const price = itemDetails.price;
    const createdAt = itemDetails.createdAt;
    const channelId = itemDetails.channelId;

    return {
      topSellingProductsDetails: [
        {
          productTitle,
          price,
          createdDate: createdAt,
          channelID: channelId,
        },
      ],
    };
  } catch (error) {
    console.log(error);
    return {
      status: 500,
      message: "Internal server error",
    };
  }
};

const TotalRevenue = async (userId) => {
  if (!userId) {
    return {
      status: 400,
      message: "Required Fields Missing",
    };
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const orders = await order.findAll({
    where: {
      userId,
      createdAt: {
        [Op.gte]: sixMonthsAgo,
      },
    },
  });

  const groupedOrders = orders.reduce((acc, order) => {
    const createdAt = new Date(order.createdAt);
    const yearMonth = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}`;

    if (!acc[yearMonth]) {
      acc[yearMonth] = { totalRevenue: 0, unitsSold: 0, orders: [] };
    }

    acc[yearMonth].orders.push(order);

    const items = order.items || [];
    items.forEach((item) => {
      const itemCost = parseFloat(item?.itemCost?.value || 0);
      const quantity = parseInt(item?.quantity || 0, 10);

      acc[yearMonth].totalRevenue += itemCost;
      acc[yearMonth].unitsSold += quantity;
    });

    return acc;
  }, {});

  const totalRevenue = Object.entries(groupedOrders)
    .sort(
      ([monthA], [monthB]) =>
        new Date(`${monthA}-01`) - new Date(`${monthB}-01`)
    )
    .map(([month, { orders, totalRevenue, unitsSold }]) => ({
      month,
      totalOrders: orders.length,
      revenue: parseFloat(totalRevenue.toFixed(2)),
      unitsSold: parseInt(unitsSold || 0, 10),
    }));

  console.log(totalRevenue);
  return totalRevenue;
};

const StorePerformance = async (userId) => {
  try {
    // Get all tokens (stores) for the user
    const tokens = await Tokens.findAll({
      where: {
        userId: userId,
      },
      attributes: ["id", "accountName", "marketPlaceId"],
    });

    let totalOrdersCount = 0;
    const aggregatedOrders = new Map();

    // Collect order data for each store and aggregate by accountName
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const accountName = token.accountName;

      const totalOrders = await order.findAll({
        where: {
          userId: userId,
          accountName: accountName,
          createdAt: {
            [Op.gte]: new Date(new Date() - 1 * 24 * 60 * 60 * 1000),
          },
        },
      });

      const orderCount = totalOrders.length;
      
      // Only add to aggregated orders if there are orders
      if (orderCount > 0) {
        totalOrdersCount += orderCount;
        aggregatedOrders.set(accountName, orderCount);
      }
    }

    // Convert aggregated orders to array and calculate percentages
    // Only include stores that have orders
    let storePerformance = Array.from(aggregatedOrders.entries())
      .map(([name, orders]) => ({
        name,
        value: Number(((orders / totalOrdersCount) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);

    // Only add Others category if:
    // 1. There are more than 4 accounts WITH orders
    // 2. At least 4 accounts have orders (to make Others meaningful)
    if (storePerformance.length > 4) {
      const topStores = storePerformance.slice(0, 3);
      const otherStores = storePerformance.slice(3);

      const othersValue = otherStores.reduce(
        (sum, store) => sum + store.value,
        0
      );

      // Only include Others if there's actually value to show
      if (othersValue > 0) {
        storePerformance = [
          ...topStores,
          {
            name: "Others",
            value: Number(othersValue.toFixed(2)),
          },
        ];
      } else {
        storePerformance = topStores;
      }
    }

    console.log("Store performance >> ", storePerformance);

    // Only return data if there are stores with orders
    if (storePerformance.length > 0) {
      return {
        storePerformance,
        totalTransactions: totalOrdersCount,
        timeFrame: "Last 24 hours",
      };
    } else {
      return {
        storePerformance: [],
        totalTransactions: 0,
        timeFrame: "Last 24 hours",
      };
    }
  } catch (error) {
    console.error("Error in StorePerformance:", error);
    throw new Error("Failed to fetch store performance data");
  }
};

const RevenueStatistics = async (marketplaceId, userId, accountName) => {};

// exports.AccountNames = async(req, res) => {
//   const { userId } = req.query;
//   if (!userId) {
//     return res.status(400).json({
//       message: "Required fields missing"
//     });
//   }

//   try {
//     const accountNames = await Tokens.findAll({
//       where: {
//         userId: userId
//       },
//       attributes: ["accountName"],
//       raw: true
//     });

//     const accountNamesList = accountNames.map(item => item.accountName);

//     return res.status(200).json(accountNamesList);
//   } catch (error) {
//     console.error("Error fetching account names:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };
