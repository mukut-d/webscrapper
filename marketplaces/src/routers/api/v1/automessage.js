// messages.js
const express = require("express");
const router = express.Router();
const emailTemplateController = require("../../../controllers/api/v1/emailTemplateController");

// Route for creating a new message
router.post("/create", emailTemplateController.saveMessage);

// Route for fetching all messages
router.get("/", emailTemplateController.fetchMessages);

// Route for deleting a message by ID and userId
router.delete("/delete/:id", emailTemplateController.deleteMessage);

// Route for deleting all messages by userId
router.delete("/delete/user/:userId", emailTemplateController.deleteMessagesByUserId);

router.put("/:id", emailTemplateController.updateMessage);

router.get("/:id", emailTemplateController.fetchMessageById);


module.exports = router;


