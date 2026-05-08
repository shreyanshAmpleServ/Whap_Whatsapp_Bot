const express = require("express");
const router = express.Router();
const controller = require("../Controller/conditionController");

router.post("/", controller.createCondition);
router.get("/", controller.getConditions);
router.put("/:id", controller.updateCondition);
router.delete("/:id", controller.deleteCondition);

module.exports = router;
