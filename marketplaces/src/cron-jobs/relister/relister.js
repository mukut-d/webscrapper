const cskus = require('../../models/csku');
const Tokens = require('../../models/tokens');
const moment = require('moment');
const fs = require('fs');

// const logFile = JSON.parse(fs.readFileSync('./src/cron-jobs/relister/log.json', 'utf8'));

const eBay = require('../../helper/ebayInstance');
const { refreshTokenEbay } = require('../../helper/refreshToken');
const { apiCallLog } = require('../../helper/apiCallLog');
const { GetItemEbay, RelistEbayItem } = require('../../marketplaceapis/ebay/catalogue');

function appendToFile(filename, data) {

	return new Promise((resolve, reject) => {
		// Read the file
		require("fs").readFile(filename, 'utf8', (err, fileData) => {
			if (err) throw err;

			// Parse the JSON data
			let arr = JSON.parse(fileData);

			// Append the data
			arr.push(data);

			// Write the updated array back to the file
			require("fs").writeFile(filename, JSON.stringify(arr, null, 2), 'utf8', (err) => {
				if (err) throw err;
				else resolve();
			});
		});
	});

};

exports.RelistEbayItem = async (req, res) => {

	try {

		const {
			itemIds,
			userId,
			accountName
		} = req.body;

		const token = await Tokens.findOne({
			where: {
				userId: userId,
				accountName: accountName,
				marketPlaceId: 7,
			},
		});

		if (!token) {
			throw new Error(`eBay token not found for user ${userId} and account ${accountName}`);
		}

		eBay.OAuth2.setCredentials(token.dataValues.token);

		const startDate = moment();
		const lastTokenRefreshDate = moment(token.lastTokenRefreshDate);
		const diff = startDate.diff(lastTokenRefreshDate, 'hours');

		if (diff >= 2) {
			await refreshTokenEbay(eBay, token);
		}

		let successCount = 0;
		let errorCount = 0;

		for (const itemId of itemIds) {
			try {
				const itemDetail = await GetItemEbay(eBay, itemId);

				if (!itemDetail || !itemDetail.Item) {
					console.warn(`Item detail not found for itemId ${itemId}`);
					await apiCallLog("RelistEbayItem", "GetItem", "GetItem", { itemId }, {}, { error: 'Item detail not found' }, "error");
					continue;
				}
				console.log(itemDetail);
				if (itemDetail.Item.SellingStatus.ListingStatus == 'Completed' && itemDetail.Item.ListingDetails.EndingReason === 'CustomCode') {
					const relistResponse = await RelistEbayItem(eBay, itemId);

					if (relistResponse && relistResponse.ItemID) {
						console.log(`Item ${itemId} relisted successfully as ${relistResponse.ItemID}`);

						successCount++;

						appendToFile("./src/cron-jobs/relister/log.json", {
							oldId: itemId,
							newId: relistResponse.ItemID,
							status: 'success',
						});

						await cskus.update({
							channelId: relistResponse.ItemID,
							status: 'live',
						},
							{
								where: {
									userId: userId,
									channelId: itemId,
								},
							})

						await apiCallLog("RelistEbayItem", "RelistItem", "RelistItem", { itemId }, { relistResponse }, {}, "success");
					} else {
						console.warn(`Failed to relist item ${itemId}`);
						await apiCallLog("RelistEbayItem", "RelistItem", "RelistItem", { itemId }, {}, { error: 'Failed to relist item' }, "error");
					}
				} else {
					console.log(`Item ${itemId} does not have EndingReason as CustomCode, skipping...`);
				}
			} catch (err) {
				errorCount++;
				appendToFile("./src/cron-jobs/relister/log.json", {
					oldId: itemId,
					newId: "",
					status: 'error',
				});
				console.error(`Error processing item ${itemId}:`, err.message);
				await apiCallLog("RelistEbayItem", "GetItem", "GetItem", { itemId }, {}, { error: err.message }, "error");
			}
		}

		return res.status(200).json({ successCount, errorCount });

	} catch (err) {
		console.error('Error in RelistEbayItem:', err.message);
		await apiCallLog("RelistEbayItem", "RelistEbayItem", "RelistEbayItem", { request: req.body }, {}, { error: err.message }, "error");
		return res.status(500).json({ message: 'Internal server error' });
	}

}