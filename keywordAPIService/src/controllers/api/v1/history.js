const ScrapingHistory = require('../../../models/scrapingHistory');
const TransactionHistory = require('../../../models/transaction-history');
const assert = require('assert');

// Get scraping history
exports.getScrapingHistory = async (req, res) => {
    try {
        const { id: userId } = req.user || {}; // Assuming user ID is in the request object
        assert(userId, 'userId should be present');
        const { pageNumber, resultPerPage } = req.query;
        const where = {
            user_id: userId,
        };

        const results = resultPerPage || 100;
        const page = pageNumber || 1;
        const offset = (page - 1) * results;

        const history = await ScrapingHistory.findAll({
            where,
            order: [['started_at', 'DESC']],
            limit: results + 1,
            offset,
        });

        let hasNextPage = false;

        if (history.length === results + 1) {
            hasNextPage = true;
            history.pop();
        }
        res.json({
            success: true,
            data: {
                history,
                hasNextPage,
                pageNumber: page,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get transaction/payment history
exports.getTransactionHistory = async (req, res) => {
    try {
        const { id: userId } = req.user || {}; // Assuming user ID is in the request object
        assert(userId, 'userId should be present');
        const { pageNumber, resultPerPage } = req.query;
        const where = {
            user_id: userId,
        };

        const results = resultPerPage || 100;
        const page = pageNumber || 1;
        const offset = (page - 1) * results;

        const history = await TransactionHistory.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: results + 1,
            offset,
        });

        let hasNextPage = false;

        if (history.length === results + 1) {
            hasNextPage = true;
            history.pop();
        }
        res.json({
            success: true,
            data: {
                history,
                hasNextPage,
                pageNumber: page,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
