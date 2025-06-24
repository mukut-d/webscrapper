const { Op } = require("sequelize");
const { emailTemplate } = require("../../../models/emailTemplate");
const { CreateTemplate } = require("../../../helper/sendEmail");

exports.CreateEmailTemplate = async (req, res) => {
    try {

        const { userId,
            accountName,
            sender_email,
            email_template,
            order_status,
            email_sent_time,
            email_sent_status,
            template_slug,
            template_name,
            template_sub } = req.body;

        const dataExist = await emailTemplate.findOne({
            where: {
                userId: userId, accountName: accountName, sender_email: sender_email
            }
        });

        if (dataExist) {
            return res.status(400).json({
                success: false,
                message: "Email already exist for this account"
            });
        }

        const jsonData = {
            name: template_name,
            slug: template_slug,
            subject: template_sub,
            body: emailTemplate
        };

        await CreateTemplate(jsonData);

        const data = await emailTemplate.create({
            userId,
            accountName,
            sender_email,
            email_template,
            order_status,
            email_sent_time,
            email_sent_status,
            template_slug,
            template_name,
            template_sub
        });

        res.status(200).json({
            success: true,
            data,
            message: "Data successfully created"
        });

    } catch (error) {
        console.log(error);
        return res.status(200).json({
            success: false,
            message: error.message,
        });
    }
}

exports.ListEmailTemplate = async (req, res) => {
    try {

        const { page, limit, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = search ? {
            sender_email: {
                [Op.iLike]: search
            }
        } : {};

        const data = await emailTemplate.findAll({
            where: {
                ...query
            },
            limit: parseInt(limit),
            offset: skip,
        });


        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.log(error);
        return res.status(200).json({
            success: false,
            message: error.message,
        });
    }
}

exports.GetEmailTemplate = async (req, res) => {
    try {

        const { id } = req.params;

        const data = await emailTemplate.findByPk(id);

        if (!data) {
            return res.status(400).json({
                success: false,
                message: "Data not found"
            });
        }

        return res.status(200).json({
            success: true,
            data,
            message: "Data found."
        });

    } catch (error) {
        console.log(error);
        return res.status(200).json({
            success: false,
            message: error.message,
        });
    }
}

exports.UpdateEmailTemplate = async (req, res) => {
    try {

        const id = req.params.id;
        const { userId,
            accountName,
            sender_email,
            email_template,
            order_status,
            email_sent_time,
            email_sent_status } = req.body;

        const dataExist = await emailTemplate.findOne({ where: { id: id } });

        if (!dataExist) {
            return res.status(200).json({
                success: false,
                message: "Data not found.",
            });
        }

        const updated = await emailTemplate.update({
            userId,
            accountName,
            sender_email,
            email_template,
            order_status,
            email_sent_time,
            email_sent_status
        },
            {
                where: {
                    id: id
                },
                returning: true
            });

        return res.status(200).json({
            success: true,
            data: updated[1],
            message: "Data updated successfully."
        });

    } catch (error) {
        console.log(error);
        return res.status(200).json({
            success: false,
            message: error.message,
        });
    }
}