const Prompt = require('../../../models/prompts');

exports.GetPromptLogic = async (req, res) => {
    const { userId, categoryTreeId, categoryId, marketplaceId } = req.query;
    console.log(typeof userId, userId, "userId")
    console.log(typeof categoryTreeId, categoryTreeId, "categoryTreeId")
    console.log(typeof categoryId, categoryId, "categoryId")
    console.log(typeof marketplaceId, marketplaceId, "marketplaceId")

    try {
        let prompt;

        // Step 1: Check for a user-defined prompt
        if (userId) {
            prompt = await Prompt.findOne({
                where: {
                    user_id: userId,
                    type: 'user_defined',
                    marketplace_id: marketplaceId,
                },
            });
            if (prompt) {
                return res.status(200).json({
                    success: true,
                    prompt: prompt.dataValues
                });
            } else {
                // If no prompt found
                return res.status(500).json({ message: 'No prompt found' });
            }
        }

        // Step 2: Check for a category tree prompt
        if (categoryTreeId) {
            prompt = await Prompt.findOne({
                where: {
                    category_id: categoryTreeId,
                    type: 'category_tree',
                    marketplace_id: marketplaceId,
                },
            });
            if (prompt) {
                return res.status(200).json({
                    success: true,
                    prompt: prompt.dataValues
                });
            } else {
                // If no prompt found
                return res.status(500).json({ message: 'No prompt found' });
            }
        }

        // Step 3: Check for a category prompt
        if (categoryId) {
            prompt = await Prompt.findOne({
                where: {
                    category_id: categoryId,
                    type: 'category',
                    marketplace_id: marketplaceId,
                },
            });
            if (prompt) {
                return res.status(200).json({
                    success: true,
                    prompt: prompt.dataValues
                });
            } else {
                // If no prompt found
                return res.status(500).json({ message: 'No prompt found' });
            }
        }

        // Step 4: Return the default prompt
        prompt = await Prompt.findOne({
            where: {
                type: 'default',
                marketplace_id: marketplaceId,
            },
        });

        if (prompt) {
            return res.status(200).json({
                success: true,
                prompt: prompt.dataValues
            });
        }

        // If no prompt found
        return res.status(500).json({ message: 'No prompt found' });
    } catch (error) {
        console.error('Error fetching prompt:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

exports.CreatePrompt = async (req, res) => {
    const { category_id, user_id, prompt, marketplace_id, type } = req.body;

    try {
        const newPrompt = await Prompt.create({
            category_id,
            user_id,
            prompt,
            marketplace_id,
            type,
        });

        return res.status(200).json({
            success: true,
            prompt: newPrompt
        });
    } catch (error) {
        console.error('Error creating prompt:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}