const router = require('express').Router();
const { GetPromptLogic, CreatePrompt } = require('../../../controllers/api/v1/prompts');

router.get("/get-prompt-logic", GetPromptLogic);

module.exports = router;