const { Op } = require("sequelize");
const Marketplace = require("../../../../src/models/marketplace");

module.exports = {
  async View(req, res, next) {
    try {
      let allMarketplaces = [];

      let name = req.query.name;
      let country = req.query.country;

      if (name || country) {
        let condition = { where: {} };

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

        allMarketplaces = await Marketplace.findAll(condition);
      } else {
        allMarketplaces = await Marketplace.findAll();
      }

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
};
