const router = require("express").Router();
const {
  createNewProjects,
  editProjectDetails,
  getAllActiveProjects,
  inactiveProjects,
  getSingleProject, // Import the getSingleProject function
} = require("../../../controllers/api/v1/project");

router.post("/create", async function (req, res) {
  createNewProjects(req, res);
});

router.get("/", async function (req, res) {
  getAllActiveProjects(req, res);
});

router.get("/:id", async function (req, res) {
  getSingleProject(req, res);
});

router.post("/edit", async function (req, res) {
  editProjectDetails(req, res);
});

router.post("/delete", async function (req, res) {
  inactiveProjects(req, res);
});

module.exports = router;
