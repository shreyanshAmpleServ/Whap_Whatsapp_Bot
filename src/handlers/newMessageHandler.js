const whapi = require("../services/whapi");
const session = require("../services/sessionStore");
const { checkImageBlur, checkMediaBlur } = require("../utils/blurCheck");

// ============================================================
// ENTRY POINT
// ============================================================
async function handleMessage(message) {
  try {
    const { type, from, chat_id, from_me } = message;
    console.log("Message : getttttt", message);

    if (from_me) return;

    const userId = from;
    const text = (message.text?.body || "").trim();
    // ============================
    // 🔥 HANDLE BUTTON / INTERACTIVE
    // ============================
    if (type === "interactive") {
      return handleInteractive(message);
    }
    if (type === "reply") {
      return handleReply(message);
    }
    // 1. Handle image upload
    if (type === "image" || type == "document") {
      return handleImage(message);
    }
    (console.log("????????", session.get(userId)), session.getState(userId));
    // 2. Handle active flow
    const state = session.getState(userId);
    if (state) {
      const handled = await handleFlow(message, state);
      if (handled) return;
    }

    // 3. Default fallback
    await whapi.sendText(
      chat_id,
      "📸 Please send an image to start the process.",
    );
  } catch (err) {
    console.error("Error:", err.message);
  }
}

// ============================================================
// IMAGE HANDLER
// ============================================================
async function handleImage(message) {
  const { chat_id, type, from: userId, userRole } = message;
  console.log("Media Handle ");
  const media = message.image || message.document;
  if (type !== "image" && type !== "document") {
    console.log("Not get IMages  >>", media);
    return; // ignore other types
  }
  if (!media) {
    await whapi.sendText(chat_id, "❌ Unsupported file.");
    return;
  }

  const mime = media.mime_type || "";
  const fileName = media.file_name || "file";

  console.log("!!!!Not Get Media Url", media);
  const mediaUrl = await whapi.downloadMedia(media.id);
  console.log("Not Get Media Url", mediaUrl);
  if (!mediaUrl) {
    await whapi.sendText(chat_id, "❌ Failed to fetch file.");
    return;
  }

  // ============================================================
  // 🖼️ IMAGE (blur check)
  // ============================================================
  if (mime.startsWith("image/")) {
    // ⚡ quick low-quality check
    if (media.file_size && media.file_size < 20000) {
      await whapi.sendText(
        chat_id,
        "❌ Image quality too low. Please upload a clearer photo.",
      );
      return;
    }

    // const isBlurry = await checkMediaBlur(mediaUrl, mime);
    const result = await checkMediaBlur(mediaUrl, mime);
    console.log("Languange ", result);

    if (result.isBlurry) {
      await whapi.sendText(chat_id, getMessage(result.lang, "blurry"));
      return;
    }

    // if (isBlurry) {
    //   await whapi.sendText(
    //     chat_id,
    //     "❌ The image is blurry. Please upload a clear one.",
    //   );
    //   return;
    // }

    return handleDocumentFlow(chat_id, userId, userRole, (lang = result.lang));
  }

  // ============================================================
  // 📄 PDF (blur check)
  // ============================================================
  if (mime === "application/pdf") {
    const isBlurry = await checkMediaBlur(mediaUrl, mime);

    if (isBlurry) {
      await whapi.sendText(
        chat_id,
        "❌ The PDF contains blurry pages. Please upload a clear document.",
      );
      return;
    }

    return handleDocumentFlow(chat_id, userId, userRole, (lang = result.lang));
  }

  // ============================================================
  // 📊 DATA FILES (CSV / Excel)
  // ============================================================
  if (
    mime === "text/csv" ||
    mime.includes("excel") ||
    mime.includes("spreadsheet")
  ) {
    await whapi.sendText(
      chat_id,
      `📊 File received: *${fileName}*\n\n` +
        `No image quality check required.\nProcessing data file...`,
    );

    return;
  }

  // ============================================================
  // 📄 OTHER DOCUMENTS
  // ============================================================
  await whapi.sendText(
    chat_id,
    `📄 File received: *${fileName}*\n\n` +
      `This file type is not supported for blur validation.`,
  );
}
async function handleDocumentFlow(chatId, userId, userRole, lang = "english") {
  const msg = messages[lang] || messages.english;
  const titles = buttonTitles[lang] || buttonTitles.english;

  // ============================
  // 🧑‍💼 AGENT FLOW
  // ============================
  if (userRole === "AGENT") {
    session.setState(userId, "AGENT_TRANSACTION", { lang });

    return whapi.sendText(chatId, msg.enterTransaction);
  }

  // ============================
  // 🚚 DRIVER FLOW
  // ============================
  session.setState(userId, "DRIVER_DOC_TYPE", { lang });

  return whapi.sendButtons(chatId, msg.selectDoc, [
    { id: "doc_pod", title: titles.pod },
    { id: "doc_receipt", title: titles.receipt },
    { id: "doc_other", title: titles.other },
  ]);
}
const buttonTitles = {
  english: {
    pod: "POD",
    receipt: "Receipt",
    other: "Other",
  },
  hindi: {
    pod: "पीओडी",
    receipt: "रसीद",
    other: "अन्य",
  },
  arabic: {
    pod: "إثبات التسليم",
    receipt: "إيصال",
    other: "أخرى",
  },
  swahili: {
    pod: "POD",
    receipt: "Risiti",
    other: "Nyingine",
  },
};
// async function handleDocumentFlow(chatId, userId, userRole) {
//   // ============================
//   // 🧑‍💼 AGENT FLOW
//   // ============================
//   if (userRole === "AGENT") {
//     session.setState(userId, "AGENT_TRANSACTION");

//     return whapi.sendText(
//       chatId,
//       "📑 Enter *Transaction Type* (e.g., Invoice, SO):",
//     );
//   }

//   // ============================
//   // 🚚 DRIVER FLOW
//   // ============================
//   session.setState(userId, "DRIVER_DOC_TYPE");

//   return whapi.sendButtons(chatId, "📦 Select document type:", [
//     { id: "doc_pod", title: "POD" },
//     { id: "doc_receipt", title: "Receipt" },
//     { id: "doc_other", title: "Other" },
//   ]);
// }
function getMessage(lang, type) {
  const messages = {
    english: {
      blurry: "❌ The image is blurry. Please upload a clear one.",
    },
    hindi: {
      blurry: "❌ छवि धुंधली है, कृपया साफ़ फोटो अपलोड करें।",
    },
    arabic: {
      blurry: "❌ الصورة غير واضحة، يرجى رفع صورة واضحة.",
    },
    swahili: {
      blurry: "❌ Picha haiko wazi, tafadhali pakia picha safi.",
    },
  };

  return messages[lang]?.[type] || messages.english[type];
}
// ============================================================
// BUTTON HANDLER
// ============================================================
// async function handleInteractive(message) {
//   const { chat_id, from: userId, interactive } = message;

//   const btnId = interactive?.button_reply?.id || interactive?.list_reply?.id;

//   if (!btnId) return;

//   // DRIVER FLOW
//   if (btnId === "user_driver") {
//     session.setState(userId, "DRIVER_DOC_TYPE");

//     return whapi.sendButtons(chat_id, "📦 Select document type:", [
//       { id: "doc_pod", title: "POD" },
//       { id: "doc_receipt", title: "Receipt" },
//       { id: "doc_other", title: "Other" },
//     ]);
//   }

//   if (["doc_pod", "doc_receipt", "doc_other"].includes(btnId)) {
//     const typeMap = {
//       doc_pod: "POD",
//       doc_receipt: "Receipt",
//       doc_other: "Other",
//     };

//     session.delete(userId);

//     return whapi.sendText(
//       chat_id,
//       `✅ *${typeMap[btnId]}* document received successfully.`,
//     );
//   }

//   // AGENT FLOW
//   if (btnId === "user_agent") {
//     session.setState(userId, "AGENT_TRANSACTION");

//     return whapi.sendText(
//       chat_id,
//       "📑 Enter *Transaction Type*\n(e.g., Invoice, SO):",
//     );
//   }

//   if (["agent_gatepass", "agent_intercity", "agent_other"].includes(btnId)) {
//     const data = session.get(userId);

//     const typeMap = {
//       agent_gatepass: "Gate Pass",
//       agent_intercity: "Intercity",
//       agent_other: "Other",
//     };

//     session.delete(userId);

//     return whapi.sendText(
//       chat_id,
//       `✅ Document submitted!\n\n` +
//         `📑 Transaction: *${data.transactionType}*\n` +
//         `🔢 Doc No: *${data.docNumber}*\n` +
//         `📄 Type: *${typeMap[btnId]}*`,
//     );
//   }
// }
async function handleInteractive(message) {
  const { chat_id, from: userId, interactive } = message;

  const btnId = interactive?.button_reply?.id || interactive?.list_reply?.id;
  if (!btnId) return;

  const stateData = session.get(userId) || {};
  const lang = stateData.lang || "english";
  const msg = messages[lang];
  console.log("GEt ", lang, stateData, session);
  // DRIVER FLOW
  if (btnId === "user_driver") {
    session.setState(userId, "DRIVER_DOC_TYPE", { lang });

    return whapi.sendButtons(chat_id, msg.selectDoc, [
      { id: "doc_pod", title: "POD" },
      { id: "doc_receipt", title: "Receipt" },
      { id: "doc_other", title: "Other" },
    ]);
  }

  // if (["doc_pod", "doc_receipt", "doc_other"].includes(btnId)) {
  //   const typeMap = {
  //     doc_pod: "POD",
  //     doc_receipt: "Receipt",
  //     doc_other: "Other",
  //   };

  //   session.delete(userId);

  //   return whapi.sendText(chat_id, msg.successDoc(typeMap[btnId]));
  // }
  if (["ButtonsV3:doc_pod", "ButtonsV3:doc_receipt"].includes(btnId)) {
    const typeMap = {
      "ButtonsV3:doc_pod": "POD",
      "ButtonsV3:doc_receipt": "Receipt",
    };
    if (typeMap[btnId]) {
      session.delete(userId);
      return whapi.sendText(chat_id, msg.successDoc(typeMap[btnId]));
    } else {
      await whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
  }

  // OTHER BUTTON FLOW
  if (btnId == "ButtonsV3:doc_other") {
    session.setState(userId, "DRIVER_OTHER_INPUT", {
      lang,
    });

    return whapi.sendText(chat_id, "📝 Please enter other document type:");
  }

  // AGENT FLOW
  if (btnId === "user_agent") {
    session.setState(userId, "AGENT_TRANSACTION", { lang });

    return whapi.sendText(chat_id, msg.enterTransaction);
  }

  // if (["agent_gatepass", "agent_intercity", "agent_other"].includes(btnId)) {
  //   const data = session.get(userId);

  //   const typeMap = {
  //     agent_gatepass: "Gate Pass",
  //     agent_intercity: "Intercity",
  //     agent_other: "Other",
  //   };

  //   session.delete(userId);

  //   return whapi.sendText(chat_id, msg.submitted(data, typeMap[btnId]));
  // }
  if (["agent_gatepass", "agent_intercity"].includes(btnId)) {
    const data = session.get(userId);

    const typeMap = {
      agent_gatepass: "Gate Pass",
      agent_intercity: "Intercity",
    };
    if (typeMap[btnId]) {
      session.delete(userId);
      return whapi.sendText(chat_id, msg.submitted(data, typeMap[btnId]));
    } else {
      await whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
    // session.delete(userId);

    // return whapi.sendText(chat_id, msg.submitted(data, typeMap[btnId]));
  }

  // AGENT OTHER FLOW
  if (btnId === "agent_other") {
    const data = session.get(userId);

    session.setState(userId, "AGENT_OTHER_INPUT", {
      ...data,
      lang,
    });

    return whapi.sendText(chat_id, "📝 Please enter other document type:");
  }
}
async function handleReply(message) {
  const { chat_id, from: userId, reply } = message;
  console.log("Reply message", message);
  const btnId = reply?.buttons_reply?.id || reply?.buttons_reply?.id;
  if (!btnId) return;

  const stateData = session.get(userId) || {};
  const lang = stateData.lang || "english";
  const msg = messages[lang];
  // DRIVER FLOW
  if (btnId === "user_driver") {
    session.setState(userId, "DRIVER_DOC_TYPE", { lang });

    return whapi.sendButtons(chat_id, msg.selectDoc, [
      { id: "doc_pod", title: "POD" },
      { id: "doc_receipt", title: "Receipt" },
      { id: "doc_other", title: "Other" },
    ]);
  }

  // if (["doc_pod", "doc_receipt", "doc_other"].includes(btnId)) {
  //   const typeMap = {
  //     doc_pod: "POD",
  //     doc_receipt: "Receipt",
  //     doc_other: "Other",
  //   };

  //   session.delete(userId);

  //   return whapi.sendText(chat_id, msg.successDoc(typeMap[btnId]));
  // }
  if (["ButtonsV3:doc_pod", "ButtonsV3:doc_receipt"].includes(btnId)) {
    const typeMap = {
      doc_pod: "POD",
      doc_receipt: "Receipt",
    };
    if (typeMap[btnId]) {
      session.delete(userId);
      return whapi.sendText(chat_id, msg.successDoc(typeMap[btnId]));
    } else {
      await whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
  }

  // OTHER BUTTON FLOW
  if (btnId === "ButtonsV3:doc_other") {
    session.setState(userId, "DRIVER_OTHER_INPUT", {
      lang,
    });

    return whapi.sendText(chat_id, "📝 Please enter other document type:");
  }

  // AGENT FLOW
  if (btnId === "user_agent") {
    session.setState(userId, "AGENT_TRANSACTION", { lang });

    return whapi.sendText(chat_id, msg.enterTransaction);
  }
  // AGENT FLOW
  if (btnId === "user_agent") {
    session.setState(userId, "AGENT_TRANSACTION", { lang });

    return whapi.sendText(chat_id, msg.enterTransaction);
  }
  if (["ButtonsV3:agent_other"].includes(btnId)) {
    const data = session.get(userId);

    session.setState(userId, "AGENT_OTHER_INPUT", {
      ...data,
      lang,
    });

    return whapi.sendText(chat_id, "📝 Please enter other document type:");
  }
  if (
    [
      "ButtonsV3:agent_gatepass",
      "ButtonsV3:agent_intercity",
      "ButtonsV3:agent_other",
    ].includes(btnId)
  ) {
    const data = session.get(userId);

    const typeMap = {
      agent_gatepass: "Gate Pass",
      agent_intercity: "Intercity",
      agent_other: "Other",
    };

    session.delete(userId);
    if (typeMap[btnId]) {
      return whapi.sendText(chat_id, msg.submitted(data, typeMap[btnId]));
    } else {
      return whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
  }
}
// ============================================================
// FLOW HANDLER
// ============================================================
async function handleFlow(message, state) {
  const { chat_id, from: userId } = message;
  const text = (message.text?.body || "").trim();

  const stateData = session.get(userId) || {};
  const lang = stateData.lang || "english";
  const msg = messages[lang];
  console.log("STATE : ", state);
  switch (state) {
    case "AGENT_TRANSACTION": {
      session.setState(userId, "AGENT_DOC_NUMBER", {
        ...stateData,
        transactionType: text,
      });

      await whapi.sendText(chat_id, msg.enterDocNo);
      return true;
    }

    case "AGENT_DOC_NUMBER": {
      const data = session.get(userId);

      session.setState(userId, "AGENT_DOC_TYPE", {
        ...data,
        docNumber: text,
      });

      await whapi.sendButtons(chat_id, msg.selectDocType, [
        { id: "agent_gatepass", title: "Gate Pass" },
        { id: "agent_intercity", title: "Intercity" },
        { id: "agent_other", title: "Other" },
      ]);

      return true;
    }
    case "DRIVER_OTHER_INPUT": {
      const otherType = text;

      session.delete(userId);

      await whapi.sendText(
        chat_id,
        `✅ Other document type received: *${otherType}*`,
      );

      return true;
    }

    case "AGENT_OTHER_INPUT": {
      const data = session.get(userId);
      const otherType = text;

      session.delete(userId);

      await whapi.sendText(
        chat_id,
        `✅ Document submitted!\n\n` +
          `📑 Transaction: *${data.transactionType}*\n` +
          `🔢 Doc No: *${data.docNumber}*\n` +
          `📄 Type: *${otherType}*`,
      );

      return true;
    }

    default:
      return false;
  }
}
// async function handleFlow(message, state) {
//   const { chat_id, from: userId } = message;
//   const text = (message.text?.body || "").trim();

//   switch (state) {
//     case "AGENT_TRANSACTION": {
//       session.setState(userId, "AGENT_DOC_NUMBER", {
//         transactionType: text,
//       });

//       await whapi.sendText(chat_id, "🔢 Enter *Document Number*:");
//       return true;
//     }

//     case "AGENT_DOC_NUMBER": {
//       const data = session.get(userId);

//       session.setState(userId, "AGENT_DOC_TYPE", {
//         ...data,
//         docNumber: text,
//       });

//       await whapi.sendButtons(chat_id, "📄 Select Document Type:", [
//         { id: "agent_gatepass", title: "Gate Pass" },
//         { id: "agent_intercity", title: "Intercity" },
//         { id: "agent_other", title: "Other" },
//       ]);

//       return true;
//     }

//     default:
//       return false;
//   }
// }
const messages = {
  english: {
    selectDoc: "📦 Select document type:",
    enterTransaction: "📑 Enter *Transaction Type* (e.g., Invoice, SO):",
    enterDocNo: "🔢 Enter *Document Number*:",
    selectDocType: "📄 Select Document Type:",
    successDoc: (type) => `✅ *${type}* document received successfully.`,
    submitted: (data, type) =>
      `✅ Document submitted!\n\n` +
      `📑 Transaction: *${data.transactionType}*\n` +
      `🔢 Doc No: *${data.docNumber}*\n` +
      `📄 Type: *${type}*`,
  },

  hindi: {
    selectDoc: "📦 दस्तावेज़ प्रकार चुनें:",
    enterTransaction: "📑 Transaction type दर्ज करें (जैसे- Invoice,SO):",
    enterDocNo: "🔢 दस्तावेज़ संख्या दर्ज करें:",
    selectDocType: "📄 दस्तावेज़ प्रकार चुनें:",
    successDoc: (type) => `✅ *${type}* दस्तावेज़ सफलतापूर्वक प्राप्त हुआ।`,
    submitted: (data, type) =>
      `✅ दस्तावेज़ जमा किया गया!\n\n` +
      `📑 Transaction: *${data.transactionType}*\n` +
      `🔢 दस्तावेज़ संख्या: *${data.docNumber}*\n` +
      `📄 प्रकार: *${type}*`,
  },

  arabic: {
    selectDoc: "📦 اختر نوع المستند:",
    enterTransaction: "📑 أدخل نوع المعاملة:",
    enterDocNo: "🔢 أدخل رقم المستند:",
    selectDocType: "📄 اختر نوع المستند:",
    successDoc: (type) => `✅ تم استلام مستند *${type}* بنجاح.`,
    submitted: (data, type) =>
      `✅ تم إرسال المستند!\n\n` +
      `📑 المعاملة: *${data.transactionType}*\n` +
      `🔢 رقم المستند: *${data.docNumber}*\n` +
      `📄 النوع: *${type}*`,
  },

  swahili: {
    selectDoc: "📦 Chagua aina ya hati:",
    enterTransaction: "📑 Ingiza aina ya muamala:",
    enterDocNo: "🔢 Ingiza nambari ya hati:",
    selectDocType: "📄 Chagua aina ya hati:",
    successDoc: (type) => `✅ Hati ya *${type}* imepokelewa.`,
    submitted: (data, type) =>
      `✅ Hati imewasilishwa!\n\n` +
      `📑 Muamala: *${data.transactionType}*\n` +
      `🔢 Namba: *${data.docNumber}*\n` +
      `📄 Aina: *${type}*`,
  },
};
// ============================================================
// EXPORT
// ============================================================

module.exports = {
  handleMessage,
  handleInteractive,
};
