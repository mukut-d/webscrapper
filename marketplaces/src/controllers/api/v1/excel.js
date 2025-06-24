const { Op } = require("sequelize");
const Project = require("../../../models/project");
const Marketplace = require("../../../models/marketplace");
const constants = require("../../../utils/constants");
const { ProductInsertionType } = require("./../../../utils/enum");
const {  generateExcelAndReturnBase64} = require("../../../utils/fileGenerationUtils");

module.exports = {
  //SECTION - Sample excel sheet download for productId and keyword, based on the input
  async excelSampleDownload(req, res) {
    try {
      const { projectId, type } = req.body;
      console.log("projectId", projectId);
      console.log("type", type);
      // NOTE: Check if the provided type is part of the enum
      if (!Object.values(ProductInsertionType).includes(type)) {
        return res.status(400).json({
          status: 400,
          message: constants.INVALID_INSERTION_TYPE,
        });
      }

      // NOTE - find project details based on the input
      const project = await Project.findOne({ where: { id: projectId } });

      if (!project)
        return res.status(400).json({
          status: 400,
          message: constants.RECORD_NOT_FOUND,
        });

      const marketplacesIds = project.marketplaces.map((id) => Number(id));

      // NOTE: get marketplace details
      const marketplacesDetails = await Marketplace.findAll({
        where: { id: { [Op.in]: marketplacesIds } },
        attributes: ["id", "parentMarketplace"],
      });
      //NOTE: get base64 data
      const { base64Data, fileName } = await generateExcelAndReturnBase64(
        marketplacesDetails,
        type
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      return res.status(200).json({
        status: 200,
        message: constants.EXCEL_FILE_GENERATED,
        data: base64Data,
      });
    } catch (error) {
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }
  },
};
