const express = require("express");
const router = express.Router();
const {
  validateProjectUpdate,
} = require("../middleware/validation.middlleware.js");
const ProjectController = require("../controllers/project.controller.js");

router.put(
  "/:projectId",
  validateProjectUpdate,
  ProjectController.updateProject
);

module.exports = router;

// [rating, totalReviews,totalRatings,image_count,variant,category]
