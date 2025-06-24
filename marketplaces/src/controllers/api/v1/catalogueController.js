const Catalogue = require("../../../models/catalogue");
const Marketplace = require("../../../models/marketplace");
const { Op } = require("sequelize");
const Tokens = require("../../../models/tokens");
const axios = require("axios");
const { CatelogueTypes } = require("../../../utils/enum");
const { fetchEbayStoreCategories } = require("../../../marketplaceapis/ebay/catalogue");
const { getWalmartToken } = require("../../../marketplaceapis/walmart/catalogue");
const { v4: uuidv4 } = require('uuid');
const { refreshTokenEbay } = require("../../../helper/refreshToken");
const moment = require("moment");
const ebay = require("ebay-api");
const EbayAuthToken = require("ebay-oauth-nodejs-client");
const Compatibility = require("../../../models/compatibilities");
const { apiCallLog } = require("../../../helper/apiCallLog");
const { sequelize } = require("../../../database/config");
const { Sequelize } = require("sequelize");

const ebayAuthToken = new EbayAuthToken({
	clientId: process.env.APP_ID,
	clientSecret: process.env.CERT_ID
})

const scopes = [
	'https://api.ebay.com/oauth/api_scope',
	'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
	'https://api.ebay.com/oauth/api_scope/sell.marketing',
	'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
	'https://api.ebay.com/oauth/api_scope/sell.inventory',
	'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
	'https://api.ebay.com/oauth/api_scope/sell.account',
	'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
	'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
	'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
	'https://api.ebay.com/oauth/api_scope/sell.finances',
	'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
	'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
	'https://api.ebay.com/oauth/api_scope/sell.reputation',
	'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
	'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
	'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
	'https://api.ebay.com/oauth/api_scope/sell.stores',
	'https://api.ebay.com/oauth/api_scope/sell.stores.readonly'
]

exports.CreateCatalogue = async (req, res) => {
	try {
		function extractLeafCategories(node, categoryName, parentCategory, marketplaceId) {
			// Base case: if the node is a leaf category, return it
			let arr = [];
			if (node.childCategoryTreeNodes) {
				node.childCategoryTreeNodes.forEach((child) => {
					let leafNode = child.leafCategoryTreeNode
						? child.leafCategoryTreeNode
						: false;
					let data = {
						categoryId: child.category.categoryId,
						categoryName: child.category.categoryName,
						categoryTree: `${categoryName} ${child.category.categoryName}`,
						parentCategory: parentCategory ?? null,
						leafCategoryTreeNode: leafNode,
						siteId: req.body.categoryTreeId,
						marketPlace: marketplaceId,
					};
					arr.push(data);
					arr = arr.concat(
						extractLeafCategories(
							child,
							`${categoryName}:${child.category.categoryName}`,
							child.category.categoryId,
							marketplaceId
						)
					);
				});
			}
			return arr;
		}

		let marketplaceId = req.body.marketplaceId;

		// Starting from the root node
		let rootCategoryNode = req.body.rootCategoryNode;
		let categoryName = rootCategoryNode.category.categoryName;
		let rootCategory = rootCategoryNode.childCategoryTreeNodes;
		let arr = [];

		const marketPlace = await Marketplace.findOne({
			where: {
				id: marketplaceId,
			},
		});
		if (!marketPlace) {
			return res.status(500).json({
				success: false,
				status: 404,
				message: "Marketplace not found",
			});
		}

		// Extract leaf categories from the root
		rootCategory.forEach((item) => {
			let data = {
				categoryId: item.category.categoryId,
				categoryName: item.category.categoryName,
				categoryTree: item.category.categoryName,
				parentCategory: rootCategoryNode.category.categoryId ?? null,
				leafCategoryTreeNode: item.leafCategoryTreeNode
					? item.leafCategoryTreeNode
					: false,
				siteId: req.body.categoryTreeId,
				marketPlace: marketplaceId,
			};
			arr.push(data);
			arr = arr.concat(
				extractLeafCategories(
					item,
					item.category.categoryName,
					item.category.categoryId,
					marketplaceId
				)
			);
		});

		// await Promise.all(arr.map((item) => Catalogue.create(item)));

		await Catalogue.bulkCreate(arr);

		return res.status(200).json({
			success: true,
			status: 200,
			data: arr.length,
			message: "",
		});
	} catch (err) {
		return res.status(400).json({
			success: false,
			status: 400,
			message: err.message,
		});
	}
};


exports.GetCatalogue = async (req, res) => {
	try {
		let { parentCategory, siteId, searchTerm, marketPlaceId, accountName } = req.query;

		const limit = parseInt(req.query.limit, 10) || 15;
		const offset = parseInt(req.query.offset, 10) || 0;

		let catalogueChild;

		if (marketPlaceId === '18') { // Walmart
			const token = await Tokens.findOne({
				where: {
					accountName,
					marketPlaceId: marketPlaceId
				}
			});
			if (!token) {
				return res.status(404).json({
					success: false,
					status: 404,
					message: 'Token not found'
				});
			}

			const correlationId = uuidv4();
			const walmartToken = await getWalmartToken(token, correlationId);

			const walmartBaseUrl = 'https://marketplace.walmartapis.com/v3/items/taxonomy?version=5.0.20240517-04_08_27-api&feedType=MP_ITEM';
			const headers = {
				'WM_SEC.ACCESS_TOKEN': walmartToken,
				'WM_CONSUMER.CHANNEL.TYPE': uuidv4(),
				'WM_QOS.CORRELATION_ID': uuidv4(),
				'WM_SVC.NAME': "Walmart Marketplace",
				'Accept': 'application/json'
			};


			const walmartResponse = await axios.get(walmartBaseUrl, { headers });

			catalogueChild = walmartResponse?.data?.itemTaxonomy


		} else if(marketPlaceId==='7'){ // eBay - existing logic
			let whereClause = {};
			if (parentCategory && siteId) {
				whereClause = { parentCategory, siteId };
			} else if (searchTerm && siteId && marketPlaceId) {
				whereClause = {
					marketPlace: marketPlaceId,
					categoryName: { [Op.iLike]: `%${searchTerm}%` },
					leafCategoryTreeNode: true,
					siteId
				};
			} else if (searchTerm && marketPlaceId) {
				whereClause = {
					marketPlace: marketPlaceId,
					categoryName: { [Op.iLike]: `%${searchTerm}%` },
					leafCategoryTreeNode: true
				};
			} else if (parentCategory && marketPlaceId) {
				whereClause = { marketPlace: marketPlaceId, parentCategory };
			} else {
				whereClause = {
					marketPlace: marketPlaceId,
					parentCategory: { [Op.is]: null },
					leafCategoryTreeNode: false,
					siteId: siteId
				};
			}

			// Fetch paginated results using limit and offset from query
			const { rows: catalogueChild, count: totalCount } = await Catalogue.findAndCountAll({
				where: whereClause,
				limit,
				offset,
				order: [['categoryName', 'ASC']]
			});

			return res.status(200).json({
				success: true,
				status: 200,
				data: catalogueChild,
				total: totalCount,
				limit,
				offset,
				message: "Catalogue items fetched successfully"
			});
		}else if(marketPlaceId==='28'){
			let whereClause = {};
			console.log("In marketplace Id 28")
			if (parentCategory) {
				whereClause = { parentCategory };
			} else if (searchTerm && siteId && marketPlaceId) {
				whereClause = {
					marketPlace: marketPlaceId,
					categoryName: { [Op.iLike]: `%${searchTerm}%` },
					leafCategoryTreeNode: true,
				};
			} else if (searchTerm && marketPlaceId) {
				whereClause = {
					marketPlace: marketPlaceId,
					categoryName: { [Op.iLike]: `%${searchTerm}%` },
					leafCategoryTreeNode: true
				};
			} else if (parentCategory && marketPlaceId) {
				whereClause = { marketPlace: marketPlaceId, parentCategory };
			} else {
				whereClause = {
					marketPlace: marketPlaceId,
					parentCategory: { [Op.is]: null },
					leafCategoryTreeNode: false,
					siteId: siteId
				};
			}
			const { rows: catalogueChild, count: totalCount } = await Catalogue.findAndCountAll({
				where: whereClause,
				limit,
				offset,
				order: [['categoryName', 'ASC']]
			});

			return res.status(200).json({
				success: true,
				status: 200,
				data: catalogueChild,
				total: totalCount,
				limit,
				offset,
				message: "Catalogue items fetched successfully"
			});
		}

		return res.status(200).json({
			success: true,
			status: 200,
			data: catalogueChild,
			message: "Catalogue items fetched successfully"
		});
	} catch (error) {
		console.error('Error in GetCatalogue:', error);
		return res.status(400).json({
			success: false,
			status: 400,
			message: error.message
		});
	}
};

exports.CheckItemCompatibility = async (req, res) => {
	try {

		const { categoryId, accountName, userId, marketplaceId, siteId } = req.body;

		if (!categoryId || !accountName || !userId || !marketplaceId) {
			throw new Error("Required parameter are missing. Please check request");
		}

		const token = await Tokens.findOne({
			where: {
				accountName,
				userId,
				marketPlaceId: marketplaceId
			}
		});

		if (!token) {
			return res.status(404).json({
				success: false,
				status: 404,
				message: 'Token not found'
			});
		}

		const currentTime = moment().add(5, "hours").add(30, "minutes");
		const lastTokenTime = moment(token.dataValues.lastTokenRefreshDate);

		const eBay = new ebay({
			appId: process.env.APP_ID,
			certId: process.env.CERT_ID,
			sandbox: false,
			devId: process.env.DEV_ID,
			autoRefreshToken: true,
			authToken: token.dataValues.token,
			siteId: siteId
		})

		if (currentTime.diff(lastTokenTime, "hours") >= 2) {

			const refreshedToken = await refreshTokenEbay(eBay, token)
			eBay.OAuth2.setCredentials(refreshedToken);

		}

		const checkItemCompatibility = await eBay.trading.GetCategoryFeatures({
			AllFeaturesForCategory: true,
			CategoryID: categoryId,
			FeatureID: "CompatibilityEnabled",
			DetailLevel: "ReturnAll"
		});

		const ItemCompatibilityEnabled = checkItemCompatibility.Category.ItemCompatibilityEnabled

		return res.status(200).json({
			success: true,
			ItemCompatibilityEnabled: ItemCompatibilityEnabled == "Disabled" ? false : true
		})

	} catch (err) {
		return res.status(500).json({
			success: false,
			message: err.message
		})
	}
}

exports.getCompatibilityData = async (req, res) => {
	const { siteId, categoryId } = req.query;

	try {
		if (!siteId || !categoryId) {
			return res.status(400).json({ error: 'siteId and categoryId are required' });
		}

		// Query the compatibilities table using the geo_site column
		const compatibilityData = await Compatibility.findAll({
			where: {
				geo_site: siteId.toUpperCase(), // Match case (e.g., "ebay_us" -> "EBAY_US")
			},
			attributes: ['make', 'model', 'year', 'submodel', 'trim'], // Fetch all required fields
		});

		return res.status(200).json({
			success: true,
			status: 200,
			data: compatibilityData,
		});

		// // Transform data into the expected format
		// const formattedData = {
		//   makes: [...new Set(compatibilityData.map(item => item.make).filter(Boolean))],
		//   models: [...new Set(compatibilityData.map(item => item.model).filter(Boolean))],
		//   years: [...new Set(compatibilityData.map(item => item.year).filter(Boolean))],
		//   submodels: [...new Set(compatibilityData.map(item => item.submodel).filter(Boolean))],
		//   trims: [...new Set(compatibilityData.map(item => item.trim).filter(Boolean))],
		// };

		// if (Object.values(formattedData).every(arr => arr.length === 0)) {
		//   console.warn(`No compatibility data found for siteId: ${siteId}`);
		// }

		// res.json({ data: formattedData });
	} catch (error) {
		console.error('Error fetching compatibility data from DB:', error);
		res.status(500).json({ error: error.message });
	}
};

exports.getAllMakes = async (req, res) => {
	try {

		const { geoSite } = req.query;
		if (!geoSite) {
			return res.status(400).json({ error: 'geoSite is required' });
		}

		const makes = await Compatibility.findAll({
			where: {
				geo_site: geoSite.toUpperCase(), // Match case (e.g., "ebay_us" -> "EBAY_US")
			},
			attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('make')), 'make']],
			order: [['make', 'ASC']],
			raw: true,
		});
		return res.status(200).json({
			success: true,
			status: 200,
			data: makes.map(item => item.make),
		});
	} catch (err) {
		await apiCallLog(
			"getAllMakes",
			"getAllMakes",
			"getAllMakes",
			{ req: req.body },
			{},
			{ error: err.message },
			"error"
		);
		console.error(err);
		return res.status(500).json({
			success: false,
			status: 500,
			message: err.message,
		});
	}
};

exports.getAllModels = async (req, res) => {
	try {
		// Expect query param ?makes=Toyota,BMW,KTM
		const makes = (req.query.makes || '').split(',').filter(Boolean);
		const geoSite = req.query.geoSite;

		if (!makes.length || !geoSite) return res.status(400).json({ error: 'Missing required parameter' });

		// Raw query for grouped JSON agg
		const results = await sequelize.query(`
		SELECT make, json_agg(DISTINCT model ORDER BY model) AS models
		FROM compatibilities
		WHERE make IN (:makes)
		and geo_site = :geoSite
		GROUP BY make
	  `, {
			replacements: { makes, geoSite: geoSite.toUpperCase() }, // Match case (e.g., "ebay_us" -> "EBAY_US")
			type: Sequelize.QueryTypes.SELECT,
		});

		return res.status(200).json({
			success: true,
			status: 200,
			data: results,
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			success: false,
			status: 500,
			message: err.message,
		});
	}
};

exports.getAllYears = async (req, res) => {
	try {
		// Expect body: { filters: [{ make: 'Toyota', model: 'Camry' }, { make: 'BMW', model: 'X5' }] }
		const filters = req.body.filters;
		const geoSite = req.query.geoSite;
		if (!Array.isArray(filters) || filters.length === 0 || !geoSite) {
			return res.status(400).json({ error: 'Missing required parameters' });
		}

		// Build WHERE clause for tuples (make, model)
		// Using Sequelize.literal + replacements for safe binding is tricky with tuples, so raw query with replacements
		const tuples = filters.map(f => `('${f.make}', '${f.model}')`).join(',');

		const query = `
		SELECT make, model, json_agg(DISTINCT year ORDER BY year) AS years
		FROM compatibilities
		WHERE (make, model) IN (${tuples})
		and geo_site = '${geoSite.toUpperCase()}'
		GROUP BY make, model
	  `;

		const results = await sequelize.query(query, {
			type: Sequelize.QueryTypes.SELECT,
		});

		return res.status(200).json({
			success: true,
			status: 200,
			data: results,
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			success: false,
			status: 500,
			message: err.message,
		});
	}
};

exports.getAllSubModels = async (req, res) => {
	try {
		// Expect body: { filters: [{ make, model, year }, ...] }
		const filters = req.body.filters;
		const geoSite = req.query.geoSite;
		if (!Array.isArray(filters) || filters.length === 0 || !geoSite) {
			return res.status(400).json({ error: 'Missing required parameters' });
		}

		const tuples = filters.map(f => `('${f.make}', '${f.model}', '${f.year}')`).join(',');

		const query = `SELECT make, model, year, json_agg(DISTINCT submodel ORDER BY submodel) AS submodels FROM compatibilities WHERE (make, model, year) IN (${tuples}) and geo_site = '${geoSite.toUpperCase()}' GROUP BY make, model, year
	  `;

		const results = await sequelize.query(query, {
			type: Sequelize.QueryTypes.SELECT,
		});

		return res.status(200).json({
			success: true,
			status: 200,
			data: results,
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			success: false,
			status: 500,
			message: err.message,
		});
	}
};

exports.getAllTrims = async (req, res) => {
	try {
		// Expect body: { filters: [{ make, model, year, submodel }, ...] }
		const filters = req.body.filters;
		const geoSite = req.query.geoSite;
		if (!Array.isArray(filters) || filters.length === 0 || !geoSite) {
			return res.status(400).json({ error: 'Missing required parameters' });
		}

		// Escape submodel quotes
		const tuples = filters.map(f => `('${f.make}', '${f.model}', '${f.year}', '${f.submodel}')`).join(',');

		const query = `SELECT make, model, year, submodel, json_agg(DISTINCT trim ORDER BY trim) AS trims FROM compatibilities WHERE (make, model, year, submodel) IN (${tuples}) and geo_site = '${geoSite.toUpperCase()}' GROUP BY make, model, year, submodel
	  `;
		console.log(query);
		const results = await sequelize.query(query, {
			type: Sequelize.QueryTypes.SELECT,
		});

		return res.status(200).json({
			success: true,
			status: 200,
			data: results,
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			success: false,
			status: 500,
			message: err.message,
		});
	}
};

