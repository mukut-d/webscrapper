const ebay = require("ebay-api");
const EBayAuthToken = require("ebay-oauth-nodejs-client");
const newRelic = require("newrelic");
const Tokens = require("../../models/tokens");
const Marketplace = require("../../models/marketplace");
const moment = require("moment");
const { MessageLog } = require("../../models/messageLog");
const cheerio = require("cheerio");
const { emailTemplate } = require("../../models/emailTemplate");
const { messages } = require("../../models/messages");
const { Op, Sequelize } = require("sequelize");
const axios = require("axios");
const { UserType } = require("../../utils/enum");
const { apiCallLog } = require("../../helper/apiCallLog");
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

exports.UpdateEbayMessageStatus = async (messageIds = [], read = false, token) => {
	try {

		if (messageIds.length === 0 || !token || !token.token || read == null) {
			throw new Error("Invalid input: messageId, token or read status is missing");
		}

		const eBay = new ebay({
			clientID: process.env.APP_ID,
			clientSecret: process.env.CERT_ID,
			ruName: process.env.RUNAME,
			sandbox: false,
			authToken: token.token,
		});

		const startDate = moment().add(5, "hours").add(30, "minutes");
		const lastTokenRefreshDate = moment(token.lastTokenRefreshDate);
		const diff = startDate.diff(lastTokenRefreshDate, "hours");

		if (diff >= 2) {
			await refreshToken(eBay, token);
		}

		const response = await eBay.ReviseMyMessages({
			"MessageIDs": [
				{
					"MeesageId": messageIds
				}
			],
			"Read": read
		});

	} catch (err) {
		console.log(err);
		await apiCallLog("ReviseMyMessages", "UpdateEbayMessageStatus", "UpdateEbayMessageStatus", { messageIds, read }, {}, err, "error");
		newRelic.recordCustomEvent(`message_markeplace`, { error: err.message });
		throw err;
	}
}