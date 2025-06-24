const { emailTemplate } = require("../../../models/emailTemplate");

// Save a new message
exports.saveMessage = async (req, res) => {
    try {
        const {
            userId,
            name,
            marketplaces,
            accountName,
            message,
            sendingtrigger,
            sendAfter,
            createdAt,
        } = req.body;

        const newMessage = await emailTemplate.create({
            userId, 
            name,
            marketplaces,
            accountName,
            subject: message.subject,
            title: message.title,
            email_template: message.content, 
            sendingtrigger,
            sendafter: sendAfter,
            order_status: sendAfter, 
            createdAt,
            email_sent_status: "pending",
        });

        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ error: "Failed to save message", details: error.message });
    }
};

// Fetch all messages
exports.fetchMessages = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const messages = await emailTemplate.findAll({
            where: { userId }
        });

        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch messages", details: error.message });
    }
};

// Fetch message by ID
exports.fetchMessageById = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const message = await emailTemplate.findOne({
            where: { 
                id,
                userId 
            }
        });

        if (!message) {
            return res.status(404).json({
                error: "Message not found or you don't have permission to view this message"
            });
        }

        res.status(200).json(message);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch message", details: error.message });
    }
};

exports.updateMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            userId,
            name,
            marketplaces,
            accountName,
            message,
            sendingtrigger,
            sendAfter,
        } = req.body;

        const existingMessage = await emailTemplate.findOne({
            where: { id, userId }
        });

        if (!existingMessage) {
            return res.status(404).json({
                error: "Message not found or you don't have permission to update this message"
            });
        }

        const updatedMessage = await existingMessage.update({
            name,
            marketplaces,
            accountName,
            subject: message.subject,
            title: message.title,
            email_template: message.content,
            sendingtrigger,
            sendafter: sendAfter,
            order_status: sendAfter,
        });

        res.status(200).json(updatedMessage);
    } catch (error) {
        res.status(500).json({ error: "Failed to update message", details: error.message });
    }
};

// Delete a message by ID
exports.deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const messageToDelete = await emailTemplate.findOne({
            where: { id, userId }
        });

        if (!messageToDelete) {
            return res.status(404).json({
                error: "Message not found or you don't have permission to delete this message"
            });
        }

        await messageToDelete.destroy();
        res.status(200).json({ message: "Message deleted successfully", deletedMessageId: id });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete message", details: error.message });
    }
};

// Optional: Batch delete messages by userId
exports.deleteMessagesByUserId = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const deletedCount = await emailTemplate.destroy({
            where: {
                userId: userId
            }
        });

        if (deletedCount === 0) {
            return res.status(404).json({ 
                message: "No messages found for this user" 
            });
        }

        res.status(200).json({ 
            message: "Messages deleted successfully",
            deletedCount: deletedCount
        });
    } catch (error) {
        res.status(500).json({ 
            error: "Failed to delete messages", 
            details: error.message 
        });
    }
};