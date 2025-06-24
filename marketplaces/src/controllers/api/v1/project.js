const { Sequelize, Op } = require("sequelize");
const Project = require("../../../models/project");
const Product = require("../../../models/product");
const MarketPlace = require("../../../models/marketplace");
const constants = require("../../../utils/constants");

module.exports = {
  //SECTION - Create new projects
  async createNewProjects(req, res) {
    try {
      const { name, marketplaces, userId, description, is_frequency, frequency_time } = req.body;

      //NOTE - check the name is unique or not
      const checkName = await Project.findOne({
        where: {
          userId,
          name: { [Op.iLike]: name },
        },
      });
      //NOTE - if project name already exist
      if (checkName)
        return res.status(400).send({
          status: 400,
          message: constants.DUPLICATE_NAME,
        });

      //NOTE - create project
      const project = await Project.create({
        name,
        marketplaces,
        userId,
        description,
        status: "draft",
        is_frequency,
        frequency_time
      });

      //NOTE - check matchedMarketPlaces
      const matchedMarketPlaces = await MarketPlace.findAll({
        where: { id: marketplaces },
        attributes: [
          "id",
          "logo",
          "url",
          "image",
          "country",
          ["parent_marketplace", "name"],
        ],
      });

      //NOTE - push final response
      const result = {
        project,
        marketplaces: matchedMarketPlaces,
      };

      return res.status(200).send({
        status: 200,
        message: constants.FOUND_DATA,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }
  },

  //SECTION - Edit  projects details
  async editProjectDetails(req, res) {
    try {
      const { projectId, name, marketplaces, userId } = req.body;

      //NOTE - check the name is unique or not
      const checkName = await Project.findOne({
        where: {
          id: { [Op.ne]: projectId },
          userId,
          name: { [Op.iLike]: name },
        },
      });

      //NOTE - if project name already exist
      if (checkName)
        return res.status(400).send({
          status: 400,
          message: constants.DUPLICATE_NAME,
        });

      //NOTE: Use array destructuring to extract the updated records
      const [, [updatedProject]] = await Project.update(
        { name, marketplaces },
        { where: { id: projectId }, returning: true }
      );

      const matchedMarketPlaces = await MarketPlace.findAll({
        attributes: [
          "id",
          "logo",
          "url",
          "image",
          "country",
          ["parent_marketplace", "name"],
        ],
        where: { id: updatedProject["marketplaces"] },
      });

      //NOTE - push final response
      const result = {
        project: updatedProject,
        marketplaces: matchedMarketPlaces,
      };

      return res.status(200).send({
        status: 200,
        message: constants.UPDATE_DATA,
        data: result,
      });
    } catch (error) {
      return res.status(400).send({
        status: 400,
        message: error.message,
      });
    }
  },

  //SECTION - Get all project list
  async getAllActiveProjects(req, res) {
    try {
      const { userId } = req.query;

      //NOTE: Use Sequelize literal for COUNT to avoid raw: true
      const projects = await Project.findAll({
        where: { userId, projectStatus: true },
        // attributes: {
        //   include: [
        //     [
        //       Sequelize.literal(
        //         "(SELECT COUNT(*) FROM products WHERE products.projectId = projects.id)"
        //       ),
        //       "requested",
        //     ],
        //   ],
        // },
        // include: [{ model: Product, attributes: [] }],
        // group: ["projects.id"],
      });

      //NOTE: If there are projects, fetch associated marketplaces
      if (projects.length > 0) {
        for (let project of projects) {
          //NOTE: Use bulk fetch for marketplaces using ids
          const marketplaces = await MarketPlace.findAll({
            attributes: [
              "id",
              "logo",
              "url",
              "image",
              "country",
              ["parent_marketplace", "name"],
            ],
            where: {
              id: { [Op.in]: project.marketplaces },
            },
          });

          //NOTE: Assign marketplaces to the project
          if (marketplaces.length > 0) {
            project.marketplaces = marketplaces;
          }
        }
        projects.requested = 0;
      }

      //NOTE: Return the response
      return res.status(200).json({
        status: 200,
        message: constants.FOUND_DATA,
        data: projects.length > 0 ? projects : [], //TODO: Send projects or an empty array
      });
    } catch (error) {
      //NOTE Handle errors
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }
  },

  //SECTION  Inactive project by Id
  async inactiveProjects(req, res) {
    try {
      const { projectId } = req.body;

      //NOTE: Update the projectStatus to false
      await Project.update(
        { projectStatus: false },
        { where: { id: projectId } }
      );

      return res.status(200).json({
        status: 200,
        message: constants.PROJECT_DEACTIVATED,
      });
    } catch (error) {
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }
  },

  //SECTION  Inactive project by Id
  async getSingleProject(req, res) {
    try {
      const { id } = req.params;

      // Fetch the project from the database
      const project = await Project.findOne({
        where: { id },
      });

      // If the project does not exist, return a 404 status code and a message
      if (!project) {
        return res.status(404).send({
          status: 404,
          message: constants.RECORD_NOT_FOUND,
        });
      }

      // Fetch the associated marketplaces
      const marketplaces = await MarketPlace.findAll({
        where: { id: project.marketplaces },
        attributes: [
          "id",
          "logo",
          "url",
          "image",
          "country",
          ["parent_marketplace", "name"],
        ],
      });

      // Construct the response object
      const result = {
        project,
        marketplaces,
      };

      // Return the response object
      return res.status(200).send({
        status: 200,
        message: constants.FOUND_DATA,
        data: result,
      });
    } catch (error) {
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }
  },
};
