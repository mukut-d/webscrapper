const { Op } = require("sequelize");
const Marketplace = require("../../../../src/models/marketplace");
const Project = require("../../../../src/models/project");
const constants = require("../../../utils/constants");
const MarketplaceFormConfig = require("../../../../src/models/MarketplaceFormConfig");
const { RECORD_NOT_FOUND, FOUND_DATA } = constants;

module.exports = {
  async View(req, res) {
    try {
      let allMarketplaces = [];

      let name = req.query.name;
      let country = req.query.country;

      let condition = {
        attributes: [
          "id",
          "logo",
          "url",
          "image",
          "country",
          "general_instruction",
          ["parent_marketplace", "name"],
        ],
        where: { visible_on_oms: true },
      };

      if (name || country) {
        if (name && country) {
          condition["where"] = {
            [Op.and]: [
              {
                parent_marketplace: {
                  [Op.like]: `%${name}%`,
                },
              },
              {
                country: {
                  [Op.like]: `%${country}%`,
                },
              },
            ],
          };
        }

        if (name && !country) {
          condition["where"] = {
            parent_marketplace: {
              [Op.like]: `%${name}%`,
            },
          };
        }

        if (country && !name) {
          condition["where"] = {
            country: {
              [Op.like]: `%${country}%`,
            },
          };
        }

        // allMarketplaces = await Marketplace.findAll(condition);
      }

      allMarketplaces = await Marketplace.findAll(condition);

      return res.status(200).json({
        allMarketplaces,
        marketPlaces: allMarketplaces,
      });
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  async detailsBasedOnProjectId(req, res) {
    try {
      const { projectId } = req.body;

      // Find the project by ID
      const project = await Project.findOne({ where: { id: projectId } });

      // Check if the project exists
      if (!project) {
        return res.status(400).json({
          status: 400,
          message: RECORD_NOT_FOUND,
        });
      }

      // Extract marketplace IDs from the project
      const marketplaceIds = project.marketplaces.map((id) => parseInt(id));

      // Find all marketplaces with the extracted IDs
      const marketplaces = await Marketplace.findAll({
        where: { id: marketplaceIds },
      });

      // Map the results to the required format
      const result = marketplaces.map((ele) => ({
        id: ele.id,
        name: ele.name,
        byKeyword: ele.byKeyword,
        byCategory: ele.byCategory,
        byUrl: ele.byUrl,
        byId: ele.byId,
      }));

      // Send the response with the data
      return res.status(200).json({
        status: 200,
        message: FOUND_DATA,
        data: result,
      });
    } catch (error) {
      // Handle any errors
      return res.status(500).json({
        status: 500,
        message: error.message,
      });
    }
  },
async getMarketplaceFormConfig(req, res) {
  try {
    const { marketPlaceId } = req.body;
    console.log(marketPlaceId, "marketPlaceId from config api----------------------------------");
    if (!marketPlaceId) {
      return res.status(400).json({
        status: 400,
        message: 'marketPlaceId parameter is required'
      });
    }

    const config = await MarketplaceFormConfig.findOne({
      where: { marketPlaceId: marketPlaceId.toString() } 
    });

    if (!config) {
      return res.status(404).json({
        status: 404,
        message: 'Configuration not found for the provided marketPlaceId'
      });
    }

    return res.status(200).json({
      status: 200,
      data: config
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: error.message
    });
  }
}
};
