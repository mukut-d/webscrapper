const { helperFunctionApi } = require("../../../helper/fetchFunction");

const router = require("express").Router();

router.get("/fetch-retry", helperFunctionApi);

module.exports = router;