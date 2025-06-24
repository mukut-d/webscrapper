const Template = require("../../../models/template");
const newRelic = require('newrelic')

const templateController = {
    addTemplate: async (req, res) => {
        try {
            const { userId, templateId, templateName, jsonData, html, ejs, is_public, ejsKeys } = req.body;

            if (!userId || !templateId || !templateName || !jsonData || !html || !ejs) {
                return res.status(400).json({ error: "Missing required fields" });
            }
            

            const existingTemplate = await Template.findOne({ where: { template_id: templateId } });
            if (existingTemplate) {
                return res.status(409).json({ error: "A template with this ID already exists" });
            }

            const newTemplate = await Template.create({
                user_id: userId,
                template_id: templateId,
                template_name: templateName,
                json_data: jsonData,
                html,
                ejs,
                is_public,
                ejsKeys
            });

            res.status(201).json({
                message: "Template added successfully",
                template: {
                    id: newTemplate.id,
                    user_id: newTemplate.user_id,
                    template_id: newTemplate.template_id,
                    template_name: newTemplate.template_name,
                    created_at: newTemplate.created_at,
                    updated_at: newTemplate.updated_at,
                    is_public: newTemplate.is_public,
                    ejsKeys: newTemplate.ejsKeys
                }
            });
        } catch (error) {
            console.error("Error adding template:", error);
            const err = {
                message: error.message
            }
            newRelic.recordCustomEvent(`Error_adding_template:`, err);
            if (error.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ error: "A template with this ID already exists" });
            }
            res.status(500).json({ error: "Internal server error" });
        }
    },
    getTemplates: async (req, res) => {
        try {
            const { userId, templateId } = req.query;
            const filter = {};
            if (userId) filter.user_id = userId;
            if (templateId) filter.template_id = templateId;

            const templates = await Template.findAll({ where: filter });

            if (templates.length === 0) {
                return res.status(404).json({ message: "No templates found" });
            }

            res.status(200).json({
                message: "Templates retrieved successfully",
                templates: templates.map(template => ({
                    id: template.id,
                    user_id: template.user_id,
                    template_id: template.template_id,
                    template_name: template.template_name,
                    json_data: template.json_data,
                    html: template.html,
                    ejs: template.ejs,
                    created_at: template.created_at,
                    updated_at: template.updated_at,
                })),
            });
        } catch (error) {
            console.error("Error fetching templates:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    getAllTemplates: async (req, res) => {
        try {
            const  userId  = req.params.id; 

            if (!userId) {
                return res.status(400).json({ error: "userId is required" }); 
            }

            const templates = await Template.findAll({ where: { user_id: userId, is_public: false } }); 

            if (templates.length === 0) {
                return res.status(404).json({ message: "No templates found for this user" });
            }

            res.status(200).json({
                message: "Templates retrieved successfully",
                templates: templates.map(template => ({
                    id: template.id,
                    user_id: template.user_id,
                    template_id: template.template_id,
                    template_name: template.template_name,
                    json_data: template.json_data,
                    html: template.html,
                    ejs: template.ejs,
                    created_at: template.created_at,
                    updated_at: template.updated_at,
                })),
            });
        } catch (error) {
            console.error("Error fetching templates:", error);
            newRelic.recordCustomEvent(`Error fetching template:`, error.message);
            res.status(500).json({ error: "Internal server error" });
        }
    },

    updateTemplate: async (req, res) => {
        try {
            const { userId, templateId, templateName, jsonData, html, ejs, ejsKeys } = req.body;

            if (!userId || !templateId || !templateName || !jsonData || !html || !ejs) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            const existingTemplate = await Template.findOne({ 
                where: { 
                    template_id: templateId,
                    user_id: userId 
                } 
            });

            if (!existingTemplate) {
                return res.status(404).json({ error: "Template not found" });
            }

            const updatedTemplate = await existingTemplate.update({
                template_name: templateName,
                json_data: jsonData,
                html,
                ejs,
                ejsKeys
            });

            res.status(200).json({
                message: "Template updated successfully",
                template: {
                    id: updatedTemplate.id,
                    user_id: updatedTemplate.user_id,
                    template_id: updatedTemplate.template_id,
                    template_name: updatedTemplate.template_name,
                    created_at: updatedTemplate.created_at,
                    updated_at: updatedTemplate.updated_at,
                    ejsKeys: updatedTemplate.ejsKeys
                }
            });
        } catch (error) {
            console.error("Error updating template:", error);
            newRelic.recordCustomEvent(`Error updating template:`, error.message);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    deleteTemplate: async (req, res) => {
        try {
            const { userId, templateId } = req.body;
    
            if (!userId || !templateId) {
                return res.status(400).json({ error: "userId and templateId are required" });
            }
    
            const template = await Template.findOne({
                where: { template_id: templateId, user_id: userId }
            });
    
            if (!template) {
                return res.status(404).json({ error: "Template not found" });
            }
    
            await template.destroy();
    
            res.status(200).json({ message: "Template deleted successfully" });
        } catch (error) {
            console.error("Error deleting template:", error);
            newRelic.recordCustomEvent(`Error deleting template:`, error.message);
            res.status(500).json({ error: "Internal server error" });
        }
    },
    getAllPublicTemplates: async (req, res) => {
        try {
            

            const templates = await Template.findAll({ where: { is_public: true } }); 

            if (templates.length === 0) {
                return res.status(200).json({ message: "No public templates found " });
            }

            res.status(200).json({
                message: "Templates retrieved successfully",
                templates: templates.map(template => ({
                    id: template.id,
                    user_id: template.user_id,
                    template_id: template.template_id,
                    template_name: template.template_name,
                    json_data: template.json_data,
                    html: template.html,
                    ejs: template.ejs,
                    created_at: template.created_at,
                    updated_at: template.updated_at,
                })),
            });
        } catch (error) {
            console.error("Error fetching public templates:", error);
            newRelic.recordCustomEvent(`Error fetching public template:`, error.message);
            res.status(500).json({ error: "Internal server error" });
        }
    }
    

};

module.exports = templateController;