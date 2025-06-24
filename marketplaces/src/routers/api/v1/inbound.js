const { CreateInbound, GetAllInbounds, UpdateInbounds } = require("../../../controllers/api/v1/inbound");

const router = require("express").Router();

router.post("/create/inbound", CreateInbound);
router.get("/list-inbound", GetAllInbounds);
router.put("/update/inbound/:id", UpdateInbounds)

module.exports = router;