const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const getSteps = async (req, res) => {
  try {
    const steps = await prisma.flowStep.findMany({
      where: { flowId: req.params.flowId },
      include: { conditions: true }, // Include conditions for each step
    });
    res.status(200).json(steps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createStep = async (req, res) => {
  try {
    const step = await prisma.flowStep.create({
      data: req.body, // Expects { flowId, stepKey, type, message, saveAs, nextStep, isEnd }
    });
    res.status(201).json(step);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateStep = async (req, res) => {
  try {
    const step = await prisma.flowStep.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.status(200).json(step);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteStep = async (req, res) => {
  try {
    // Delete conditions attached to this step first
    await prisma.flowCondition.deleteMany({ where: { stepId: req.params.id } });
    await prisma.flowStep.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: "Step deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = {
  createStep,
  getSteps,
  updateStep,
  deleteStep,
};

// const prisma = require("../utils/prismaClient");

// // CREATE STEP
// exports.createStep = async (req, res) => {
//   const step = await prisma.flowStep.create({
//     data: req.body,
//   });
//   res.json(step);
// };

// // GET STEPS BY FLOW
// exports.getSteps = async (req, res) => {
//   const { flowId } = req.query;

//   const steps = await prisma.flowStep.findMany({
//     where: { flowId },
//   });

//   res.json(steps);
// };

// // UPDATE STEP
// exports.updateStep = async (req, res) => {
//   const { id } = req.params;

//   const step = await prisma.flowStep.update({
//     where: { id },
//     data: req.body,
//   });

//   res.json(step);
// };

// // DELETE STEP
// exports.deleteStep = async (req, res) => {
//   const { id } = req.params;

//   await prisma.flowStep.delete({ where: { id } });

//   res.json({ success: true });
// };
