const router = require("express").Router();
const upload = require("../../../helper/multer");
const { uploadToS3 } = require("../../../helper/uploadFile");

router.post(
  "/upload",
  upload.fields([
    { name: "media" },
    { name: "video" },
    { name: "image" }
  ]),
  async (req, res) => {
    const files = [
      ...(req.files?.media || []),
      ...(req.files?.video || []),
      ...(req.files?.image || [])
    ];

    if (files.length === 0) {
      return res.status(500).json({
        success: false,
        status: 500,
        message: "No files were uploaded.",
      });
    }

    try {
      const uploadPromises = files.map(
        async (file) => await uploadToS3(file)
      );
      const locations = await Promise.all(uploadPromises);

      return res.status(200).json({
        success: true,
        status: 200,
        message: "Files uploaded successfully.",
        data: locations,
      });
    } catch (error) {
      console.error("Error uploading files:", error);

      return res.status(500).json({
        success: false,
        status: 500,
        message: "An error occurred while uploading files.",
        error: error.message,
      });
    }
  }
);

// router.post("/upload", upload.array("image"), async (req, res) => {
//   if (!req.files) {
//     return res.status(500).json({
//       success: false,
//       status: 500,
//       message: "No files were uploaded.",
//     });
//   }

//   try {
//     const uploadPromises = req.files.map(
//       async (file) => await uploadToS3(file)
//     );
//     const locations = await Promise.all(uploadPromises);

//     return res.status(200).json({
//       success: true,
//       status: 200,
//       message: "Files uploaded successfully.",
//       data: locations,
//     });
//   } catch (error) {
//     console.error("Error uploading files:", error);

//     return res.status(500).json({
//       success: false,
//       status: 500,
//       message: "An error occurred while uploading files.",
//       error: error.message,
//     });
//   }
// });

module.exports = router;
