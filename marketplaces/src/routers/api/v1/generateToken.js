const router = require("express").Router();
const {generateToken} =require('../../../controllers/api/v1/generateToken')

router.get("/", generateToken) 

module.exports = router; 