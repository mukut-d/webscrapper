const ProjectService = require("../services/project.service");
const { ApiResponse } = require("../utils");

const ProjectController = {
  async updateProject(req, res) {
    try {
      const { projectId } = req.params;

      if (!projectId) throw new Error("Project id required");

      let updatedProject = await ProjectService.updateProject(
        projectId,
        req.body
      );

      return ApiResponse.success(
        res,
        updatedProject,
        "Project Updated Sucessfully",
        200
      );
    } catch (error) {
      return ApiResponse.error(
        res,
        error,
        error.message || "Error updating the project",
        400
      );
    }
  },
};

module.exports = ProjectController;
