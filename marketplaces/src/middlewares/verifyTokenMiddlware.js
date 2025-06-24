const jwt = require('jsonwebtoken');
const User = require('../models/user');

async function verifyTokenMiddleware(req, res, next) {
  const bypassRoutes = [
    '/catalogue/bulk-migrate-csv',
    '/inventory/generate-excel'
  ];
  if (bypassRoutes.includes(req.path)) {
    return next();
  }
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader) {
    return res.status(401).json({
      status: 401,
      message: "Unauthorized User",
    });
  }

  let tokenName;
  let token;

  if (typeof authHeader === "string") {
    [tokenName, token] = authHeader.split(" ");
  } else if (Array.isArray(authHeader)) {
    [tokenName, token] = authHeader[0].split(" ");
  } else {
    return res.status(401).json({
      status: 401,
      message: "Invalid Token Format.",
    });
  }

  if (tokenName !== process.env.TOKEN_NAME) {
    return res.status(401).json({
      status: 401,
      message: "Invalid Token Format.",
    });
  }

  if (!token) {
    return res.status(401).json({
      status: 401,
      message: "Unauthorized User",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET || 'secret');
    const { id } = decoded;
    const user = await User.findOne({
      where: { id },
    });

    if (!user) {
      return res.status(401).json({
        status: 401,
        message: "Unauthorized User",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.log(error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        status: 401,
        message: "Token has been expired",
      });
    }
    return res.status(401).json({
      status: 401,
      message: "Invalid Token",
    });
  }
}

module.exports = verifyTokenMiddleware;
