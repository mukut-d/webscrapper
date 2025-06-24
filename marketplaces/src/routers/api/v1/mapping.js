const express = require("express");
const router = express.Router();
const {
  getMappingById,
  getMappings,
  createMapping,
  updateMapping,
  deleteMapping
} = require("../../../controllers/api/v1/mapping");
router.get('/user/:userId', getMappings);

// Get a specific mapping
router.get('/:id', getMappingById);

// Create a new mapping
router.post('/', createMapping);

// Update a mapping
router.put('/:id', updateMapping);

// Delete a mapping
router.delete('/:id', deleteMapping);

module.exports = router;
