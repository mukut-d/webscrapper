const Joi = require("joi");
const { ApiResponse } = require("../utils");

const projectUpdateSchema = Joi.object({
  requested_fields: Joi.array().items(Joi.string()),
});

function validateProjectUpdate(req, res, next) {
  const { error } = projectUpdateSchema.validate(req.body, {
    abortEarly: false,
  });
  if (error) {
    console.log(error);
    const invalidFields = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));
    return ApiResponse.error(res, { invalidFields }, "Validation failed", 400);
  }
  next();
}

module.exports = { validateProjectUpdate };
