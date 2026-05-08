const prisma = require("../prisma");
const axios = require("axios");
const { sendText } = require("../services/whapi");

async function processIncomingMessage(userId, messageText) {
  // 1. Find if the user is already in a conversation
  let userConv = await prisma.userConversation.findUnique({
    where: { whatsappNumber: userId },
  });

  // 2. If no conversation, check if the message triggers any Flow
  if (!userConv) {
    const flow = await prisma.flow.findFirst({
      where: { trigger: { equals: messageText.toLowerCase() }, isActive: true },
    });

    if (!flow) return; // Message doesn't trigger any flow, ignore it.

    // Start the flow
    const startStep = await prisma.flowStep.findUnique({
      where: { stepKey: flow.startStep }, // Note: In real app, use an index or a better lookup
    });

    await sendText(userId, startStep.message);

    await prisma.userConversation.create({
      data: {
        whatsappNumber: userId,
        flowId: flow.id,
        currentStepKey: startStep.stepKey,
        userData: {},
      },
    });
    return;
  }

  // 3. User is in a flow. Get the current step configuration
  const currentStep = await prisma.flowStep.findFirst({
    where: {
      flowId: userConv.flowId,
      stepKey: userConv.currentStepKey,
    },
    include: { conditions: true },
  });

  if (!currentStep) return;

  // 4. If the step is an INPUT step, save the user's response
  if (currentStep.saveAs) {
    const updatedData = { ...userConv.userData };
    updatedData[currentStep.saveAs] = messageText;

    await prisma.userConversation.update({
      where: { id: userConv.id },
      data: { userData: updatedData },
    });
  }

  // 5. EVALUATE CONDITIONS (The Branching Logic)
  let nextStepKey = currentStep.nextStep; // Default path

  for (const cond of currentStep.conditions) {
    const variableValue = userConv.userData[cond.variable] || messageText;
    let match = false;

    switch (cond.operator) {
      case "EQUALS":
        match = variableValue.toLowerCase() === cond.value.toLowerCase();
        break;
      case "CONTAINS":
        match = variableValue.toLowerCase().includes(cond.value.toLowerCase());
        break;
      case "GREATER_THAN":
        match = parseFloat(variableValue) > parseFloat(cond.value);
        break;
      case "LESS_THAN":
        match = parseFloat(variableValue) < parseFloat(cond.value);
        break;
      case "REGEX":
        match = new RegExp(cond.value).test(variableValue);
        break;
    }

    if (match) {
      nextStepKey = cond.nextStep;
      break; // First matching condition wins
    }
  }

  // 6. MOVE TO NEXT STEP
  if (nextStepKey) {
    const nextStep = await prisma.flowStep.findFirst({
      where: { flowId: userConv.flowId, stepKey: nextStepKey },
    });

    if (nextStep) {
      await sendText(userId, nextStep.message || "");

      // Update user's current position in the flow
      await prisma.userConversation.update({
        where: { id: userConv.id },
        data: { currentStepKey: nextStep.stepKey },
      });

      if (nextStep.isEnd) {
        // Reset conversation so they can start again later
        await prisma.userConversation.delete({ where: { id: userConv.id } });
      }
    }
  }
}

module.exports = { processIncomingMessage };
