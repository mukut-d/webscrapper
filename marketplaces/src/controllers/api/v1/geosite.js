const Geosite = require("../../../models/geosite");

exports.addGeosite = async (req, res) => {
  try {
    const { siteId, marketPlaceId, globalId, currency,siteName } = req.body;

    const insertData = await Geosite.create({
      siteId,
      marketPlaceId,
      globalId,
      currency,
      siteName
    });

    return res.status(200).json({
      success: true,
      status: 200,
      data: insertData,
      message: "Geosite Added successfully",
    });
  } catch (error) {
    console.log(error,"error")
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.getGeosites = async (req, res) => {
  try {
    const geositeData = await Geosite.findAll();
    return res.status(200).json({
      success: true,
      status: 200,
      data: geositeData,
      message: "Geosite data fetched successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.getGeositesById = async (req, res) => {
  try {
    const { id } = req.params;
    const geositeData = await Geosite.findAll({
      where: { id },
    });
    return res.status(200).json({
      success: true,
      status: 200,
      data: geositeData,
      message: "Geosite data deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.deleteGeosite = async (req, res) => {
  try {
    const { id } = req.params;
    const deleteData = await Geosite.destroy({
      where: { id },
    });
    return res.status(200).json({
      success: true,
      status: 200,
      data: deleteData,
      message: "Currency data deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};

exports.updateGeosite = async (req, res) => {
  try {
    const { id } = req.params;
    const { siteId, marketPlaceId, globalId, currency,siteName } = req.body;
    const [updatedRowsCount, updatedRows] = await Geosite.update(
      { siteId, marketPlaceId, globalId, currency ,siteName},
      { where: { id }, returning: true }
    );

    if (updatedRowsCount === 0) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "Geosite data not found",
      });
    }

    return res.status(200).json({
      success: true,
      status: 200,
      data: updatedRows[0],
      message: "Geosite data updated successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: error.message,
    });
  }
};
