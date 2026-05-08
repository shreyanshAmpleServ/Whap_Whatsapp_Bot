// const { handleMessage } = require("./messageHandler");
const logger = require("../utils/logger");
const config = require("../../config/config");
const { handleMessage } = require("./newMessageHandler");

/**
 * Process incoming Whapi.Cloud webhook payload
 * Whapi sends batches of messages/events
 */
async function processWebhook(payload) {
  if (payload.messages && Array.isArray(payload.messages)) {
    for (const message of payload.messages) {
      try {
        if (message.from_me || message.source === "api") {
          continue;
        }
        const allowedNumbers = config.number
          .split(",")
          .map((num) => num.trim());

        const incoming = message.from.slice(-10);

        const isAgent = allowedNumbers.includes(incoming);

        const chatId = message.chat_id;

        // ignore groups
        if (chatId.endsWith("@g.us")) continue;

        console.log(`User: ${incoming} → ${isAgent ? "AGENT" : "DRIVER"}`);

        // 👇 Inject role into message
        message.userRole = isAgent ? "DRIVER" : "AGENT";

        if (message.userRole == "AGENT") {
          console.log("Other message: ");
          return;
        }

        await handleMessage(message);
      } catch (err) {
        logger.error(`Error processing message: ${err.message}`);
      }
    }
  }

  // statuses
  if (payload.statuses && Array.isArray(payload.statuses)) {
    for (const status of payload.statuses) {
      handleStatus(status);
    }
  }

  // contacts
  if (payload.contacts && Array.isArray(payload.contacts)) {
    for (const contact of payload.contacts) {
      logger.info(`Contact update: ${contact.id} — ${contact.name}`);
    }
  }

  // groups
  if (payload.groups && Array.isArray(payload.groups)) {
    for (const group of payload.groups) {
      logger.info(`Group event: ${group.id}`);
    }
  }
}
// async function processWebhook(payload) {
//   if (payload.messages && Array.isArray(payload.messages)) {
//     for (const message of payload.messages) {
//  if (message.from_me || message.source === "api") {
//     continue;
//   }
//       try {
//         const allowedNumbers = config.number
//           .split(",")
//           .map((num) => num.trim());
//         // config.number;
//         console.log(
//           "Check",
//           typeof message.from,
//           typeof allowedNumbers[0],
//           allowedNumbers.includes(message.from.slice(-10)),
//         );
//         if (!allowedNumbers.includes(message.from.slice(-10))) {
//           console.log("Number not allowed:", message.from.slice(-10));
//           return; // stop here
//         }
//         const chatId = message.chat_id;

//         console.log(
//           "Processing message from chat:",
//           chatId.endsWith("@g.us") ? "Group" : "Individual",
//           " — ",
//           payload,
//         );
//         // ignore groups early
//         if (chatId.endsWith("@g.us")) continue;

//         await handleMessage(message);
//       } catch (err) {
//         logger.error(`Error processing message: ${err.message}`);
//       }
//     }
//   }

//   // Handle status updates (message delivery, read receipts)
//   if (payload.statuses && Array.isArray(payload.statuses)) {
//     for (const status of payload.statuses) {
//       handleStatus(status);
//     }
//   }

//   // Handle contact/profile updates
//   if (payload.contacts && Array.isArray(payload.contacts)) {
//     for (const contact of payload.contacts) {
//       logger.info(`Contact update: ${contact.id} — ${contact.name}`);
//     }
//   }

//   // Handle group events
//   if (payload.groups && Array.isArray(payload.groups)) {
//     for (const group of payload.groups) {
//       logger.info(`Group event: ${group.id} — ${group.action || "update"}`);
//     }
//   }
// }

function handleStatus(status) {
  const { id, status: st, chat_id } = status;
  logger.info(`Message ${id} in ${chat_id}: ${st}`);
}

module.exports = { processWebhook };
