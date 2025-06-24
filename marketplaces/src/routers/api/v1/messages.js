const { FetchMessages, GetAutoMessageLog, GetAllMessages, GetAllBuyerList, SendDirectMessage, UpdateMessageStatus, getAllChats, getAllMessagesBySender } = require("../../../controllers/api/v1/message");

const router = require("express").Router();
router.post("/fetch-messages", FetchMessages);
router.get("/get-auto-message-log/:orderNumber", GetAutoMessageLog);
router.post("/get-all-chats", getAllChats);
router.post("/get-all-messages", getAllMessagesBySender);
// router.post("/get-all-chats", getAllChats);
// router.post("/get-all-messages", getAllMessagesBySender);
router.get("/get-all-buyers", GetAllBuyerList);
router.post("/send-message", SendDirectMessage);
router.put("/update-message-status", UpdateMessageStatus);
module.exports = router;