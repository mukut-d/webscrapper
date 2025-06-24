const { Op } = require("sequelize");
const Project = require("../../../models/project");
const MarketPlace = require("../../../models/marketplace");

module.exports = {
  async Create(req, res, next) {
    try {
      const { marketplaces } = req.body;

      const project = await Project.create(req.body);

      // console.log('marketplaces')
      // console.log(typeof marketplaces)

      let condition = {
        where: {
          id: {
            [Op.in]: marketplaces,
          },
        },
      };
      const matchedMarketPlaces = await MarketPlace.findAll(condition);

      return res.status(201).json({
        project,
        marketplaces: matchedMarketPlaces,
        type: typeof marketplaces,
      });
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },

  async list(req, res, next) {
    try {
      const projects = await Project.findAll();

      return res.status(200).json({
        projects,
      });
    } catch (error) {
      return res.status(400).json({
        status: false,
        message: error.message,
      });
    }
  },
};
