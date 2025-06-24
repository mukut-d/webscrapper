const router = require("express").Router();
const { EbayErrorLog } = require('../../../models/EbayErrorLog');

// Get unresolved errors
router.get('/ebay/errors', async (req, res) => {
  try {
    const { userId, resolved } = req.query;
    const query = { userId };
    if (resolved !== undefined) {
      query.resolved = resolved === 'true';
    }

    const errors = await EbayErrorLog.find(query)
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(errors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve an error
router.put('/ebay/errors/:errorId/resolve', async (req, res) => {
  try {
    const { errorId } = req.params;
    const { resolution, resolvedBy } = req.body;

    const error = await EbayErrorLog.findByIdAndUpdate(
      errorId,
      {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        resolution
      },
      { new: true }
    );

    if (!error) {
      return res.status(404).json({ error: 'Error log not found' });
    }

    res.json(error);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
