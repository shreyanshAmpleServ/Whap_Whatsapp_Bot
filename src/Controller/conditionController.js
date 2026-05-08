const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const getConditions = async (req, res) => {
  try {
    const conditions = await prisma.flowCondition.findMany({
      where: { stepId: req.params.stepId },
    });
    res.status(200).json(conditions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createCondition = async (req, res) => {
  try {
    const condition = await prisma.flowCondition.create({
      data: req.body, // Expects { stepId, variable, operator, value, nextStep }
    });
    res.status(201).json(condition);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateCondition = async (req, res) => {
  try {
    const condition = await prisma.flowCondition.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.status(200).json(condition);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteCondition = async (req, res) => {
  try {
    await prisma.flowCondition.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: "Condition deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = {
  createCondition,
  getConditions,
  updateCondition,
  deleteCondition,
};

// const prisma = require("../utils/prismaClient");

// // CREATE CONDITION
// exports.createCondition = async (req, res) => {
//   const condition = await prisma.flowCondition.create({
//     data: req.body,
//   });
//   res.json(condition);
// };

// // GET CONDITIONS
// exports.getConditions = async (req, res) => {
//   const { flowId } = req.query;

//   const conditions = await prisma.flowCondition.findMany({
//     where: { flowId },
//   });

//   res.json(conditions);
// };

// // UPDATE CONDITION
// exports.updateCondition = async (req, res) => {
//   const { id } = req.params;

//   const condition = await prisma.flowCondition.update({
//     where: { id },
//     data: req.body,
//   });

//   res.json(condition);
// };

// // DELETE CONDITION
// exports.deleteCondition = async (req, res) => {
//   const { id } = req.params;

//   await prisma.flowCondition.delete({ where: { id } });

//   res.json({ success: true });
// };
