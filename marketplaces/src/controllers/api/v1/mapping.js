// controllers/mappingController.js
const Mapping = require('../../../models/mapping')

// Get all mappings for a user
exports.getMappings = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const mappings = await Mapping.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    
    return res.status(200).json({
      success: true,
      data: mappings
    });
  } catch (error) {
    console.error('Error fetching mappings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch mappings',
      error: error.message
    });
  }
};

// Get a single mapping by ID
exports.getMappingById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const mapping = await Mapping.findByPk(id);
    
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: mapping
    });
  } catch (error) {
    console.error('Error fetching mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch mapping',
      error: error.message
    });
  }
};

// Create a new mapping
exports.createMapping = async (req, res) => {
  try {
    const { userId, accountName, mappings, name } = req.body;
    
    if (!userId || !accountName || !mappings) {
      return res.status(400).json({
        success: false,
        message: 'userId, accountName, and mappings are required'
      });
    }
    
    const newMapping = await Mapping.create({
      userId,
      accountName,
      mappings,
      name: name || 'Default Mapping'
    });
    
    return res.status(201).json({
      success: true,
      message: 'Mapping created successfully',
      data: newMapping
    });
  } catch (error) {
    console.error('Error creating mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create mapping',
      error: error.message
    });
  }
};

// Update an existing mapping
exports.updateMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const { accountName, mappings, name } = req.body;
    
    const mapping = await Mapping.findByPk(id);
    
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }
    
    // Update mapping
    await mapping.update({
      accountName: accountName || mapping.accountName,
      mappings: mappings || mapping.mappings,
      name: name || mapping.name
    });
    
    return res.status(200).json({
      success: true,
      message: 'Mapping updated successfully',
      data: mapping
    });
  } catch (error) {
    console.error('Error updating mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update mapping',
      error: error.message
    });
  }
};

// Delete a mapping
exports.deleteMapping = async (req, res) => {
  try {
    const { id } = req.params;
    
    const mapping = await Mapping.findByPk(id);
    
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Mapping not found'
      });
    }
    
    await mapping.destroy();
    
    return res.status(200).json({
      success: true,
      message: 'Mapping deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete mapping',
      error: error.message
    });
  }
};