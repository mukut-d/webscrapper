const { Op } = require("sequelize");
const Marketplace = require("../../../models/marketplace");
const constants = require("../../../utils/constants");
const userData = require("../../../models/user");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Tokens = require("../../../models/tokens");

const { RECORD_NOT_FOUND, FOUND_DATA } = constants;

exports.getMarketPlaceBasedOnUser = async (req, res) => {
  try {
    const { userId } = req.body;

    //NOTE: Find all Marketplaces where user_id is either null or matched with any value in userId array
    const getMarketplace = await Marketplace.findAll({
      where: {
        [Op.or]: [
          { user_id: [] },
          {
            user_id: {
              [Op.contains]: [userId],
            },
          },
        ],
      },
    });

    //NOTE: Check if any Marketplaces were found
    if (!getMarketplace || getMarketplace.length === 0) {
      return res.status(200).json({
        status: 200,
        message: RECORD_NOT_FOUND,
        data: [],
      });
    }

    //NOTE: Map the results to required format
    const result = getMarketplace.map((ele) => ({
      id: ele.id,
      name: ele.name,
      url: ele.url,
      country: ele.country,
      image: ele.image,
      logo: ele.logo,
    }));

    return res.status(200).json({
      status: 200,
      message: FOUND_DATA, // Assuming RECORD_FOUND is the message for successful retrieval
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: error.message,
    });
  }
};

exports.loginPage = async (req, res) => {
  const { email, password } = req.body;

  const user = await userData.findOne({ where: { email: email } });

  console.log("jwtToken", user);

  if (user) {
    const hashedPassword = await bcrypt.hash(password, user.salt);

    if (hashedPassword === user.password) {
      delete user.password;
      delete user.salt;

      const jwtToken = jwt.sign(
        {
          id: user.id,
          email: email,
        },
        "sellerpundit",
        { expiresIn: "1h" }
      );

      // await userData.update({ where: { email: email} }, { jwt_token: jwtToken });

      res.status(200).json({ isLoggedIn: true, user });
    } else {
      res.status(401).json({ isLoggedIn: false, user: null });
    }
  } else {
    res.status(404).json({ isLoggedIn: false, user: null });
  }
};

exports.GetProxyDetails = async (req, res) => {
  try {
    const { accountId, accountName } = req.body;
    if (!accountId || !accountName) {
      return res.status(400).json({ message: "Please provide account id and account name" })
    }
    const userData = await Tokens.findOne({
      where: {
        userId: accountId,
        accountName: accountName
      }
    })
    if (!userData) {
      return res.status(404).json({ status: 404, message: "No data found" })
    }

    return res.status(200).json({ success: true, status: 200, message: "Data Retrived Successfully.", data: userData?.dataValues?.proxy_details || null })
  }
  catch (error) {
    return res.status(500).json({ success: false, status: 500, message: error.message });
  }
}
