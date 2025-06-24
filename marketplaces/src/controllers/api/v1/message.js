const ebay = require("ebay-api");
const EBayAuthToken = require("ebay-oauth-nodejs-client");
const newRelic = require("newrelic");
const Tokens = require("../../../models/tokens");
const Marketplace = require("../../../models/marketplace");
const moment = require("moment");
const { MessageLog } = require("../../../models/messageLog");
const cheerio = require("cheerio");
const { emailTemplate } = require("../../../models/emailTemplate");
const { messages } = require("../../../models/messages");
const { Op, Sequelize } = require("sequelize");
const axios = require("axios");
const { UserType } = require("../../../utils/enum");
const { apiCallLog } = require("../../../helper/apiCallLog");
const { UpdateEbayMessageStatus } = require("../../../marketplaceapis/ebay/message");
const { sendMailUsingNodemailer } = require("../../../helper/sendEmail");
const ebayAuthToken = new EBayAuthToken({
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
    newRelic.recordCustomEvent(`Error while token refresh: ${error.message}`);
    console.log(error);
  }
}

async function fetchEbayMessages(
  token,
  startDate,
  endDate,
  userId,
  accountName
) {
  const functionName = "fetchEbayMessages";
  console.log(userId, "userID");
  try {
    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
    });
    eBay.OAuth2.setCredentials(token.dataValues.token);
    let startdate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startdate.diff(tokenExpiresDate, 'hours');

    if (hoursDifference > 2) {
      await refreshToken(eBay, token)
    }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/messages/fetch-messages",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
    // } catch (err) {
    //   console.log(err.meta);   
    //   await apiCallLog("GetTokenStatus","/messages/fetch-messages",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
    // await refreshToken(eBay, token);
    // }

    const messageData = await eBay.trading.GetMyMessages({
      StartTime: startDate,
      EndTime: endDate,
      DetailLevel: "ReturnHeaders",
    });
    await apiCallLog("GetMyMessage", "/messages/fetch-messages", functionName, {
      StartTime: startDate,
      EndTime: endDate,
      DetailLevel: "ReturnHeaders",
    }, messageData, {}, 'success');

    const response = [];
    console.log(messageData.Messages?.Message, "messageData");
    const messageIDs =
      messageData?.Messages?.Message != undefined && Array.isArray(messageData.Messages?.Message) ? messageData.Messages?.Message?.map((msg) => msg?.MessageID) || [] : [messageData.Messages?.Message?.MessageID];
    let j = 0;
    console.log(messageIDs, "messageIDs");
    while (j < messageIDs?.filter(Boolean).length) {
      console.log(j, "j");
      let startDate = moment();
      let tokenExpiresDate = moment(token.lastTokenRefreshDate);
      let hoursDifference = startDate.diff(tokenExpiresDate, 'hours');

      if (hoursDifference > 2) {
        await refreshToken(eBay, token)
      }
      // try {
      //   await eBay.trading.GetTokenStatus({
      //     RequesterCredentials: {
      //       eBayAuthToken: token.dataValues.token,
      //     },
      //   });
      //   await apiCallLog("GetTokenStatus","/messages/fetch-messages",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
      // } catch (err) {
      //   await apiCallLog("GetTokenStatus","/messages/fetch-messages",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');
      //   await refreshToken(eBay, token);
      // }
      const messageContent = await eBay.trading.GetMyMessages({
        MessageIDs: [
          {
            MessageID: messageIDs.slice(j, j + 10),
          },
        ],
        DetailLevel: "ReturnMessages",
      });

      await apiCallLog("GetMyMessage", "/messages/fetch-messages", functionName, {
        MessageIDs: [
          {
            MessageID: messageIDs.slice(j, j + 10),
          },
        ],
        DetailLevel: "ReturnMessages",
      }, messageContent, {}, 'success');

      for (let i = 0; i < messageContent?.Messages?.Message?.length; i++) {
        const msgArr = [];
        // console.log(messageContent?.Messages?.Message[i], "messageContent");
        const {
          Sender,
          RecipientUserID,
          Subject,
          MessageID,
          Text,
          Read,
          ItemID,
          ReceiveDate,
          Replied,
          Content,
        } = messageContent?.Messages?.Message[i];
        const contentString = Content || Text;
        const $ = cheerio.load(contentString);
        const msgData = {
          sender: Sender?.toString(),
          userId: userId,
          accountName: RecipientUserID,
          messageId: MessageID?.toString(),
          itemId: ItemID?.toString() || null,
          read: Read,
          replied: Replied,
          subject: Subject,
          received_time: ReceiveDate,
        };
        let m = 1;
        while ($(`#MessageHistory${m}`).length > 0) {
          const buyerMessage = $(`#MessageHistory${m} tbody p > a`).text();
          const sellerMessage = $(`#MessageHistory${m} tbody p`).text();
          const message = $(`#UserInputtedText${m}`).text();
          console.log(buyerMessage?.trim(), "buyerMessage");
          console.log(sellerMessage?.trim(), "sellerMessage");
          if (buyerMessage?.trim()) {
            msgArr.push({
              ...msgData,
              message: message?.trim(),
              sentBy: UserType.BUYER,
            });
          } else {
            msgArr.push({
              ...msgData,
              message: message?.trim(),
              sentBy: UserType.SELLER,
            });
          }
          m++;
        }
        if ($(`#UserInputtedText`).length) {
          const message = $(`#UserInputtedText`).text();
          msgArr.push({
            ...msgData,
            message: message?.trim(),
            sentBy: UserType.BUYER,
          });
        }
        const reversedArr = msgArr.reverse();
        for (let i = 0; i < reversedArr.length; i++) {
          const msg = reversedArr[i];
          const existMessage = await messages.findOne({
            where: {
              sender: msg?.sender,
              accountName: msg?.accountName,
              userId: msg?.userId,
              messageId: msg?.messageId,
              itemId: msg?.itemId,
              message: msg?.message?.trim(),
            },
          });
          if (existMessage) {
            await existMessage.update({
              read: Read,
              sequence: i + 1,
            });
          } else {
            response.push({
              ...msg,
              sequence: i + 1,
            });
          }
        }
      }
      j += 10;
    }
    return response;
  } catch (error) {
    await apiCallLog("GetMyMessage", "/messages/fetch-messages", functionName, {
      StartTime: startDate,
      EndTime: endDate,
      DetailLevel: "ReturnHeaders",
    }, {}, error.meta, 'error');
    newRelic.recordCustomEvent(`Message Fetch Error`, error);
    console.log(error);
    return [];
  }
}

async function fetchShopifyMessages(
  token,
  startDate,
  endDate,
  userId,
  accountName
) {
  try {
    const shopifyUrl = `https://${accountName}.myshopify.com/admin/api/2024-01/orders.json`;
    const headers = {
      "X-Shopify-Access-Token": token.dataValues.token,
      "Content-Type": "application/json",
    };

    const response = await axios.get(shopifyUrl, {
      headers,
      params: {
        created_at_min: startDate,
        created_at_max: endDate,
        status: "any",
      },
    });

    const orders = response.data.orders;
    const messages = orders.map((order) => ({
      sender: order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : "Unknown",
      userId: userId,
      accountName: accountName,
      messageId: order.id,
      itemId: order.id,
      read: true,
      replied: false,
      subject: `Order #${order.name} - ${order.financial_status}`,
      received_time: order.created_at,
      message: order.note || "",
    }));

    return messages;
  } catch (err) {
    newRelic.recordCustomEvent(`Message Fetch Error`, err);
    console.log(error);
    return [];
  }
}

exports.FetchMessages = async (req, res) => {
  const functionName = "FetchMessages";
  try {
    const { userId, accountName, marketplaceId, endDate, startDate } = req.body;

    const token = await Tokens.findOne({
      where: {
        userId: userId,
        accountName: accountName,
        marketPlaceId: marketplaceId,
      },
    });

    const marketPlace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
      },
    });

    if (!token) {
      return res.status(500).json({
        success: false,
        message: "Token for this account not found",
      });
    }

    let messagesList = [];
    if (marketPlace.url?.includes("ebay")) {
      messagesList = await fetchEbayMessages(
        token,
        startDate,
        endDate,
        userId,
        accountName
      );
    } else if (marketPlace.url?.includes("shopify")) {
      messagesList = await fetchShopifyMessages(
        token,
        startDate,
        endDate,
        userId,
        accountName
      );
    }
    let i = 0;
    while (i < messagesList.length) {
      try {
        await messages.bulkCreate(messagesList.slice(i, i + 100));
      } catch (error) {
        console.error(`Failed to insert batch starting at index ${i}:`, error);
      }
      i += 100;
    }

    return res.status(200).json({
      success: true,
      messageData: messagesList,
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Message Fetch Error`, error);
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.SendMessage = async (data, eBay, orderId, status, sellerId) => {
  const functionName = "SendMessage";
  const { receipientId, message, itemId, subject } = data;
  try {
    console.log(data);

    await eBay.trading
      .AddMemberMessageAAQToPartner({
        ItemID: itemId,
        MemberMessage: {
          Body: message.replace(/\\n/g, "\n"),
          QuestionType: "General",
          Subject: subject,
          RecipientID: receipientId,
        },
      })
      .then(async (res) => {
        await MessageLog.create({
          sender: sellerId,
          receiver: receipientId,
          order_number: orderId,
          status: status,
          send_date: moment().toISOString(),
          message: message,
        });
        await apiCallLog("AddMemberMessageAAQToPartner", "/messages/send-message", functionName, {
          ItemID: itemId,
          MemberMessage: {
            Body: message.replace(/\\n/g, "\n"),
            QuestionType: "General",
            Subject: subject,
            RecipientID: receipientId,
          },
        }, res, {}, 'success');
        newRelic.recordCustomEvent("Message sent to" + receipientId, message);
        console.log(res, message);
      });
  } catch (error) {
    await apiCallLog("AddMemberMessageAAQToPartner", "/messages/send-message", functionName, {
      ItemID: itemId,
      MemberMessage: {
        Body: message.replace(/\\n/g, "\n"),
        QuestionType: "General",
        Subject: subject,
        RecipientID: receipientId,
      },
    }, {}, error.meta, 'error');
    newRelic.recordCustomEvent(`Message Sending Error`, error);
    console.log(error);
    // res.status(500).json({
    //   success: false,
    //   message: error.message,
    // });
  }
};

exports.GetAutoMessageLog = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const data = await MessageLog.findAll({
      where: {
        order_number: orderNumber,
      },
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    newRelic.recordCustomEvent(`Message Get Error`, err);
    console.log(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// NOTE -  get all buyers chats based on accountName
exports.getAllChats = async (req, res) => {
  try {
    const { accountName, userId } = req.body;
    const whereClause = {};

    if (userId) {
      whereClause.userId = userId;
    }

    if (accountName) {
      whereClause.accountName = accountName;
    }

    const groupedData = await messages.findAll({
      where: whereClause,
      attributes: [
        "sender",
        "accountName",
        [
          Sequelize.literal(`SUM(CASE WHEN "read" = false THEN 1 ELSE 0 END)`),
          "unreadMessages",
        ],
        [
          Sequelize.fn("MAX", Sequelize.col("received_time")),
          "latestMessageTime",
        ],
      ],
      group: ["sender", "accountName"],
      order: [[Sequelize.fn("MAX", Sequelize.col("received_time")), "DESC"]],
    });
    res.status(200).json({
      success: true,
      data: groupedData,
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Chat Retrieval Error`, error);
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// NOTE - get all messages by buyerId
exports.getAllMessagesBySender = async (req, res) => {
  try {
    const { sender, accountName, userId } = req.body;
    const whereClause = {};

    if (userId) {
      whereClause.userId = userId;
    }
    if (sender) {
      whereClause.sender = sender;
    }
    if (accountName) {
      whereClause.accountName = accountName;
    }

    const allMessages = await messages.findAll({
      where: whereClause,
      order: [
        ["received_time", "ASC"],
        ["sequence", "ASC"],
      ],
    });

    // Group messages by date
    const groupedMessages = allMessages.reduce((acc, message) => {
      const date = new Date(message.received_time).toISOString().split("T")[0];
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(message);
      return acc;
    }, {});

    // Format the response
    const response = Object.keys(groupedMessages).map((date) => ({
      date,
      messages: groupedMessages[date],
    }));

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Message Retrieval Error`, error);
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.SendDirectMessage = async (req, res) => {
  const functionName = "SendDirectMessage";
  try {
    const { userId, accountName, receipientId, body, parentMessageId, itemId } =
      req.body;
    const token = await Tokens.findOne({
      where: { userId: userId, accountName: accountName },
    });
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token not found for this account",
      });
    }

    const parentMessage = await messages.findOne({
      where: { messageId: parentMessageId },
    });
    if (!parentMessage) {
      return res.status(400).json({
        success: false,
        message: "Invalid Parent Message Id.",
      });
    }

    const eBay = new ebay({
      appId: process.env.APP_ID,
      certId: process.env.CERT_ID,
      sandbox: false,
      devId: process.env.DEV_ID,
      autoRefreshToken: true,
    });

    eBay.OAuth2.setCredentials(token.dataValues.token);
    let startDate = moment();
    let tokenExpiresDate = moment(token.lastTokenRefreshDate);
    let hoursDifference = startDate.diff(tokenExpiresDate, 'hours');

    if (hoursDifference > 2) {
      await refreshToken(eBay, token)
    }
    // try {
    //   await eBay.trading.GetTokenStatus({
    //     RequesterCredentials: {
    //       eBayAuthToken: token.dataValues.token,
    //     },
    //   });
    //   await apiCallLog("GetTokenStatus","/messages/send-message",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, {}, 'success');
    // } catch (err) {
    //   await apiCallLog("GetTokenStatus","/messages/send-message",functionName,{ RequesterCredentials: { eBayAuthToken: token.dataValues.token } },{}, err.meta, 'error');

    //   await refreshToken(eBay, token);
    // }

    const data = await eBay.trading.AddMemberMessageAAQToPartner({
      ItemID: itemId,
      MemberMessage: {
        Body: body,
        Subject: `${accountName} has sent a message.`,
        QuestionType: "CustomizedSubject",
        RecipientID: receipientId,
      },
    });
    await apiCallLog("AddMemberMessageAAQToPartner", "/messages/send-message", functionName, {
      ItemID: itemId,
      MemberMessage: {
        Body: body,
        Subject: `${accountName} has sent a message.`,
        QuestionType: "CustomizedSubject",
        RecipientID: receipientId,
      },
    }, data, {}, 'success');

    parentMessage.replied = true;
    parentMessage.reply = body;
    parentMessage.reply_date = moment().toISOString();

    await parentMessage.save();

    return res.status(200).json({
      success: true,
      message: "Message sent.",
      data,
      reply: body,
    });
  } catch (error) {
    await apiCallLog("AddMemberMessageAAQToPartner", "/messages/send-message", functionName, {
      StartTime: startDate,
      EndTime: endDate,
      DetailLevel: "ReturnHeaders",
    }, {}, error.meta, 'error');
    newRelic.recordCustomEvent(`Message Sending Error`, error);
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.GetAllBuyerList = async (req, res) => {
  try {
    const { userId, accountName, senderId } = req.query;

    let data = await messages.findAll({
      where: {
        userId: userId,
        accountName: accountName,
        sender: { [Op.iLike]: `%${senderId}%` },
      },
      group: ["sender"],
      attributes: ["sender"],
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Message Sending Error`, error);
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.UpdateMessageStatus = async (req, res) => {
  try {
    const { sender, accountName, userId, read, messageId } = req.body;

    if (typeof read !== "boolean" || !messageId) {
      return res.status(400).json({
        success: false,
        message: "Invalid read status or message id",
      });
    }

    const whereClause = { read: false, messageId: messageId };

    if (userId) {
      whereClause.userId = userId;
    }
    if (sender) {
      whereClause.sender = sender;
    }
    if (accountName) {
      whereClause.accountName = accountName;
    }

    const message = await messages.findOne({ where: whereClause });

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message not found",
      });
    } else {
      const accountName = message.dataValues.accountName;
      const userId = message.dataValues.userId;

      let marketPlace = "";
      if (accountName && userId) {
        const account = await Tokens.findOne({ where: { accountName: accountName, userId: userId } });

        if (account) {
          marketPlace = await Marketplace.findOne({ where: { id: account.dataValues.marketPlaceId } });
        }

      }

      if (marketPlace && marketPlace.url?.includes("ebay")) {
        await UpdateEbayMessageStatus([messageId], read);
        await apiCallLog("ReviseMyMessages", "/messages/update-message-status", functionName, { MessageIDs: [messageId], Read: read }, { message: "Status updated in ebay" }, {}, 'success');
      }

    }

    await messages.update({ read: read }, { where: whereClause });

    return res.status(200).json({
      success: true,
      message: `message(s) successfully updated`,
    });
  } catch (error) {
    newRelic.recordCustomEvent(`Message Status Update Error`, error);
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.SendAlertToUser = async (req, res) => {
  try {

    const { userId, accountName } = req.body;

    if (!userId || !accountName) {
      return res.status(400).json({
        success: false,
        message: "Invalid input: userId or accountName is missing",
      });
    }

    const accountExists = await Tokens.findOne({ where: { userId, accountName } });

    if (!accountExists) {
      return res.status(400).json({
        success: false,
        message: "Account not found",
      });
    }

    const twoDaysAgo = moment().subtract(2, "days");

    const unreadMessages = await messages.findAll(
      {
        where:
        {
          userId,
          accountName,
          read: false,
          createdAt: {
            [Op.gte]: twoDaysAgo.startOf("day").toISOString(),
            [Op.lte]: twoDaysAgo.endOf("day").toISOString(),
          }
        }
      });

    if (unreadMessages.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No unread messages in the last 2 days",
      });
    } else {

      await sendMailUsingNodemailer(userId, "Unread Messages Alert", `You have ${unreadMessages.length} unread messages in your account ${accountName}. Please login to your account and check the messages.`);

      await apiCallLog("SendAlertToUser", "/messages/send-alert", functionName, { userId, accountName }, { message: "Alert sent to user" }, {}, 'success');

    }

  } catch (err) {
    newRelic.recordCustomEvent(`message_markeplace`, err);
    await apiCallLog("SendAlertToUser", "/messages/send-alert", functionName, req.body ?? {}, {}, err, 'error');
    console.log(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}