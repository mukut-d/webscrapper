const { v4: uuidv4 } = require("uuid");
const User = require("../../models/user");
const axios = require("axios");
const Tokens = require("../../models/tokens");
const newRelic = require("newrelic");
const CskuRepository = require("../../models/csku");
const Marketplace = require("../../models/marketplace");
const Template = require("../../models/template");
const Bull = require("bull");
const ebay = require("ebay-api");
const { OpenAI } = require("openai");
const csku = require("../../models/csku");
const { Op, Sequelize, json, where } = require("sequelize");
const catalogueConfig = require("../../models/catalogue-config");
const Currency = require("../../models/currency");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const mathjs = require("mathjs");
const ShippingPolicyModel = require("../../models/shippingPolicies");
const ReturnPolicyModel = require("../../models/returnPolicy");
const PaymentPolicyModel = require("../../models/paymentPolicy");
const StoreCategory = require("../../models/shopCategories");
const CatalogueVariation = require("../../models/catalogue-variation");
const fs = require("fs");
const path = require("path");
const { GetItemEbay } = require("../../marketplaceapis/ebay/catalogue");
const { getEtsyItem, convertToDBFormat, getEtsyItemBulk } = require("../../marketplaceapis/etsy/catalogue");
const { refreshTokenEbay } = require("../../helper/refreshToken");
const { FetchShopifyProducts, GetShopifyProduct, updateShopifyCatalogue, updateMetaFields, deleteVariant, setShopifyInventory, bulkInventoryAdjustments } = require("../../marketplaceapis/shopify/catalogue");
const { apiCallLog } = require("../../helper/apiCallLog");
const _ = require("lodash");
const nodemailer = require("nodemailer");
const { ConvertJSONToCSV } = require("../../helper/convertJSONToCSV");
const ejs = require("ejs");
const moment = require("moment");
const { sequelize } = require("../../database/config");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const updateConfigQueue = new Bull("updateConfigQueue", {
	redis: {
		host: "localhost",
		port: 6379,
	},
});

const openai = new OpenAI({
	apiKey: process.env.OPEN_AI_KEY,
	project: process.env.OPENAI_API_PROJECT_ID,
});

updateConfigQueue.process(async (job) => {
	const { configId, batch } = job.data;
	console.log("Job Data >> ", job.data);
	console.log("Job Id >> ", job.id);

	await this.UpdateQueueListener(configId, batch);
	await job.remove();
});


exports.UpdateQueueListener = async (configId, batch) => {
	try {

		if (configId == null) {
			throw new Error("configId is null");
		}
		const config = await catalogueConfig.findOne({
			where: {
				id: configId,
			},
			raw: true,
		});

		if (!config) {
			throw new Error("config not found");
		}

		console.log("Config >> ", config.config);
		// Add your code here

		if (!config.config) {
			throw new Error("config is not present");
		}

		const source_account_id = config?.config?.sourceAccount;

		if (!source_account_id) {
			throw new Error("source_account_id not found");
		}

		const source_account = await Tokens.findOne({
			where: {
				id: source_account_id,
			},
		});

		if (!source_account) {
			throw new Error("source_account not found");
		}
		console.log("Source Account >> ", source_account);
		const source_marketplace = await Marketplace.findOne({
			where: {
				id: source_account?.marketPlaceId,
			},
		});

		if (!source_marketplace) {
			throw new Error("source_marketplace not found");
		}

		const destination_account_id = config?.config?.destinationAccount;

		if (!destination_account_id) {
			throw new Error("destination_account_id not found");
		}

		const destination_account = await Tokens.findOne({
			where: {
				id: destination_account_id,
			},
		});

		if (!destination_account || !destination_account?.dataValues) {
			throw new Error("destination_account not found");
		}

		const destination_marketplace = await Marketplace.findOne({
			where: {
				id: destination_account?.marketPlaceId,
			},
		});

		if (!destination_marketplace) {
			throw new Error("destination_marketplace not found");
		}

		const whereQuery = {
			accountName: destination_account.accountName,
			userId: destination_account.userId,
			status: {
				[Op.in]: ["live", "active"]
			},
			// channelId: {
			// 	[Op.in]: [
			// 		'8775712735491', '8775489519875'
			// 		// "8774649479427",
			// 		// "8774670057731", "8774688342275", "8775484211459", 
			// 		// "8774609862915", "8774612222211", "8774610157827", "8775696810243"
			// 	],
			// }
		};

		const destination_site_id = config.destinationSiteId;

		if (destination_site_id) {
			whereQuery.siteId = destination_site_id;
		}

		const destinationData = await csku.findAll({
			where: whereQuery,
			// limit: 10,
		});

		if (!destinationData || !Array.isArray(destinationData) || destinationData.length === 0) {
			throw new Error("destinationData not found");
		}

		const destinationIskus = destinationData.map(item => item.dataValues.isku).filter((item, index, arr) => arr.indexOf(item) === index);

		const sourceQuery = {
			accountName: source_account.accountName,
			userId: source_account.userId,
			isku: {
				[Op.in]: destinationIskus,
			},
			status: {
				[Op.in]: ["live", "active"]
			}
		}

		const andQuery = [sourceQuery];

		let query = "";
		if (config.source_data_filter) {
			query = sequelize.literal(config.source_data_filter);
			andQuery.push(query);
		}

		const sourceData = await csku.findAll({
			where: {
				[Op.and]: andQuery
			},
			// limit: 1,
		});

		console.log("Source Data >> ", sourceData.length);

		if (!sourceData || !Array.isArray(sourceData) || sourceData.length === 0) {
			throw new Error("sourceData not found");
		}
		console.log("Config >> ", config.config);
		const fieldsToUpdate = config?.updateFields;

		if (!fieldsToUpdate || !Array.isArray(fieldsToUpdate) || fieldsToUpdate.length === 0) {
			throw new Error("fieldsToUpdate not found");
		}
		console.log(destinationData.length, "Destination Data Length >> ", destinationData.length);

		const finalCronStatus = [];
		const errorLogArray = [];

		const batchSize = 100;
		let start = 0;
		while (start < destinationData.length) {


			const destinationBatch = destinationData.slice(start, start + batchSize);
			const iskuBatch = destinationBatch.map(itm => itm.isku)
			// console.log(destinationBatch);
			const sourceDataBatch = sourceData.filter(itm => iskuBatch.includes(itm.isku)).map(itm => itm.channelId);

			const results = await fetchFromSource("", sourceDataBatch, source_marketplace, source_account);

			if (!results || results.length == 0) {
				await apiCallLog(
					"updateConfigQueue",
					"updateConfigQueue",
					"updateConfigQueue",
					config,
					{},
					"results not found",
					"error"
				);

				finalCronStatus.push({
					id: iskuBatch.join(","),
					status: "error",
					message: "sourceItem not found",
				});

				start += batchSize;

				continue;
			}

			// console.log(results.length, "typeof results");

			for (let i = 0; i < destinationBatch.length; i++) {
				const destItem = destinationBatch[i];

				console.log(destItem, "destItem", i);

				const sourceItem = await CskuRepository.findOne({
					where: {
						isku: destItem.isku,
						accountName: source_account.accountName,
						userId: source_account.userId,
						status: {
							[Op.in]: ["live", "active"]
						}
					},
				});

				if (!sourceItem) {
					await apiCallLog(
						"updateConfigQueue",
						"updateConfigQueue",
						"updateConfigQueue",
						config,
						{},
						"sourceItem not found",
						"error"
					);

					finalCronStatus.push({
						id: destItem.dataValues.id,
						status: "error",
						message: "sourceItem not found",
					});

					continue;
				}
				// console.log(sourceItem, "sourceIte,")
				const channelId = sourceItem?.dataValues.channelId;

				if (source_marketplace.dataValues.url.includes("ebay")) {

					const eBay = new ebay({
						appId: process.env.appId,
						devId: process.env.devId,
						certId: process.env.certId,
						sandbox: false,
						authToken: source_account.token,
					});

					const token = await refreshTokenEbay(eBay, source_account.dataValues);

					source_account.dataValues.token = token;

				}

				const updatedSourceItem = results.filter(item => item.channelId == channelId);

				console.log("Updated Source Item >> ", updatedSourceItem);
				if (!updatedSourceItem || !Array.isArray(updatedSourceItem) || updatedSourceItem.length === 0) {
					await apiCallLog(
						"updateConfigQueue",
						"updateConfigQueue",
						"updateConfigQueue",
						config,
						{},
						"updatedSourceItem not found",
						"error"
					);

					finalCronStatus.push({
						id: destItem.dataValues.id,
						status: "error",
						message: "updatedSourceItem not found",
					});

					continue;

				}

				const sourceVariations = await CatalogueVariation.findAll({
					where: {
						channel_id: sourceItem.channelId,
						account_name: source_account.accountName,
						userId: source_account.userId,
					},
				});

				if (!sourceVariations || !Array.isArray(sourceVariations)) {
					await apiCallLog(
						"updateConfigQueue",
						"updateConfigQueue",
						"updateConfigQueue",
						config,
						{},
						"sourceVariations not found",
						"error"
					);

					finalCronStatus.push({
						id: destItem.dataValues.id,
						status: "error",
						message: "sourceVariations not found",
					});

					continue;
				}

				const oldSourceItem = {
					...sourceItem.dataValues,
					variation: sourceVariations?.map(item => item.dataValues.variation),
				}

				const changedFields = getChangedFields(oldSourceItem, updatedSourceItem[0]);
				// console.log("changedFields", changedFields)
				let changeDetected = false;
				if (changedFields.length > 0) {
					changedFields.forEach(field => {
						if (fieldsToUpdate.includes(field)) {
							changeDetected = true;
						}
					});
				}

				if (changeDetected && destination_marketplace.dataValues.url.includes("shopify")) {

					if (config.config.title && config.config.title.useAIGenerated == true) {

						let idText = `Generate a title for the product from the title: ${updatedSourceItem.title}.`;
						let prResponse = "";

						let promptConfig = {
							method: "get",
							maxBodyLength: Infinity,
							url: "http://localhost:5001/prompts/get-prompt-logic",
							headers: {
								"Content-Type": "application/json",
							},
							params: {
								userId: destination_account?.dataValues?.userId ?? "",
								categoryTreeId: "",
								categoryId: "",
								marketplaceId: destination_account?.dataValues?.marketPlaceId ?? "",
							},
						};

						try {

							prResponse = await axios
								.request(promptConfig);

						} catch (err) {
							console.log("Error in AI title generation", err);
							await apiCallLog(
								"updateConfigQueue",
								"updateConfigQueue",
								"updateConfigQueue",
								config,
								{},
								"Error in AI title generation",
								"error"
							);
						}

						if (prResponse && prResponse.data) {

							idText += ` ${prResponse.data}`;

							const openai = new OpenAI({
								apiKey: process.env.OPEN_AI_KEY,
								project: process.env.OPENAI_API_PROJECT_ID,
							});

							const response = await openai.chat.completions.create({
								model: "gpt-3.5-turbo",
								messages: [
									{
										role: "user",
										content: idText,
									},
								],
							});

							const title = response.choices[0].message.content;
							updatedSourceItem.title = title;

						} else {
							await apiCallLog(
								"updateConfigQueue",
								"updateConfigQueue",
								"updateConfigQueue",
								config,
								{},
								"Prompt not found",
								"error"
							);

							finalCronStatus.push({
								id: destItem.dataValues.id,
								status: "error",
								message: "Prompt not found",
							});

							continue;
						}

					}

					if (config.config.aPlusDescriptionTemplate) {

						const aPlusDescriptionTemplate = await Template.findOne({
							where: {
								id: config.config.aPlusDescriptionTemplate,
							},
						});

						if (aPlusDescriptionTemplate) {

							const ejsKyes = aPlusDescriptionTemplate.dataValues.ejsKeys;

							const ejsData = {};

							for (const key of ejsKyes) {
								ejsData[key] = updatedSourceItem[0][key];
							}

							const description = await ejs.render(
								aPlusDescriptionTemplate.dataValues.template,
								{
									ejsData,
								}
							);

							updatedSourceItem[0].description = description;
						} else {
							await apiCallLog(
								"updateConfigQueue",
								"updateConfigQueue",
								"updateConfigQueue",
								config,
								{},
								"Template not found",
								"error"
							);

							finalCronStatus.push({
								id: destItem.dataValues.id,
								status: "error",
								message: "Template not found",
							});

							continue;
						}

					}

					const actualDescription = updatedSourceItem[0].description;

					const extraMetafields = []
					if (config.config.extractKeywords && config.config.extractKeywords.keysToExtract && config.config.extractKeywords.keysToExtract.length > 0) {

						if (config.config.extractKeywords.type == "function") {
							console.log(config.config.extractKeywords.functionString)
							const extractMaterials = new Function("input", config.config.extractKeywords.functionString);

							const extractedData = await extractMaterials(updatedSourceItem[0].description);
							console.log(extractedData, "extractedData");
							if (extractedData) {
								Object.keys(extractedData).map(itm => {
									if (updatedSourceItem[0]?.[itm]) {
										updatedSourceItem[0][itm] = extractedData[itm];
									} else {
										extraMetafields.push({
											key: itm,
											value: extractedData[itm],
											namespace: "custom"
										});
									}
								})
							}

						}

					}

					try {

						updatedSourceItem[0].description = updatedSourceItem[0].description.replaceAll("\n", "<br/>");

						const shopifyVariants = await convertEtsyVariantsToShopify(updatedSourceItem[0].variation, sourceVariations);

						const { success, product } = await updateShopifyCatalogue(
							destination_account,
							destItem.dataValues.channelId,
							updatedSourceItem[0],
							[],
							shopifyVariants.variants,
							shopifyVariants.options,
							""
						);
						// console.log("Success >> ", success, product);

						// fs.writeFileSync(path.join(__dirname, "product.json"), JSON.stringify(product, null, 2));
						// fs.writeFileSync(path.join(__dirname, "updatedSourceItem.json"), JSON.stringify(updatedSourceItem, null, 2));

						if (product && product.variants && product.variants.length > 1) {
							try {

								const adjustments = await buildInventoryAdjustments(destination_account.dataValues.accountName, destination_account.dataValues.token, destItem.dataValues.channelId, shopifyVariants.variants);
	
								const updateResponse  = await bulkInventoryAdjustments(destination_account.dataValues.accountName, destination_account.dataValues.token, adjustments);
	
								if (!updateResponse) {
									await apiCallLog(
										"updateConfigQueue",
										"updateConfigQueue",
										"updateConfigQueue",
										config,
										{},
										"Error in bulkInventoryAdjustments",
										"error"
									);
	
									finalCronStatus.push({
										id: destItem.dataValues.id,
										status: "error",
										message: "Error in bulkInventoryAdjustments",
									});
	
									continue;
								}
							} catch (err) {
								console.error("Error in bulkInventoryAdjustments", err);
								await apiCallLog(
									"updateConfigQueue",
									"updateConfigQueue",
									"updateConfigQueue",
									config,
									{},
									{ error: err.message },
									"error"
								);

								finalCronStatus.push({
									id: destItem.dataValues.id,
									status: "error",
									message: err.message,
								});
							}

						} else if (product && product.variants && product.variants.length === 1) {
							const variantId = product.variants[0].title;
							const inventory_item_id = product.variants[0].inventory_item_id;
							const quantity = updatedSourceItem[0].quantity;

							// console.log("variantId", variantId, "inventory_item_id", inventory_item_id, "quantity", quantity);

							await delay(1000); // Wait for 1 second before the next request
							await setShopifyInventory(destination_account, inventory_item_id, quantity);
						}

						await CskuRepository.update(
							{
								status: "active",
								title: updatedSourceItem[0].title,
								description: updatedSourceItem[0].description,
								images: updatedSourceItem[0].images,
							},
							{
								where: {
									id: destItem.dataValues.id,
								}
							}
						);

						await CskuRepository.update(
							{
								quantity: updatedSourceItem[0].quantity,
								price: updatedSourceItem[0].price,
								title: updatedSourceItem[0].title,
								description: actualDescription,
								images: updatedSourceItem[0].images,
								itemSpecifics: updatedSourceItem[0].itemSpecifics,
							},
							{
								where: {
									id: sourceItem.dataValues.id,
								}
							}
						);

						await CatalogueVariation.destroy({
							where: {
								channel_id: destItem.dataValues.channelId,
								account_name: destination_account.accountName,
								userId: destination_account.userId,
							}
						});

						await CatalogueVariation.destroy({
							where: {
								channel_id: sourceItem.dataValues.channelId,
								account_name: source_account.accountName,
								userId: source_account.userId,
							}
						});

						await CatalogueVariation.bulkCreate(
							updatedSourceItem[0].variation.map((item) => {
								return {
									channel_id: sourceItem.dataValues.channelId,
									account_name: source_account.accountName,
									userId: source_account.userId,
									variation_id: item.variation_id,
									quantity: item.quantity,
									price: item.price,
									variation: item.variation,
									marketplace_id: source_marketplace.dataValues.id,
									transformed_variation: item.transformed_variation
								};
							}
							));

						await CatalogueVariation.bulkCreate(
							product?.variants?.map((item) => {
								return {
									channel_id: destItem.dataValues.channelId,
									account_name: destination_account.accountName,
									userId: destination_account.userId,
									variation_id: item.id,
									quantity: item.inventory_quantity,
									price: item.price,
									variation: item,
									marketplace_id: destination_marketplace.dataValues.id,
								};
							}
							));

						try {

							if (updatedSourceItem?.[0]?.itemSpecifics?.[0]?.itemSpecificsEtsy) {
								const shopifyMetaFieldsArray = updatedSourceItem[0].itemSpecifics?.[0].itemSpecificsEtsy?.map((itm) => {
									const key = Object.keys(itm)[0];
									const value = itm[key];
									return {
										namespace: "global",
										key: key,
										value: value,
										"type": "single_line_text_field"
									}
								}
								);

								if (extraMetafields && extraMetafields.length > 0) {
									shopifyMetaFieldsArray.push(...extraMetafields);
								}

								await updateMetaFields(
									destination_account,
									destItem.dataValues.channelId,
									shopifyMetaFieldsArray || [],
								)
							}

							finalCronStatus.push({
								id: destItem.dataValues.id,
								status: "success",
								message: "Product Updated successfully",
							});

						} catch (err) {
							console.log("Error in updateMetaFields", err);
							await apiCallLog(
								"updateConfigQueue",
								"updateConfigQueue",
								"updateConfigQueue",
								config,
								{},
								{ error: err.message },
								"error"
							);

							finalCronStatus.push({
								id: destItem.dataValues.id,
								status: "error",
								message: err.message,
							});
						}


					} catch (err) {
						console.error("Error in updateShopifyCatalogue", err);
						await apiCallLog(
							"updateConfigQueue",
							"updateConfigQueue",
							"updateConfigQueue",
							config,
							{},
							{ error: err.message },
							"error"
						);

						finalCronStatus.push({
							id: destItem.dataValues.id,
							status: "error",
							message: err.message,
						});

					}

				} else if (changeDetected && destination_marketplace.dataValues.url.includes("ebay")) {
					const now = moment();
					const variation = sourceVariations[0]?.transformed_variation;
					console.log(variation, "variation ------------------");
					const reviseItemBody = {
						Item: {
							ItemID: destItem?.channelId,
						},
					};
					const categoryId = destItem.categoryId;

					try {
						const eBay = new ebay({
							appId: process.env.APP_ID,
							devId: process.env.DEV_ID,
							certId: process.env.CERT_ID,
							sandbox: false,
						});

						try {
							if (
								!destination_account.dataValues.lastTokenRefreshDate ||
								now.diff(destination_account.dataValues.lastTokenRefreshDate, "hours") >= 2
							) {
								const refreshedToken = await refreshTokenEbay(eBay, destination_account);
								eBay.OAuth2.setCredentials(refreshedToken);
							} else {
								eBay.OAuth2.setCredentials(destination_account.dataValues.token);
							}
						} catch (error) {
							errorLogArray.push({
								channelId: destItem.channelId,
								SKU: destItem.isku,
								Error: `Error refreshing token: ${error.message}`,
							});
							throw error;
						}

						let title = updatedSourceItem[0].title;
						const titleConfig = config?.config?.title;

						if (titleConfig.useAIGenerated) {
							let titlePrompt = `Generate a title for the product from the title: ${title}.`;

							let promptConfig = {
								method: "get",
								maxBodyLength: Infinity,
								url: "http://localhost:5001/prompts/get-prompt-logic",
								headers: {
									"Content-Type": "application/json",
								},
								params: {
									userId: destination_account?.userId ?? "",
									categoryTreeId: config?.config?.categoryTreeId ?? "",
									categoryId: categoryId ?? "",
									marketplaceId: destination_account?.marketPlaceId ?? "",
								},
							};

							let prResponse;
							const idText = `Title :${updatedSourceItem[0].title} Description : ${updatedSourceItem[0].description} Product Features : ${JSON.stringify(updatedSourceItem[0].itemSpecifics)}`;
							try {
								prResponse = await axios.request(promptConfig);
							} catch (error) {
								errorLogArray.push({
									channelId: destItem.channelId,
									SKU: destItem.isku,
									Error: `Error in get-prompts-logic: ${error.message}`,
								});
								throw error;
							}

							if (prResponse?.data) {
								titlePrompt += prResponse.data.prompt.prompt;
							}

							try {
								do {
									const completion = await openai.chat.completions.create({
										messages: [
											{
												role: "system",
												content:
													"You are an expert product title generator who generates one title of length 75 characters strictly. Please strictly do not go above 80 characters",
											},
											{
												role: "user",
												content: `${idText} ${titlePrompt}`,
											},
										],
										model: "gpt-4o",
									});

									title = completion.choices[0].message.content;
								} while (title.length > 80);
								reviseItemBody.Item.Title = title;
							} catch (error) {
								errorLogArray.push({
									channelId: destItem.channelId,
									SKU: destItem.isku,
									Error: `Error generating AI title: ${error.message}`,
								});
								throw error;
							}
						} else {
							title = updatedSourceItem[0].title;
							reviseItemBody.Item.Title = title;
						}

						let aspects = {};
						try {
							const idText = `Title :${updatedSourceItem[0].title} Description : ${updatedSourceItem[0].description} Product Features : ${JSON.stringify(updatedSourceItem[0].itemSpecifics)}`;
							const aspectData = await generateItemSpecifics(
								idText,
								categoryId,
								"",
								destination_marketplace.dataValues.siteId,
								destination_account,
								config,
								destination_marketplace,
								eBay
							);
							console.log(aspectData, "aspectData ------------------");
							// return

							if (aspectData) {
								if (config?.config?.brand?.useStoreName) {
									aspectData["Brand"] =
										config.additional_aspects.keyvaluepairs.find(
											(item) => item.fieldname === "Brand"
										).acceptedValues[0];
								}

								aspects = aspectData;

								reviseItemBody.Item.ItemSpecifics = {
									NameValueList: [],
								};

								// Normalize keys for comparison
								Object.entries(aspectData).forEach(([key, value]) => {
									const normalizedKey = key.toLowerCase();
									const variationKeys = Object.keys(variation || {}).map(k => k.toLowerCase());

									if (!variationKeys.includes(normalizedKey)) {
										reviseItemBody.Item.ItemSpecifics.NameValueList.push({
											Name: key,
											Value: value,
										});
									} else {
										delete aspects[key];
									}
								});

								console.log(aspects, "aspects ------------------");
								console.log(JSON.stringify(reviseItemBody.Item.ItemSpecifics), "reviseItemBody.Item.ItemSpecifics ------------------");
								// return
							}
						} catch (error) {
							errorLogArray.push({
								channelId: destItem.channelId,
								SKU: destItem.isku,
								Error: `Error generating item specifics: ${error.message}`,
							});
							throw error;
						}

						let description;
						try {
							description = updatedSourceItem[0].description;
							if (config?.config?.useSourceAccountDescription) {
								description = updatedSourceItem[0]?.description
									.replace(/[^\r\n\x20-\x7E]+/g, "")
									.replace(/\r?\n/g, "<br/>");
								reviseItemBody.Item.Description = description;
							} else {
								description = updatedSourceItem[0]?.description
									.replace(/[^\r\n\x20-\x7E]+/g, "")
									.replace(/\r?\n/g, "<br/>");
								const descTemplate = await Template.findOne({
									where: {
										template_name: config?.config?.aPlusDescriptionTemplate,
									},
								});

								if (config?.description_update) {
									config.description_update.forEach(({ pattern, replaceWith }) => {
										try {
											const regex = new RegExp(pattern, "g");
											description = description.replace(regex, replaceWith);
										} catch (error) {
											console.error(`Invalid regex pattern: ${pattern}`, error);
										}
									});
								}

								const ejsData = {};
								if (
									descTemplate?.dataValues?.ejsKeys &&
									descTemplate?.dataValues?.ejsKeys.length > 0
								) {
									descTemplate?.dataValues?.ejsKeys.forEach((key) => {
										switch (key) {
											case "title":
												ejsData["title"] = title;
												break;
											case "description":
												ejsData["description"] = description;
												break;
											case "specifications":
												ejsData["specifications"] = Object.entries(aspects).map(
													([key, value]) => ({
														key,
														value: value,
													})
												);
												break;
											case "images":
												ejsData["images"] = updatedSourceItem[0].images.slice(0, 5);
												break;
											default:
												break;
										}
									});

									description = await ejs.render(
										descTemplate.dataValues.ejs,
										ejsData
									);
								}
								reviseItemBody.Item.Description = description;
							}
						} catch (error) {
							errorLogArray.push({
								channelId: destItem.channelId,
								SKU: destItem.isku,
								Error: `Error generating description: ${error.message}`,
							});
							throw error;
						}

						reviseItemBody.Item.PictureDetails = {
							GalleryType: "Gallery",
							PictureURL: updatedSourceItem[0].images,
						};

						if (Object.keys(reviseItemBody.Item).length > 1) {
							try {
								const reviseItem = await eBay.trading.ReviseFixedPriceItem(
									reviseItemBody
								);
								console.log(
									`Item updated for SKU ${destItem.channelId}:`,
									reviseItem
								);

								await apiCallLog(
									"updateConfigQueue",
									"eBay",
									"updateItem",
									{ ItemID: destItem.channelId },
									reviseItemBody,
									reviseItem,
									"success"
								);
								errorLogArray.push({
									channelId: destItem.channelId,
									SKU: destItem.isku,
									Error: `Item updated successfully`,
								});

								await csku.update(
									{
										status: "live",
										title: title,
										description: description,
										images: updatedSourceItem[0].images,
									},
									{
										where: {
											id: destItem.dataValues.id,
										},
									}
								);
							} catch (error) {
								errorLogArray.push({
									channelId: destItem.channelId,
									SKU: destItem.isku,
									Error: `Error updating item: ${error.meta.message || error.message}`,
								});
								console.log(error.meta)
								await apiCallLog(
									"updateConfigQueue",
									"eBay",
									"updateItem",
									{ ItemID: destItem.channelId },
									reviseItemBody,
									error.meta,
									"error"
								);
								continue
							}
						}
					} catch (error) {
						errorLogArray.push({
							channelId: destItem.channelId,
							SKU: destItem.isku,
							Error: `General error: ${error.message}`,
						});
						console.error("Error in eBay update process:", error);
					}
				}

			}
			start += batchSize;
		}


		if (finalCronStatus.length > 0) {

			const csvData = await ConvertJSONToCSV(finalCronStatus);

			const fileName = `updateConfigCronStatus-${uuidv4()}.csv`;

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

			// Set up email data
			let mailOptions = {
				from: process.env.FROM_EMAIL, // Replace with your email
				to: "akhlaq@mergekart.com",
				cc: 'aditya@mergekart.com',
				subject: "Update Config Cron Status",
				text: `Update Config Cron Status`,
				attachments: [
					{
						filename: fileName,
						content: csvData,
					},
				],
			};

			await transporter.sendMail(mailOptions, async function (error, info) {
				if (error) {
					console.log(error);
					await apiCallLog(
						"updateConfigCron",
						"updateConfigCron",
						"updateConfigCron",
						config,
						{},
						{ error: error.message },
						"error"
					);
				} else {
					console.log('Email sent: ' + info.response);
				}
			});

		}

	} catch (err) {
		console.log("Error in UpdateQueueListener", err);
		await apiCallLog(
			"updateConfigQueue",
			"updateConfigQueue",
			"updateConfigQueue",
			{ configId },
			{},
			{ error: err.message },
			"error"
		);

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

		// Set up email data
		let mailOptions = {
			from: process.env.FROM_EMAIL, // Replace with your email
			to: "aditya@mergekart.com, akhlaq@mergekart.com", // Replace with the receiver's email
			subject: "URGENT!! Error in updateConfigCron",
			text: `Error in updateConfigCron: ${err.message}. For configId: ${configId}`,
		};

		await transporter.sendMail(mailOptions, async function (error, info) {
			if (error) {
				console.log(error);
				await apiCallLog(
					"updateConfigCron",
					"updateConfigCron",
					"updateConfigCron",
					{},
					{},
					{ error: error.message },
					"error"
				);
			} else {
				console.log('Email sent: ' + info.response);
			}
		});

	}
};

async function buildInventoryAdjustments(accountName, token, itemId, inventoryData) {
	const endpoint = `https://${accountName}.myshopify.com/admin/api/2024-01/graphql.json`;

	let config = {
		method: 'get',
		maxBodyLength: Infinity,
		url: `https://${accountName}.myshopify.com/admin/api/2024-07/products/${itemId}.json`,
		headers: {
			'X-Shopify-Access-Token': token,
		}
	};

	const variantResponse = await axios.request(config)

	const variants = variantResponse.data.product.variants;

	// Step 2: Match each input item with the correct variant
	const adjustments = [];

	for (const item of inventoryData) {
        item.option2 = item.option2 || null;
        item.option3 = item.option3 || null;
        const match = variants.find(variant => {
            return (
                variant.sku === item.sku &&
                variant.option1 === item.option1 &&
                variant.option2 === item.option2 &&
                variant.option3 === item.option3
            );
        });

        if (match) {
            adjustments.push({
                inventoryItemId: "gid://shopify/InventoryItem/" + match.inventory_item_id,
                availableDelta: item.inventory_quantity - (match.inventory_quantity || 0),
            });
        } else {
            console.warn(`Variant not found for SKU: ${item.sku}, Options: ${item.option1} / ${item.option2}`);
        }
    }

	return adjustments;
}

async function fetchFromSource(id, channelId, source_marketplace, source_account) {
	let finalItem = [];

	try {

		if (source_account == null) {
			throw new Error("source_account is null");
		}

		if (source_marketplace == null) {
			throw new Error("source_marketplace is null");
		}

		if (channelId == null) {
			throw new Error("channelId is null");
		}

		if (source_marketplace.url.includes("ebay")) {

			const eBay = new ebay({
				appId: process.env.appId,
				devId: process.env.devId,
				certId: process.env.certId,
				sandbox: false,
				authToken: source_account.token,
			});

			finalItem = await GetItemEbay(eBay, channelId)

		}

		if (source_marketplace.url.includes("etsy")) {

			const etsyItem = await getEtsyItemBulk(channelId, source_account);
			// console.log("etsyItem", etsyItem.length);
			const resultArray = [];
			resultArray.push(...etsyItem.results);

			finalItem = await convertToDBFormat(resultArray, source_account.userId, source_account.accountName, source_marketplace.id, false, source_account.shop_id);

		}

		if (source_marketplace.url.includes("shopify")) {

			finalItem = await GetShopifyProduct([channelId], source_account.accountName, source_account.userId, source_account.token);

		}

	} catch (err) {
		console.log("Error in fetchFromSource", err);
	}

	return finalItem;
}

exports.pushData = async (
	id,
	data,
	marketplaceId,
	accountName,
	userId,
) => {
	try {
		const cskus = [];

		await Promise.all(
			data.ItemArray.Item?.map(async item => {

				let sku = '';
				let storeCategoryId = "";
				let storeCategoryName = "";

				if (item.SKU) {
					sku = item.SKU;
				} else if (item.Variations) {
					sku = Array.isArray(item.Variations.Variation) ? item.ItemID : item.Variations.Variation.SKU;
				} else {
					sku = item.ItemID;
				}

				if (item.Storefront) {
					if (item.Storefront.StoreCategoryID && item.Storefront.StoreCategoryID != 0) {
						storeCategoryId = item.Storefront.StoreCategoryID;
						if (item.Storefront.StoreCategoryName) {
							storeCategoryName = item.StoreFront.StoreCategoryName;
						}
					} else if (item.Storefront.StoreCategory2ID && item.Storefront.StoreCategory2ID != 0) {
						storeCategoryId = item.Storefront.StoreCategory2ID;
						if (item.Storefront.StoreCategory2Name) {
							storeCategoryName = item.StoreFront.StoreCategory2Name;
						}
					}
				}

				let status = ''
				if (item.SellingStatus.ListingStatus == 'Active') {
					status = 'live'
				} else if (item.SellingStatus.ListingStatus == 'Completed') {
					status = 'completed'
				} else if (item.SellingStatus.ListingStatus == 'Ended') {
					status = 'deleted'
				}

				let site = ''
				if (item.Site) {
					const siteData = await Geosite.findOne({
						where: { countryName: item.Site }
					})
					site = siteData.dataValues.globalId
				}

				cskus.push({
					id: id,
					channelId: item.ItemID,
					variantId: sku,
					isku: item.SKU ? item.SKU : item.ItemID,
					price: item.StartPrice.value,
					mrp: item.StartPrice.value,
					images: Array.isArray(item.PictureDetails?.PictureURL)
						? item.PictureDetails?.PictureURL
						: [item.PictureDetails?.PictureURL],
					description: item.Description,
					categoryId: item.PrimaryCategory.CategoryID,
					categoryName: item.PrimaryCategory.CategoryName,
					quantity: item.Quantity,
					currency: item.StartPrice.currencyID,
					itemSpecifics: item.ItemSpecifics?.NameValueList,
					itemCompatibility: item.ItemCompatibilityList?.NameValueList,
					sellerProfile: item.SellerProfiles,
					title: item.Title,
					status: status,
					sku_found: item.SKU ? true : false,
					storeCategoryId: storeCategoryId,
					storeCategoryName: storeCategoryName,
				});

			})
		);


		await csku.bulkCreate(cskus, {
			updateOnDuplicate: [
				'variantId', 'isku',
				'price', 'mrp',
				'images', 'description',
				'categoryId', 'categoryName',
				'quantity', 'currency',
				'itemSpecifics', 'itemCompatibility',
				'sellerProfile', 'title',
				'status', 'sku_found',
				'storeCategoryId', 'storeCategoryName'
			]
		});
	} catch (err) {
		newRelic.recordCustomEvent(
			`Error for data push ${err.message} for account ${accountName}`
		)
		newRelic.recordCustomEvent(
			`Error for data push ${err.message} for account ${accountName}`
		)
		// newRelic.recordCustomEvent(
		//   'Error in catalogue fetch for: ',
		//   req.body.accountName,
		//   '. Error: ',
		//   err.message
		// )
		console.log(err)
		throw err
	}
}

function getChangedFields(obj1, obj2) {
	const keys = _.union(_.keys(obj1), _.keys(obj2));
	return keys.filter(key => !_.isEqual(obj1[key], obj2[key]));
}

async function convertEtsyVariantsToShopify(variants, existingVariants) {
	console.log("Converting Etsy variants to Shopify format...", variants);
	const shopifyVariants = [];
	const optionsMap = {};
	const currentProductOptions = [];
	variants.forEach((product) => {
		product.variation.offerings.forEach((offering) => {

			const variant = {
				sku: product.variation.sku,
				price: (offering.price.amount / offering.price.divisor).toFixed(2),
				inventory_quantity: offering.quantity,
			};

			product.variation.property_values.forEach((propertyValue, index) => {
				let optionName = propertyValue.property_name;
				let optionValue = propertyValue.values[0];
				if (optionValue.includes("&quot;") || optionValue.includes("&")) {
					optionValue = optionValue.replace(/&quot;/g, '"');
					optionValue = optionValue.replace(/&amp;/g, "&");
				}

				variant[`option${index + 1}`] = optionValue;

				if (!optionsMap[optionName]) {
					optionsMap[optionName] = {
						name: optionName,
						values: [],
					};
				}

				if (!optionsMap[optionName].values.includes(optionValue)) {
					optionsMap[optionName].values.push(optionValue);
				}
			});

			shopifyVariants.push(variant);
		});
	});

	Object.keys(optionsMap).forEach((key) => {
		currentProductOptions.push(optionsMap[key]);
	});

	return { variants: shopifyVariants, options: currentProductOptions };
}

const generateItemSpecifics = async (
	idText,
	categoryId,
	categoryName = null,
	siteId = null,
	token,
	config,
	destination_marketplace,
	eBay = null
) => {
	try {
		if (destination_marketplace?.dataValues.url.includes("ebay")) {
			let now = moment();
			//   console.log(eBay, "eBay------------------");

			if (
				!token.dataValues.lastTokenRefreshDate ||
				now.diff(token.dataValues.lastTokenRefreshDate, "hours") >= 2
			) {
				const refreshedToken = await refreshTokenEbay(eBay, token);
				// console.log("Token >> ", refreshedToken);
				eBay.OAuth2.setCredentials(refreshedToken);
			}
			console.log("categoryId--------------", categoryId);

			aspectData = await eBay.commerce.taxonomy.getItemAspectsForCategory(
				0,
				categoryId
			);

			const requiredAspects = aspectData.aspects.filter(
				(asp) => asp.aspectConstraint.aspectRequired
			);
			const aspNames = new Set();
			let acceptedValuesMap = {};
			requiredAspects?.map((asp) => {
				if (asp.localizedAspectName == "US Shoe Size") {
					aspNames.add(
						asp.localizedAspectName + " (convert into US Shoe Size)"
					);
				} else {
					aspNames.add(asp.localizedAspectName);
				}
			});
			// console.log(config?.additional_aspects, "config?.additionalAspects");
			if (config?.additional_aspects) {
				config?.additional_aspects?.keyvaluepairs.forEach((pair) => {
					// console.log(pair.fieldname, "pair.fieldname");
					aspNames.add(pair.fieldname);

					if (pair.acceptedValues.length > 0) {
						acceptedValuesMap[pair.fieldname] = pair.acceptedValues;
					}
				});
			}
			console.log("Aspect Names Set:", aspNames);
			// console.log("Accepted Values Map:", acceptedValuesMap);
			const completion = await openai.chat.completions.create({
				messages: [
					{
						role: "system",
						content:
							"You are an expert product aspects generator and follow the below prompt strictly",
					},
					{
						role: "user",
						content: `${idText}
					  Based on the text above extract ${Array.from(aspNames).join(
							", "
						)} return 'NA' if not found and return in object form. Accepted values for the keys are ${JSON.stringify(
							acceptedValuesMap
						)},
					  Size and shoe size is same. Also Purity and Metal Purity are same. If Style is not provided then look for it in Tags section takeout Style key value strictly. TakeOut values for each Key. Takeout Item Length key's value as it is compulsary if its available. If its not available then return 'NA'.
			Note: Length of each value should not exceed 50 characters.`,
					},
				],
				model: "gpt-4o-mini",
			});

			let aspects = {};
			completion.choices[0].message.content
				?.replaceAll("```", "")
				.replaceAll("json", "")
				.replace("{", "")
				.replace("}", "")
				.split("\n")
				?.map((item) => {
					const [key, value] = item.split(":");
					if (key.includes("US Shoe Size")) {
						aspects["US Shoe Size"] = [value];
						delete aspects[key];
					} else {
						if (
							key != "" &&
							key &&
							!value?.includes("NA") &&
							!key.includes("N/A") &&
							!key.includes("NA")
						) {
							aspects[
								key
									.replaceAll("*", "")
									.replaceAll("-", "")
									.replaceAll(`"`, "")
									.replaceAll("<b>", "")
									.replaceAll("</b>", "")
									.replaceAll("<br>", "")
									.replaceAll("<li>", "")
									.replaceAll("</li>", "")
									.replaceAll(",", "")
									.trim()
							] = [
									value
										?.replaceAll("*", "")
										.replaceAll("-", "")
										.replace("US", "")
										.replace("(", "")
										.replace(")", "")
										.replaceAll(`"`, "")
										.replaceAll("<b>", "")
										.replaceAll("</b>", "")
										.replaceAll("<br>", "")
										.replaceAll("<li>", "")
										.replaceAll("</li>", "")
										.replaceAll(",", "")
										.trim(),
								];
						} else if (value?.includes("NA")) {
							console.log("In NA", key);
							// aspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()] = [foundAspects[key.replaceAll("*", "").replaceAll("-", "").replaceAll(`"`, "").replaceAll("<b>", "").replaceAll("</b>", "").replaceAll("<br>", "").replaceAll("<li>", "").replaceAll("</li>", "").trim()]];
							// delete aspects[key];
							if (key.trim().includes("Type")) {
								console.log("In Type");
								aspects[
									key
										.replaceAll("*", "")
										.replaceAll("-", "")
										.replaceAll(`"`, "")
										.replaceAll("<b>", "")
										.replaceAll("</b>", "")
										.replaceAll("<br>", "")
										.replaceAll("<li>", "")
										.replaceAll("</li>", "")
										.trim()
								] = [categoryName];
							}
						}
					}
				});

			console.log(aspects);
			return aspects;
		} else if (destination_marketplace?.dataValues.url.includes("etsy")) {
			try {
				const data = await getEtsyProductPropertiesByCategoryId(
					categoryId,
					token
				);

				const processedData = data.map((item) => {
					const possibleValues = item.possible_values.map((value) => ({
						[value.name]: value.value_id,
					}));
					return {
						[item.name]: item.property_id,
						possible_values: possibleValues,
					};
				});

				const completion = await openai.chat.completions.create({
					messages: [
						{
							role: "system",
							content:
								"You are an expert product aspects generator and follow the below prompt strictly",
						},
						{
							role: "user",
							content: `Based on text : ${idText} extract the correct values for each property in the following format:
				  [
					{
					  "property_id": Use property_id from the data,
					  "property_name": "string",
					  "scale_id": 1,
					  "scale_name": "string",
					  "value_ids": [use value_ids matching the extracted values from the text],
					  "values": ["string"]
					}
				  ]
				  Here is the processed data: ${JSON.stringify(processedData)}`,
						},
					],
					model: "gpt-4o-mini",
				});

				const aspectsData = completion.choices[0].message.content
					?.replaceAll("```json", "")
					.replaceAll("```", "");
				console.log(aspectsData, "aspectsData ------------------");

				return aspectsData;
			} catch (error) {
				console.error("Error fetching Etsy taxonomy properties:", error);
				throw error;
			}
		}
	} catch (err) {
		console.log("Error in generateItemSpecifics >> ", err);
		await apiCallLog(
			"generateItemSpecifics",
			"generateItemSpecifics",
			"generateItemSpecifics",
			{ idText, categoryId },
			{},
			err,
			"error"
		);
		return null;
	}
};