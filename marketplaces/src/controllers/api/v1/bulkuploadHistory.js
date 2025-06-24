const BulkUploadHistory = require('../../../models/bulkUploadHistory')

exports.getBulkUploadHistory = async (req, res) => {
    try {
        //NOTE Destructure necessary fields from the request body
        const { userId, page = 1, limit = 10 } = req.body;

        //NOTE Validate required fields
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required',
            });
        }

        //NOTE Validate page and limit as numbers
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);

        if (isNaN(pageNumber) || pageNumber <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Page must be a positive number',
            });
        }

        if (isNaN(limitNumber) || limitNumber <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be a positive number',
            });
        }

        //NOTE Calculate offset for pagination
        const offset = (pageNumber - 1) * limitNumber;
        const { count, rows } = await BulkUploadHistory.findAndCountAll({
            where: {
              userId: userId
            },
            limit: limitNumber,
            offset: offset
          });
        //NOTE Return the data with pagination info
        return res.status(200).json({
            success: true,
            data: rows || [],
            page: pageNumber,
            limit: limitNumber,
            totalCount:count || 0
        });

    } catch (error) {
        //NOTE - Log the error (you can log it to an error tracking system)
        console.error(error);

        //NOTE -  Return a 500 error response
        return res.status(500).json({
            success: false,
            message: 'An error occurred while fetching bulk upload history',
            error: error.message,
        });
    }
};
