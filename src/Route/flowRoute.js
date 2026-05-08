// routes/flow.routes.js
// const express = require("express");
// const router = express.Router();
// const controller = require("../Controller/flowController");

// router.post("/", controller.createFlow);
// router.get("/", controller.getFlows);
// router.get("/:id", controller.getFlowById);
// router.put("/:id", controller.updateFlow);
// router.delete("/:id", controller.deleteFlow);

// module.exports = router;
const express = require("express");
const router = express.Router();
const controller = require("../Controller/flowController");

router.post("/", controller.createFlow);
router.get("/", controller.getFlows);
router.get("/:id", controller.getFlow);
router.put("/:id", controller.updateFlow);
router.delete("/:id", controller.deleteFlow);

module.exports = router;
