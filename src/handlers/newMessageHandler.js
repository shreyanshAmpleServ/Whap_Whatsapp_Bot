const session = require("../services/sessionStore");
const { checkMediaBlur } = require("../utils/blurCheck");
const WhapiService = require("../services/whapi");
const axios = require("axios");
const uploadFileToNG = require("../utils/backblaze");
const fs = require("fs");
const mimeTypes = require("mime-types");
const path = require("path");

// ============================================================
// ENTRY POINT
// ============================================================
async function handleMessage(message) {
  try {
    const { type, from, chat_id, from_me, whapi_token } = message;
    console.log("Message : getttttt", message);
    const whapi = new WhapiService(whapi_token);
    if (from_me) return;

    const userId = from;
    const text = (message.text?.body || "").trim();

    // 1. Handle image upload
    if (type === "image" || type == "document") {
      return handleImage(message, whapi);
    }
    const state = await session.getState(userId);

    if (!state || (state && Object.keys(state).length == 0)) {
      return whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
    if (type === "interactive") {
      return handleInteractive(message, whapi);
    }
    if (type === "reply") {
      return handleReply(message, whapi);
    }

    (console.log("????????", await session.get(userId)),
      await session.getState(userId));
    // 2. Handle active flow

    if (state) {
      const handled = await handleFlow(message, state, whapi);
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
async function handleImage(message, whapi) {
  const { chat_id, type, from: userId, userRole } = message;
  console.log("Media Handle ");
  const media = message.image || message.document;
  if (type !== "image" && type !== "document") {
    return; // ignore other types
  }
  if (!media) {
    await whapi.sendText(chat_id, "❌ Unsupported file.");
    return;
  }

  const mime = media.mime_type || "";
  // const fileName = media.file_name || "file";

  // console.log("!!!!Not Get Media Url", media);
  // const mediaUrl = await whapi.downloadMedia(media.id);
  // console.log("Not Get Media Url", mediaUrl);
  // if (!mediaUrl) {
  //   await whapi.sendText(chat_id, "❌ Failed to fetch file.");
  //   return;
  // }
  // ============================================================
  // MIME + EXTENSION
  // ============================================================
  const mimeType = media.mime_type || "image/jpeg";

  const extension = mimeTypes.extension(mimeType) || "jpg";

  // ============================================================
  // GENERATE FILE NAME
  // ============================================================
  const fileName = media.file_name || `image_${Date.now()}.${extension}`;

  console.log("Generated File Name :", fileName);

  // ============================================================
  // DOWNLOAD MEDIA BUFFER
  // ============================================================
  const mediaBuffer = await whapi.downloadMedia(media.id);

  if (!mediaBuffer) {
    await whapi.sendText(chat_id, "❌ Failed to fetch file.");
    return;
  }
  // ============================================================
  // CREATE src/uploads DIRECTORY
  // ============================================================
  const uploadsDir = path.join(process.cwd(), "src", "uploads");

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // ============================================================
  // SAVE FILE
  // ============================================================
  const tempPath = path.join(uploadsDir, fileName);

  fs.writeFileSync(tempPath, mediaBuffer);

  console.log("Saved File :", tempPath);

  // const uploadsDir = path.join(__dirname, "uploads");

  // if (!fs.existsSync(uploadsDir)) {
  //   fs.mkdirSync(uploadsDir, { recursive: true });
  // }
  // const tempPath = path.join(uploadsDir, `${Date.now()}_${fileName}`);

  // fs.writeFileSync(tempPath, mediaUrl);

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
    const result = await checkMediaBlur(mediaBuffer, mime);
    console.log("Languange ", result);

    if (result.isBlurry) {
      await whapi.sendText(chat_id, getMessage(result.lang, "blurry"));
      return;
    }
    // ============================================================
    // UPLOAD TO NG API
    // ============================================================
    const uploadRes = await uploadFileToNG({
      filePath: tempPath,
      fileName,
      mimeType: mime,
      docType: type,
    });
    // ============================================================
    // GET PUBLIC URL
    // ============================================================
    const publicUrl = uploadRes?.data?.public_url || uploadRes?.public_url;

    console.log("PUBLIC URL :", publicUrl);

    // ============================================================
    // DELETE LOCAL FILE AFTER UPLOAD
    // ============================================================
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
      console.log("Local file deleted :", tempPath);
    }

    return handleDocumentFlow(
      chat_id,
      userId,
      userRole,
      (lang = result.lang),
      whapi,
      publicUrl,
      (docPath = tempPath),
    );
  }

  // ============================================================
  // 📄 PDF (blur check)
  // ============================================================
  if (mime === "application/pdf") {
    const isBlurry = await checkMediaBlur(mediaBuffer, mime);

    if (isBlurry) {
      await whapi.sendText(
        chat_id,
        "❌ The PDF contains blurry pages. Please upload a clear document.",
      );
      return;
    }
    // ============================================================
    // UPLOAD TO NG API
    // ============================================================
    const uploadRes = await uploadFileToNG({
      filePath: tempPath,
      fileName,
      mimeType: mime,
      docType: type,
    });
    // ============================================================
    // GET PUBLIC URL
    // ============================================================
    const publicUrl = uploadRes?.data?.public_url || uploadRes?.public_url;

    console.log("PUBLIC URL :", publicUrl);

    // ============================================================
    // DELETE LOCAL FILE AFTER UPLOAD
    // ============================================================
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
      console.log("Local file deleted :", tempPath);
    }
    return handleDocumentFlow(
      chat_id,
      userId,
      userRole,
      (lang = result.lang),
      whapi,
      publicUrl,
      (docPath = tempPath),
    );
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
async function handleDocumentFlow(
  chatId,
  userId,
  userRole,
  lang = "english",
  whapi,
  publicUrl,
  docPath,
) {
  const msg = messages[lang] || messages.english;
  const titles = buttonTitles[lang] || buttonTitles.english;
  const agentTitles = agentButtonTitles[lang] || agentButtonTitles.english;

  // ============================
  // 🧑‍💼 AGENT FLOW
  // ============================
  if (userRole === "AGENT") {
    session.setState(userId, "AGENT_TRANSACTION", {
      lang,
      docUrl: publicUrl,
      docPath,
    });
    return whapi.sendButtons(chatId, msg.enterTransaction, [
      { id: "agent_shipmentOrder", title: agentButtonTitles.shipmentOrder },
      { id: "agent_fileMaster", title: agentButtonTitles.fileMaster },
      { id: "agent_booking", title: agentButtonTitles.booking },
    ]);
    // return whapi.sendText(chatId, msg.enterTransaction);
  }

  // ============================
  // 🚚 DRIVER FLOW
  // ============================
  session.setState(userId, "DRIVER_DOC_TYPE", {
    lang,
    docUrl: publicUrl,
    docPath,
  });

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
const agentButtonTitles = {
  english: {
    shipmentOrder: "Shipment Order",
    fileMaster: "File Master",
    booking: "Booking",
  },
  hindi: {
    shipmentOrder: "शिपमेंट ऑर्डर",
    fileMaster: "फ़ाइल मास्टर",
    booking: "बुकिंग",
  },
  arabic: {
    shipmentOrder: "أمر الشحنة",
    fileMaster: "ملف رئيسي",
    booking: "الحجز",
  },
  swahili: {
    shipmentOrder: "Agizo la Usafirishaji",
    fileMaster: "Faili Kuu",
    booking: "Uhifadhi",
  },
};
// async function handleDocumentFlow(chatId, userId, userRole) {
//   // ============================
//   // 🧑‍💼 AGENT FLOW
//   // ============================
//   if (userRole === "AGENT") {
//    await session.setState(userId, "AGENT_TRANSACTION");

//     return whapi.sendText(
//       chatId,
//       "📑 Enter *Transaction Type* (e.g., Invoice, SO):",
//     );
//   }

//   // ============================
//   // 🚚 DRIVER FLOW
//   // ============================
//  await session.setState(userId, "DRIVER_DOC_TYPE");

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
// async function handleInteractive(message) {
//   const { chat_id, from: userId, interactive } = message;

//   const btnId = interactive?.button_reply?.id || interactive?.list_reply?.id;

//   if (!btnId) return;

//   // DRIVER FLOW
//   if (btnId === "user_driver") {
//    await session.setState(userId, "DRIVER_DOC_TYPE");

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

//     await session.delete(userId);

//     return whapi.sendText(
//       chat_id,
//       `✅ *${typeMap[btnId]}* document received successfully.`,
//     );
//   }

//   // AGENT FLOW
//   if (btnId === "user_agent") {
//    await session.setState(userId, "AGENT_TRANSACTION");

//     return whapi.sendText(
//       chat_id,
//       "📑 Enter *Transaction Type*\n(e.g., Invoice, SO):",
//     );
//   }

//   if (["agent_gatepass", "agent_intercity", "agent_other"].includes(btnId)) {
//     const data = await session.get(userId);

//     const typeMap = {
//       agent_gatepass: "Gate Pass",
//       agent_intercity: "Intercity",
//       agent_other: "Other",
//     };

//     await session.delete(userId);

//     return whapi.sendText(
//       chat_id,
//       `✅ Document submitted!\n\n` +
//         `📑 Transaction: *${data.transactionType}*\n` +
//         `🔢 Doc No: *${data.docNumber}*\n` +
//         `📄 Type: *${typeMap[btnId]}*`,
//     );
//   }
// }
async function handleInteractive(message, whapi) {
  const { chat_id, from: userId, interactive } = message;

  const btnId = interactive?.button_reply?.id || interactive?.list_reply?.id;
  if (!btnId) return;

  const stateData = (await session.get(userId)) || {};
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

  //   await session.delete(userId);

  //   return whapi.sendText(chat_id, msg.successDoc(typeMap[btnId]));
  // }
  if (["ButtonsV3:doc_pod", "ButtonsV3:doc_receipt"].includes(btnId)) {
    const typeMap = {
      "ButtonsV3:doc_pod": "POD",
      "ButtonsV3:doc_receipt": "Receipt",
    };
    if (typeMap[btnId]) {
      await session.delete(userId);
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
    await session.setState(userId, "DRIVER_OTHER_INPUT", {
      lang,
    });

    return whapi.sendText(chat_id, "📝 Please enter other document type:");
  }

  // AGENT FLOW
  if (btnId === "user_agent") {
    await session.setState(userId, "AGENT_TRANSACTION", { lang });

    return whapi.sendText(chat_id, msg.enterTransaction);
  }

  // if (["agent_gatepass", "agent_intercity", "agent_other"].includes(btnId)) {
  //   const data = await session.get(userId);

  //   const typeMap = {
  //     agent_gatepass: "Gate Pass",
  //     agent_intercity: "Intercity",
  //     agent_other: "Other",
  //   };

  //   await session.delete(userId);

  //   return whapi.sendText(chat_id, msg.submitted(data, typeMap[btnId]));
  // }
  if (["agent_gatepass", "agent_intercity"].includes(btnId)) {
    const data = await session.get(userId);

    const typeMap = {
      agent_gatepass: "Gate Pass",
      agent_intercity: "Intercity",
    };
    if (typeMap[btnId]) {
      await session.delete(userId);
      return whapi.sendText(chat_id, msg.submitted(data, typeMap[btnId]));
    } else {
      await whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
    // await session.delete(userId);

    // return whapi.sendText(chat_id, msg.submitted(data, typeMap[btnId]));
  }

  // AGENT OTHER FLOW
  if (btnId === "agent_other") {
    const data = await session.get(userId);

    await session.setState(userId, "AGENT_OTHER_INPUT", {
      ...data,
      lang,
    });

    return whapi.sendText(chat_id, "📝 Please enter other document type:");
  }
}
async function handleReply(message, whapi) {
  const { chat_id, from: userId, reply } = message;
  const btnId = reply?.buttons_reply?.id || reply?.buttons_reply?.id;
  if (!btnId) return;

  const stateData = (await session.get(userId)) || {};
  const lang = stateData.lang || "english";
  const msg = messages[lang];
  console.log("Reply message", stateData, btnId, message);
  // DRIVER FLOW
  if (btnId === "user_driver") {
    await session.setState(userId, "DRIVER_DOC_TYPE", { lang });

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

  //   await session.delete(userId);

  //   return whapi.sendText(chat_id, msg.successDoc(typeMap[btnId]));
  // }
  if (["ButtonsV3:doc_pod", "ButtonsV3:doc_receipt"].includes(btnId)) {
    const typeMap = {
      "ButtonsV3:doc_pod": "POD",
      "ButtonsV3:doc_receipt": "Receipt",
    };
    const sessionData = await session.get(userId);
    console.log("Session Data for Reply", sessionData);
    if (typeMap[btnId]) {
      await session.delete(userId);
      return whapi.sendText(
        chat_id,
        msg.successDoc(typeMap[btnId], sessionData.docUrl || "N/A"),
      );
    } else {
      await whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
  }
  if (
    [
      "ButtonsV3:agent_shipmentOrder",
      "ButtonsV3:agent_booking",
      "ButtonsV3:agent_fileMaster",
    ].includes(btnId)
  ) {
    const typeMap = {
      "ButtonsV3:agent_shipmentOrder": "Shipment Order",
      "ButtonsV3:agent_fileMaster": "File Master",
      "ButtonsV3:agent_booking": "Booking",
    };
    const sessionData = await session.get(userId);
    console.log("Session Data for Reply", sessionData);
    if (typeMap[btnId]) {
      await session.setState(userId, "TRANSACTION_SUB_TYPE", {
        lang,
        transactionType: typeMap[btnId],
      });

      return whapi.sendButtons(chatId, msg.enterTransaction, [
        { id: "agent_shipmentOrder", title: agentButtonTitles.shipmentOrder },
        { id: "agent_fileMaster", title: agentButtonTitles.fileMaster },
        { id: "agent_booking", title: agentButtonTitles.booking },
      ]);
    } else {
      await whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
  }
  if (
    [
      "ButtonsV3:agent_shipmentOrder",
      "ButtonsV3:agent_booking",
      "ButtonsV3:agent_fileMaster",
    ].includes(btnId)
  ) {
    const typeMap = {
      "ButtonsV3:agent_shipmentOrder": "Shipment Order",
      "ButtonsV3:agent_fileMaster": "File Master",
      "ButtonsV3:agent_booking": "Booking",
    };
    const sessionData = await session.get(userId);
    console.log("Session Data for Reply", sessionData);
    if (typeMap[btnId]) {
      await session.setState(userId, "AGENT_DOC_NUMBER", {
        lang,
        transactionType: typeMap[btnId],
      });
      return whapi.sendText(chat_id, msg.enterTransactionSubType);
    } else {
      await whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
  }

  // OTHER BUTTON FLOW
  // if (btnId === "ButtonsV3:doc_other") {
  //   await session.setState(userId, "DRIVER_OTHER_INPUT", {
  //     lang,
  //   });
  //   return whapi.sendText(chat_id, "📝 Please enter other document type:");
  // }

  // AGENT FLOW
  if (btnId === "user_agent") {
    await session.setState(userId, "AGENT_TRANSACTION", { lang });

    return whapi.sendText(chat_id, msg.enterTransaction);
  }
  if (["ButtonsV3:agent_other"].includes(btnId)) {
    const data = await session.get(userId);

    if (Object.keys(data).length !== 0) {
      await session.setState(userId, "AGENT_OTHER_INPUT", {
        ...data,
        lang,
      });
      return whapi.sendText(chat_id, "📝 Please enter other document type:");
    } else {
      return whapi.sendText(
        chat_id,
        "📸 Please send an image to start the process.",
      );
    }
  }
  if (
    ["ButtonsV3:agent_gatepass", "ButtonsV3:agent_intercity"].includes(btnId)
  ) {
    const data = await session.get(userId);

    const typeMap = {
      "ButtonsV3:agent_gatepass": "Gate Pass",
      "ButtonsV3:agent_intercity": "Intercity",
      "ButtonsV3:agent_other": "Other",
    };
    console.log("!:!!!!!!", data);
    await session.delete(userId);
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
async function handleFlow(message, state, whapi) {
  const { chat_id, from: userId } = message;
  const text = (message.text?.body || "").trim();

  const stateData = (await session.get(userId)) || {};
  const lang = stateData.lang || "english";
  const msg = messages[lang];
  console.log("STATE : ", state);
  switch (state) {
    // case "AGENT_TRANSACTION": {
    //   session.setState(userId, "AGENT_DOC_NUMBER", {
    //     ...stateData,
    //     transactionType: text,
    //   });

    //   await whapi.sendText(chat_id, msg.enterDocNo);
    //   return true;
    // }

    case "AGENT_DOC_NUMBER": {
      const data = await session.get(userId);

      await session.delete(userId);

      await whapi.sendText(
        chat_id,
        `✅ Document submitted!\n\n` +
          `📑 Transaction: *${data.transactionType}*\n` +
          `🔢 Doc No: *${data.docNumber}*\n` +
          `📄 Type: *${otherType}*`,
      );

      return true;
      // session.setState(userId, "AGENT_DOC_TYPE", {
      //   ...data,
      //   docNumber: text,
      // });

      // await whapi.sendButtons(chat_id, msg.selectDocType, [
      //   { id: "agent_gatepass", title: "Gate Pass" },
      //   { id: "agent_intercity", title: "Intercity" },
      //   { id: "agent_other", title: "Other" },
      // ]);

      // return true;
    }
    case "DRIVER_OTHER_INPUT": {
      const otherType = text;

      await session.delete(userId);

      await whapi.sendText(
        chat_id,
        `✅ Other document type received: *${otherType}*`,
      );

      return true;
    }

    case "AGENT_OTHER_INPUT": {
      const data = await session.get(userId);
      const otherType = text;

      await session.delete(userId);

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
//      await session.setState(userId, "AGENT_DOC_NUMBER", {
//         transactionType: text,
//       });

//       await whapi.sendText(chat_id, "🔢 Enter *Document Number*:");
//       return true;
//     }

//     case "AGENT_DOC_NUMBER": {
//       const data = await session.get(userId);

//      await session.setState(userId, "AGENT_DOC_TYPE", {
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
    enterTransaction: "📑 Enter *Transaction Type* :",
    enterTransactionSubType: "📑 Enter *Transaction Sub Type* :",
    enterDocNo: "🔢 Enter *Document Number*:",
    selectDocType: "📄 Select Document Type:",
    successDoc: (
      type,
      publicUrl,
    ) => `✅ *${type}* document received successfully.
    Document URL: *${publicUrl}*
    Thank you for your patience!`,

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
module.exports = {
  handleMessage,
  handleInteractive,
};
