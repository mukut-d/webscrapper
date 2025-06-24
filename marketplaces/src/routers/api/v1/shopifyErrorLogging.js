const router = require("express").Router();
const { ShopifyErrorLog } = require('../../../models/ShopifyErrorLog');

// Get unresolved errors
router.get('/shopify/errors', async (req, res) => {
  try {
    const { userId, resolved } = req.query;
    const query = { userId };
    if (resolved !== undefined) {
      query.resolved = resolved === 'true';
    }
    
    const errors = await ShopifyErrorLog.find(query)
      .sort({ timestamp: -1 })
      .limit(100);
      
    res.json(errors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve an error
router.put('/shopify/errors/:errorId/resolve', async (req, res) => {
  try {
    const { errorId } = req.params;
    const { resolution, resolvedBy } = req.body;
    
    const error = await ShopifyErrorLog.findByIdAndUpdate(
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
