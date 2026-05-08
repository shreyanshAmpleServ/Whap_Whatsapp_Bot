// const prisma = require("../utils/prismaClient");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
// const prisma = require('../prisma');

const getFlows = async (req, res) => {
  try {
    const flows = await prisma.flow.findMany();
    res.status(200).json(flows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getFlow = async (req, res) => {
  try {
    const flow = await prisma.flow.findUnique({
      where: { id: req.params.id },
      include: { steps: true }, // Returns flow and all its steps
    });
    res.status(200).json(flow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createFlow = async (req, res) => {
  try {
    const { name, trigger, startStep } = req.body;
    const flow = await prisma.flow.create({
      data: { name, trigger, startStep },
    });
    res.status(201).json(flow);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateFlow = async (req, res) => {
  try {
    const flow = await prisma.flow.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.status(200).json(flow);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteFlow = async (req, res) => {
  try {
    // 1. Delete conditions linked to steps of this flow
    const steps = await prisma.flowStep.findMany({
      where: { flowId: req.params.id },
    });
    const stepIds = steps.map((s) => s.id);
    await prisma.flowCondition.deleteMany({
      where: { stepId: { in: stepIds } },
    });

    // 2. Delete steps of this flow
    await prisma.flowStep.deleteMany({ where: { flowId: req.params.id } });

    // 3. Delete flow
    await prisma.flow.delete({ where: { id: req.params.id } });

    res
      .status(200)
      .json({ message: "Flow and all associated data deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = {
  createFlow,

  getFlows,

  getFlow,

  updateFlow,
  deleteFlow,
};

// CREATE FLOW
// const createFlow = async (req, res) => {
//   try {
//     const { name, trigger, startStep } = req.body;

//     console.log("Creating flow with data:", req.body);

//     const flow = await prisma.Flow.create({
//       data: { name, trigger, startStep },
//     });

//     res.status(201).json(flow);
//   } catch (err) {
//     console.error("Create Flow Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // GET ALL FLOWS
// const getFlows = async (req, res) => {
//   try {
//     console.log("Fetching all flows");

//     const flows = await prisma.Flow.findMany();

//     res.json(flows);
//   } catch (err) {
//     console.error("Get Flows Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // GET SINGLE FLOW
// const getFlow = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const flow = await prisma.flow.findUnique({
//       where: { id },
//       include: { steps: true, conditions: true },
//     });

//     if (!flow) {
//       return res.status(404).json({ error: "Flow not found" });
//     }

//     res.json(flow);
//   } catch (err) {
//     console.error("Get Flow Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // UPDATE FLOW
// const updateFlow = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const flow = await prisma.flow.update({
//       where: { id },
//       data: req.body,
//     });

//     res.json(flow);
//   } catch (err) {
//     console.error("Update Flow Error:", err);

//     if (err.code === "P2025") {
//       return res.status(404).json({ error: "Flow not found" });
//     }

//     res.status(500).json({ error: err.message });
//   }
// };

// // DELETE FLOW
// const deleteFlow = async (req, res) => {
//   try {
//     const { id } = req.params;

//     await prisma.flow.delete({
//       where: { id },
//     });

//     res.json({ success: true });
//   } catch (err) {
//     console.error("Delete Flow Error:", err);

//     if (err.code === "P2025") {
//       return res.status(404).json({ error: "Flow not found" });
//     }

//     res.status(500).json({ error: err.message });
//   }
// };

// module.exports = {
//   createFlow,

//   getFlows,

//   getFlow,

//   updateFlow,
//   deleteFlow,
// };
