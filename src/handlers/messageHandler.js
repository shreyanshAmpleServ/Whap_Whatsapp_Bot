/**
 * ============================================================
 *  ADVANCED MESSAGE HANDLER — v2.0
 *  Every incoming WhatsApp message is routed here.
 *
 *  Pipeline:
 *    1. Ignore self / status broadcasts
 *    2. Rate-limit check
 *    3. Mark as read + typing indicator
 *    4. Media handler  (image/video/doc/audio/sticker/voice)
 *    5. Interactive handler (button & list clicks)
 *    6. State-machine flows (multi-step dialogs)
 *    7. Command handler  (!prefix commands)
 *    8. NLP / keyword fallback
 * ============================================================
 */

const whapi = require("../services/whapi");
const session = require("../services/sessionStore");
const { handleCommand } = require("./commandHandler");
const { rateLimiter } = require("../middleware/rateLimiter");
const {
  getGreeting,
  sleep,
  generateId,
  truncate,
} = require("../utils/helpers");
const config = require("../../config/config");
const logger = require("../utils/logger");
const moment = require("moment");

// ── Shared in-memory stores (replace with DB in production) ──────────────────
const polls = new Map(); // pollId → { question, options, votes:{uid→idx} }
const feedbackLog = []; // { from, name, text, at }
const activeTrivia = new Map(); // userId  → triviaIndex

// ═════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════

async function handleMessage(message) {
  try {
    const { type, from, chat_id, from_me, from_name } = message;
    console.log("Message : getttttt", message);
    if (from_me) return; // ignore own messages
    if (chat_id === "status@broadcast") return; // ignore status updates

    const userId = from;
    const text = (message.text?.body || "").trim();

    logger.info(
      `[IN] ${from_name || userId} | type=${type} | "${truncate(text, 60)}"`,
    );

    // 1. Rate limit ─────────────────────────────────────────────────────────
    if (!rateLimiter(userId)) {
      await whapi.sendText(
        chat_id,
        "⏳ *Slow down!* You're sending messages too fast. Please wait a moment.",
      );
      return;
    }

    // 2. Mark as read + typing indicator ────────────────────────────────────
    if (message.id) await whapi.markAsRead(message.id).catch(() => {});
    await whapi.sendTyping(chat_id, 700).catch(() => {});

    // 3. Media messages ─────────────────────────────────────────────────────
    if (
      ["image", "video", "audio", "document", "sticker", "voice"].includes(type)
    ) {
      await handleMedia(message);
      return;
    }

    // 4. Interactive (button / list) replies ────────────────────────────────
    if (type === "interactive") {
      await handleInteractive(message);
      return;
    }

    // 5. Active conversation-flow state ─────────────────────────────────────
    const state = session.getState(userId);
    if (state) {
      const consumed = await handleFlow(message, state);
      if (consumed) return;
    }

    // 6. Prefix commands ────────────────────────────────────────────────────
    if (text.startsWith(config.bot.prefix)) {
      await handleCommand(message);
      return;
    }

    // 7. NLP / keyword fallback ─────────────────────────────────────────────
    await handleNLP(message);
  } catch (err) {
    logger.error(`handleMessage: ${err.message}`, err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MEDIA HANDLER
// ═════════════════════════════════════════════════════════════════════════════

async function handleMedia(message) {
  const { type, chat_id, from_name, image, video, document: doc } = message;
  const name = from_name || "Friend";

  // React to media
  const reacts = {
    image: "📸",
    video: "🎥",
    audio: "🎵",
    document: "📄",
    sticker: "😄",
    voice: "🎙",
  };
  if (message.id)
    await whapi
      .reactToMessage(message.id, chat_id, reacts[type] || "👍")
      .catch(() => {});

  switch (type) {
    case "image":
      await whapi.sendButtons(
        chat_id,
        `📸 *Image received!*${image?.caption ? `\n\nCaption: _${image.caption}_` : ""}\n\nWhat would you like to do?`,
        [
          { id: "img_sticker", title: "🎨 Make Sticker" },
          { id: "img_save", title: "💾 Save Image" },
          { id: "img_describe", title: "🔍 Describe It" },
        ],
        "📸 Image Received",
        "Choose an action below",
      );
      break;

    case "video":
      await whapi.sendButtons(
        chat_id,
        `🎥 *Video received!*${video?.caption ? `\n\nCaption: _${video.caption}_` : ""}\n\nWhat would you like to do?`,
        [
          { id: "vid_gif", title: "🔄 Convert to GIF" },
          { id: "vid_thumb", title: "🖼 Get Thumbnail" },
          { id: "main_menu", title: "📋 Main Menu" },
        ],
        "🎥 Video Received",
      );
      break;

    case "audio":
    case "voice":
      await whapi.sendText(
        chat_id,
        `🎵 *Audio received, ${name}!*\n\n` +
          `Integrate *OpenAI Whisper* or *Google Speech-to-Text* to auto-transcribe voice messages.\n\n` +
          `Type *${config.bot.prefix}menu* to see what else I can do.`,
      );
      break;

    case "document":
      await whapi.sendText(
        chat_id,
        `📄 *Document received!*\n📁 File: *${doc?.file_name || "Unknown"}*\n\n` +
          `Integrate PDF parsing or Google Drive for document processing.\n\n` +
          `Type *${config.bot.prefix}help* for more commands.`,
      );
      break;

    case "sticker":
      await whapi.sendText(
        chat_id,
        `😄 Cool sticker, *${name}*! Type *${config.bot.prefix}joke* for something fun!`,
      );
      break;

    default:
      await whapi.sendText(
        chat_id,
        `📎 *Media received* (type: ${type}). Processing can be added for this format.\n\nType *${config.bot.prefix}menu* to continue.`,
      );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTERACTIVE BUTTON / LIST REPLY HANDLER
// ═════════════════════════════════════════════════════════════════════════════

async function handleInteractive(message) {
  const { chat_id, from: userId, from_name, interactive } = message;
  const btnId = interactive?.button_reply?.id || interactive?.list_reply?.id;
  const name = from_name || "Friend";

  if (!btnId) return;
  logger.info(`[BTN] ${userId} → "${btnId}"`);

  // ── Dispatch table ────────────────────────────────────────────────────────
  const dispatch = {
    // Navigation
    main_menu: () => sendMainMenu(chat_id),
    btn_help: () => sendHelpMessage(chat_id),
    btn_about: () => sendAboutMessage(chat_id),
    menu_settings: () => sendSettingsMenu(chat_id, userId),

    // Services — start flows
    svc_calc: () =>
      startFlow(
        chat_id,
        userId,
        "CALC_AWAIT_EXPR",
        "🧮 *Calculator*\n\nSend a math expression:\ne.g. `2 + 2 * 10 / 2`",
      ),
    svc_weather: () =>
      startFlow(
        chat_id,
        userId,
        "WEATHER_AWAIT_CITY",
        "🌤 *Weather Check*\n\nEnter a city name (e.g. Mumbai):",
      ),
    svc_remind: () =>
      startFlow(
        chat_id,
        userId,
        "REMIND_AWAIT_TIME",
        "⏰ *Set Reminder*\n\nIn how many minutes? (1–1440)",
      ),
    svc_translate: () =>
      startFlow(
        chat_id,
        userId,
        "TRANSLATE_AWAIT_TEXT",
        "🌐 *Translator*\n\nSend the text you want translated:",
      ),
    svc_contact: () =>
      startFlow(
        chat_id,
        userId,
        "CONTACT_AWAIT_NAME",
        "📇 *Share Contact*\n\nEnter the contact's *full name*:",
      ),

    // Fun
    fun_joke: () => sendRandomJoke(chat_id),
    fun_quote: () => sendRandomQuote(chat_id),
    fun_dice: () => sendDiceRoll(chat_id),
    fun_flip: () => sendCoinFlip(chat_id),
    fun_trivia: () => sendTrivia(chat_id, userId),
    fun_poll: () =>
      startFlow(
        chat_id,
        userId,
        "POLL_AWAIT_QUESTION",
        "📊 *Create Poll*\n\nEnter your poll question:",
      ),

    // Feedback
    start_feedback: () =>
      startFlow(
        chat_id,
        userId,
        "FEEDBACK_AWAIT_TEXT",
        "📝 *Feedback*\n\nType your feedback or suggestion:",
      ),

    // Media action stubs
    img_sticker: () =>
      whapi.sendText(
        chat_id,
        "🎨 *Sticker Conversion*\nIntegrate a sticker API (e.g. sticker.ly) for production use.\n\nType *!menu* to continue.",
      ),
    img_save: () =>
      whapi.sendText(
        chat_id,
        "💾 *Image Saved!* (demo)\nAdd cloud storage (S3 / Google Drive) for real saving.",
      ),
    img_describe: () =>
      whapi.sendText(
        chat_id,
        "🔍 *AI Description*\nIntegrate OpenAI Vision API to auto-describe images.",
      ),
    vid_gif: () =>
      whapi.sendText(
        chat_id,
        "🔄 *GIF Conversion*\nAdd FFmpeg + upload pipeline for this feature.",
      ),
    vid_thumb: () =>
      whapi.sendText(
        chat_id,
        "🖼 *Thumbnail Extraction*\nAdd FFmpeg to extract video frames.",
      ),

    // Trivia answers
    trivia_a: () => checkTrivia(chat_id, userId, 0),
    trivia_b: () => checkTrivia(chat_id, userId, 1),
    trivia_c: () => checkTrivia(chat_id, userId, 2),

    // Settings stubs
    setting_lang: () =>
      whapi.sendText(
        chat_id,
        "🌐 Language switching — integrate i18n for multi-language support.",
      ),
    setting_notif: () =>
      whapi.sendText(
        chat_id,
        "🔔 Notification preferences saved (demo). Add DB persistence.",
      ),
  };

  // Poll votes have dynamic IDs like "poll_vote_<pollId>_<optIdx>"
  if (btnId.startsWith("poll_vote_")) {
    await handlePollVote(chat_id, userId, name, btnId);
    return;
  }

  const handler = dispatch[btnId];
  if (handler) {
    await handler();
  } else {
    const title = interactive?.list_reply?.title || btnId;
    await whapi.sendText(
      chat_id,
      `You selected: *${title}*\n\nType *${config.bot.prefix}menu* to go back.`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATE-MACHINE CONVERSATION FLOWS
// ═════════════════════════════════════════════════════════════════════════════

async function handleFlow(message, state) {
  const { chat_id, from: userId } = message;
  const text = (message.text?.body || "").trim();

  // Universal escape hatch
  if (/^(cancel|exit|quit|stop|back|done)$/i.test(text)) {
    session.delete(userId);
    await whapi.sendText(
      chat_id,
      `↩️ *Cancelled.*\nType *${config.bot.prefix}menu* to go back to the main menu.`,
    );
    return true;
  }

  switch (state) {
    // ── Calculator (stays open until user cancels) ──────────────────────
    case "CALC_AWAIT_EXPR": {
      try {
        const sanitized = text.replace(/[^0-9+\-*/.()%^\s]/g, "");
        if (!sanitized.trim()) throw new Error("empty");
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict";return (${sanitized})`)();
        if (!isFinite(result)) throw new Error("infinite");
        await whapi.sendText(
          chat_id,
          `🧮 *Result*\n\n\`${sanitized}\` = *${result}*\n\nSend another expression or type *cancel* to exit.`,
        );
        session.setState(userId, "CALC_AWAIT_EXPR"); // stay in calc mode
      } catch {
        await whapi.sendText(
          chat_id,
          "❌ Invalid expression. Try: `100 + 50 * 2`\n\nOr type *cancel* to exit.",
        );
      }
      return true;
    }

    // ── Weather ─────────────────────────────────────────────────────────
    case "WEATHER_AWAIT_CITY": {
      session.delete(userId);
      await sendWeather(chat_id, text);
      return true;
    }

    // ── Reminder — step 1: minutes ──────────────────────────────────────
    case "REMIND_AWAIT_TIME": {
      const mins = parseInt(text);
      if (isNaN(mins) || mins < 1 || mins > 1440) {
        await whapi.sendText(
          chat_id,
          "❌ Enter a number between *1* and *1440* (minutes). Try again:",
        );
        return true;
      }
      session.setState(userId, "REMIND_AWAIT_MSG", { remindMins: mins });
      await whapi.sendText(
        chat_id,
        `✅ *${mins} minute(s)* noted.\n\nNow type the *reminder message*:`,
      );
      return true;
    }

    // ── Reminder — step 2: message ──────────────────────────────────────
    case "REMIND_AWAIT_MSG": {
      const data = session.get(userId);
      const mins = data?.remindMins || 1;
      session.delete(userId);
      const id = generateId(6);
      await whapi.sendText(
        chat_id,
        `⏰ Reminder set!\n🆔 *${id}* — fires in *${mins} minute(s)*:\n_${text}_`,
      );
      setTimeout(
        async () => {
          await whapi.sendText(chat_id, `⏰ *REMINDER* (ID: ${id})\n\n${text}`);
        },
        mins * 60 * 1000,
      );
      return true;
    }

    // ── Translator (demo) ───────────────────────────────────────────────
    case "TRANSLATE_AWAIT_TEXT": {
      session.delete(userId);
      await whapi.sendText(
        chat_id,
        `🌐 *Translation (Demo)*\n\nOriginal: _${truncate(text, 150)}_\n\n` +
          `Translated: _[Integrate DeepL or Google Translate API here]_\n\n` +
          `Type *${config.bot.prefix}menu* to go back.`,
      );
      return true;
    }

    // ── Contact — step 1: name ──────────────────────────────────────────
    case "CONTACT_AWAIT_NAME": {
      session.setState(userId, "CONTACT_AWAIT_PHONE", { contactName: text });
      await whapi.sendText(
        chat_id,
        `👤 Name: *${text}*\n\nNow enter the *phone number* (with country code, e.g. 919876543210):`,
      );
      return true;
    }

    // ── Contact — step 2: phone ─────────────────────────────────────────
    case "CONTACT_AWAIT_PHONE": {
      const data = session.get(userId);
      const phone = text.replace(/\D/g, "");
      if (phone.length < 10) {
        await whapi.sendText(
          chat_id,
          "❌ Phone too short. Try again (e.g. 919876543210):",
        );
        return true;
      }
      session.delete(userId);
      await whapi.sendContact(chat_id, data.contactName, phone);
      await whapi.sendText(
        chat_id,
        `✅ Contact *${data.contactName}* (${phone}) shared!`,
      );
      return true;
    }

    // ── Poll — step 1: question ─────────────────────────────────────────
    case "POLL_AWAIT_QUESTION": {
      session.setState(userId, "POLL_AWAIT_OPTIONS", { pollQ: text });
      await whapi.sendText(
        chat_id,
        `📊 *Question:* _${text}_\n\n` +
          `Now send the options separated by *|*\nExample: \`Red|Blue|Green|Yellow\`\n_(2–4 options)_`,
      );
      return true;
    }

    // ── Poll — step 2: options ──────────────────────────────────────────
    case "POLL_AWAIT_OPTIONS": {
      const data = session.get(userId);
      const options = text
        .split("|")
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 4);
      if (options.length < 2) {
        await whapi.sendText(
          chat_id,
          "❌ Need at least 2 options separated by `|`. Try again:",
        );
        return true;
      }
      session.delete(userId);
      await createAndSendPoll(chat_id, data.pollQ, options);
      return true;
    }

    // ── Feedback ────────────────────────────────────────────────────────
    case "FEEDBACK_AWAIT_TEXT": {
      if (text.length < 5) {
        await whapi.sendText(
          chat_id,
          "❌ Please provide more detail (min 5 chars):",
        );
        return true;
      }
      session.delete(userId);
      feedbackLog.push({
        from: message.from,
        name: message.from_name,
        text,
        at: new Date().toISOString(),
      });
      logger.info(`Feedback from ${message.from}: ${text}`);
      for (const admin of config.bot.adminNumbers) {
        await whapi
          .sendText(
            `${admin}@s.whatsapp.net`,
            `📨 *New Feedback*\nFrom: ${message.from_name || message.from}\n\n${text}`,
          )
          .catch(() => {});
      }
      await whapi.sendText(
        chat_id,
        "✅ *Thank you!* Your feedback has been sent to our team. 🙏\n\nType *!menu* to continue.",
      );
      return true;
    }

    default:
      session.delete(userId);
      return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  NLP / KEYWORD HANDLER
// ═════════════════════════════════════════════════════════════════════════════

async function handleNLP(message) {
  const { chat_id, from_name } = message;
  const raw = message.text?.body || "";
  const text = raw.toLowerCase().trim();
  const name = from_name || "Friend";

  // Greetings
  if (
    /^(hi+|hello+|hey+|hola|sup|namaste|namaskar|salam|assalam|vanakam|howdy|yo+)[\s!?.]*$/.test(
      text,
    )
  ) {
    await whapi.sendButtons(
      chat_id,
      `${getGreeting()}, *${name}*! 👋\nWelcome to *${config.bot.name}*!\n\nHow can I help you today?`,
      [
        { id: "main_menu", title: "📋 Main Menu" },
        { id: "btn_help", title: "❓ Help" },
        { id: "start_feedback", title: "📝 Feedback" },
      ],
      `🤖 ${config.bot.name}`,
      "Powered by Whapi.Cloud",
    );
    return;
  }

  // Thank you
  if (/thank(s| you)|ty\b|thx|shukriya|dhanyavaad|meherbani/.test(text)) {
    const replies = [
      "You're welcome! 😊",
      "Happy to help! 🙌",
      "Anytime! 😄",
      "My pleasure! 🤖",
      "No problem at all! 👍",
    ];
    await whapi.sendText(
      chat_id,
      `${replies[Math.floor(Math.random() * replies.length)]}\nType *!menu* if you need anything else.`,
    );
    return;
  }

  // Goodbye
  if (/^(bye+|goodbye|see you|cya|later|alvida|tc|tata)[\s!?.]*$/.test(text)) {
    await whapi.sendText(
      chat_id,
      `Goodbye, *${name}*! 👋 See you soon! Take care 😊`,
    );
    return;
  }

  // Menu / help request
  if (/menu|option|command|feature|help|what can/.test(text)) {
    await sendMainMenu(chat_id);
    return;
  }

  // Who are you
  if (/who are you|what are you|your name|introduce|bot info/.test(text)) {
    await sendAboutMessage(chat_id);
    return;
  }

  // How are you
  if (/how are you|how r u|u ok|kaisa|kaise ho/.test(text)) {
    await whapi.sendText(
      chat_id,
      `I'm doing great, *${name}*! 😄 Ready to help anytime.\n\nType *!menu* to see what I can do.`,
    );
    return;
  }

  // Joke
  if (/joke|funny|laugh|haha|lol|hasao/.test(text)) {
    await sendRandomJoke(chat_id);
    return;
  }

  // Quote / motivation
  if (/quote|inspir|motivat|thought/.test(text)) {
    await sendRandomQuote(chat_id);
    return;
  }

  // Weather
  if (/weather|mausam|climate/.test(text)) {
    await startFlow(
      chat_id,
      message.from,
      "WEATHER_AWAIT_CITY",
      "🌤 *Weather Check*\n\nEnter a city name:",
    );
    return;
  }

  // Calculator
  if (/calc|calculat|math/.test(text)) {
    await startFlow(
      chat_id,
      message.from,
      "CALC_AWAIT_EXPR",
      "🧮 *Calculator*\n\nSend a math expression:",
    );
    return;
  }

  // Trivia
  if (/trivia|quiz|question|game/.test(text)) {
    await sendTrivia(chat_id, message.from);
    return;
  }

  // Unknown — smart fallback with buttons
  await whapi.sendButtons(
    chat_id,
    `🤖 I'm not sure how to respond to:\n_"${truncate(raw, 80)}"_\n\nHere's what I can do:`,
    [
      { id: "main_menu", title: "📋 Main Menu" },
      { id: "btn_help", title: "❓ Help" },
      { id: "fun_joke", title: "😂 Tell Joke" },
    ],
    "💬 Not sure?",
    `Prefix: ${config.bot.prefix}`,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  MENU BUILDERS
// ═════════════════════════════════════════════════════════════════════════════

async function sendMainMenu(chatId) {
  await whapi.sendList(
    chatId,
    `Welcome to *${config.bot.name}*! 🤖\n\nSelect a category:`,
    "📋 Open Menu",
    [
      {
        title: "🛠 Utilities",
        rows: [
          {
            id: "svc_calc",
            title: "🧮 Calculator",
            description: "Solve math expressions",
          },
          {
            id: "svc_weather",
            title: "🌤 Weather",
            description: "Weather for any city",
          },
          {
            id: "svc_remind",
            title: "⏰ Reminder",
            description: "Set a timed reminder",
          },
          {
            id: "svc_translate",
            title: "🌐 Translator",
            description: "Translate text (demo)",
          },
          {
            id: "svc_contact",
            title: "📇 Share Contact",
            description: "Send a contact card",
          },
        ],
      },
      {
        title: "🎮 Fun & Games",
        rows: [
          {
            id: "fun_joke",
            title: "😂 Random Joke",
            description: "Get a funny joke",
          },
          {
            id: "fun_quote",
            title: "💬 Inspirational",
            description: "Motivational quote",
          },
          {
            id: "fun_trivia",
            title: "🧠 Trivia Quiz",
            description: "Test your knowledge",
          },
          { id: "fun_dice", title: "🎲 Roll Dice", description: "Random 1–6" },
          {
            id: "fun_flip",
            title: "🪙 Coin Flip",
            description: "Heads or tails",
          },
          {
            id: "fun_poll",
            title: "📊 Create Poll",
            description: "Make a group poll",
          },
        ],
      },
      {
        title: "ℹ️ Info & Support",
        rows: [
          {
            id: "btn_help",
            title: "❓ All Commands",
            description: "Full command list",
          },
          {
            id: "btn_about",
            title: "ℹ️ About Bot",
            description: "Version & system info",
          },
          {
            id: "start_feedback",
            title: "📝 Feedback",
            description: "Share your thoughts",
          },
          {
            id: "menu_settings",
            title: "⚙️ Settings",
            description: "Customize your experience",
          },
        ],
      },
    ],
    `🤖 ${config.bot.name} — Main Menu`,
    `Tip: type ${config.bot.prefix}help for command list`,
  );
}

async function sendHelpMessage(chatId) {
  const p = config.bot.prefix;
  await whapi.sendText(
    chatId,
    `
❓ *${config.bot.name} — Help*

*📋 Navigation*
${p}start   — Welcome + quick-access buttons
${p}menu    — Full interactive menu
${p}help    — This help message

*🛠 Utilities*
${p}calc <expr>         — Calculator  (e.g. !calc 5*20)
${p}weather <city>      — Weather info
${p}remind <min> <msg>  — Set reminder in N minutes
${p}translate <text>    — Translate text (demo)
${p}contact             — Share a contact card

*🎮 Fun*
${p}joke    — Random joke
${p}quote   — Inspirational quote
${p}trivia  — Quiz question
${p}dice    — Roll 6-sided dice
${p}flip    — Flip a coin
${p}poll    — Create a poll

*📌 Other*
${p}ping       — Latency check
${p}info       — Bot system info
${p}time       — Current date & time
${p}feedback   — Send us feedback

*🔒 Admin Only*
${p}broadcast | ${p}ban | ${p}unban | ${p}stats | ${p}status

_Tip: type *cancel* at any time to exit a flow._
  `.trim(),
  );
}

async function sendAboutMessage(chatId) {
  await whapi.sendText(
    chatId,
    `
ℹ️ *About ${config.bot.name}*

🤖 Version  : 2.0.0
🌐 Platform : Whapi.Cloud
⚡ Runtime  : Node.js ${process.version}
🔧 Prefix   : ${config.bot.prefix}
📡 Webhook  : Active
⏱ Uptime   : ${fmtUptime(process.uptime())}
💾 Memory   : ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

_Built with ❤️ using Whapi.Cloud + Node.js_
  `.trim(),
  );
}

async function sendSettingsMenu(chatId, userId) {
  await whapi.sendButtons(
    chatId,
    "⚙️ *Settings*\n\nCustomise your experience:",
    [
      { id: "setting_lang", title: "🌐 Language" },
      { id: "setting_notif", title: "🔔 Notifications" },
      { id: "main_menu", title: "↩️ Back to Menu" },
    ],
    "⚙️ Settings",
    "More options coming soon",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  FUN FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

async function sendRandomJoke(chatId) {
  const jokes = [
    "Why don't scientists trust atoms?\nBecause they make up everything! 😄",
    "Why did the scarecrow win an award?\nHe was outstanding in his field! 🌾",
    "I told my wife she was drawing her eyebrows too high.\nShe looked surprised! 😮",
    "What do you call a fish without eyes?\nA fsh! 🐟",
    "Why can't you give Elsa a balloon?\nBecause she'll let it go! 🎈",
    "What do you call cheese that isn't yours?\nNacho cheese! 🧀",
    "Why don't eggs tell jokes?\nThey'd crack each other up! 🥚",
    "I'm reading a book about anti-gravity.\nIt's impossible to put down! 📚",
    "What do you call a sleeping dinosaur?\nA dino-snore! 🦕",
    "Why did the math book look so sad?\nBecause it had too many problems! 📖",
  ];
  const joke = jokes[Math.floor(Math.random() * jokes.length)];
  await whapi.sendText(
    chatId,
    `😂 *Random Joke*\n\n${joke}\n\nType *!joke* for another one!`,
  );
}

async function sendRandomQuote(chatId) {
  const quotes = [
    {
      t: "The only way to do great work is to love what you do.",
      a: "Steve Jobs",
    },
    {
      t: "In the middle of every difficulty lies opportunity.",
      a: "Albert Einstein",
    },
    {
      t: "It does not matter how slowly you go as long as you do not stop.",
      a: "Confucius",
    },
    {
      t: "The future belongs to those who believe in the beauty of their dreams.",
      a: "Eleanor Roosevelt",
    },
    { t: "Believe you can and you're halfway there.", a: "Theodore Roosevelt" },
    {
      t: "Act as if what you do makes a difference. It does.",
      a: "William James",
    },
    {
      t: "Success is not final, failure is not fatal — it's the courage to continue that counts.",
      a: "Winston Churchill",
    },
    {
      t: "You are never too old to set another goal or to dream a new dream.",
      a: "C.S. Lewis",
    },
    { t: "The secret of getting ahead is getting started.", a: "Mark Twain" },
    {
      t: "Don't watch the clock; do what it does. Keep going.",
      a: "Sam Levenson",
    },
  ];
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  await whapi.sendText(
    chatId,
    `💬 *Quote of the Moment*\n\n_"${q.t}"_\n\n— *${q.a}*\n\nType *!quote* for another!`,
  );
}

async function sendDiceRoll(chatId) {
  const roll = Math.floor(Math.random() * 6) + 1;
  const faces = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];
  await whapi.sendText(
    chatId,
    `🎲 Rolling the dice...\n\nYou got: ${faces[roll]} *${roll}*\n\nType *!dice* to roll again!`,
  );
}

async function sendCoinFlip(chatId) {
  const result = Math.random() < 0.5 ? "🪙 *HEADS*" : "🪙 *TAILS*";
  await whapi.sendText(
    chatId,
    `Flipping a coin...\n\n${result}\n\nType *!flip* to flip again!`,
  );
}

// ─── Trivia ──────────────────────────────────────────────────────────────────

const triviaBank = [
  {
    q: "What is the capital of France?",
    opts: ["London", "Paris", "Berlin"],
    ans: 1,
  },
  {
    q: "How many legs does a spider have?",
    opts: ["6 legs", "8 legs", "10 legs"],
    ans: 1,
  },
  {
    q: "Which planet is closest to the Sun?",
    opts: ["Venus", "Mercury", "Earth"],
    ans: 1,
  },
  {
    q: "What gas do plants absorb?",
    opts: ["Oxygen", "CO₂", "Nitrogen"],
    ans: 1,
  },
  {
    q: "Who painted the Mona Lisa?",
    opts: ["Picasso", "Da Vinci", "Van Gogh"],
    ans: 1,
  },
  {
    q: "How many sides does a hexagon have?",
    opts: ["5 sides", "6 sides", "7 sides"],
    ans: 1,
  },
  {
    q: "What is the largest ocean?",
    opts: ["Atlantic", "Pacific", "Indian"],
    ans: 1,
  },
  { q: "How many continents are there?", opts: ["5", "7", "6"], ans: 1 },
  {
    q: "What is H₂O commonly known as?",
    opts: ["Hydrogen", "Water", "Helium"],
    ans: 1,
  },
  {
    q: "Which is the longest river in the world?",
    opts: ["Amazon", "Nile", "Yangtze"],
    ans: 1,
  },
];

async function sendTrivia(chatId, userId) {
  const idx = Math.floor(Math.random() * triviaBank.length);
  const trivia = triviaBank[idx];
  activeTrivia.set(userId, idx);

  const labels = ["A", "B", "C"];
  await whapi.sendButtons(
    chatId,
    `🧠 *Trivia Time!*\n\n*Q: ${trivia.q}*`,
    trivia.opts.map((opt, i) => ({
      id: `trivia_${labels[i].toLowerCase()}`,
      title: `${labels[i]}) ${opt}`,
    })),
    "🧠 Quiz",
    "Choose the correct answer!",
  );
}

async function checkTrivia(chatId, userId, selectedIdx) {
  const triviaIdx = activeTrivia.get(userId);
  if (triviaIdx === undefined) {
    await whapi.sendText(
      chatId,
      "❓ No active trivia. Type *!trivia* to start one!",
    );
    return;
  }
  const trivia = triviaBank[triviaIdx];
  activeTrivia.delete(userId);

  if (selectedIdx === trivia.ans) {
    await whapi.sendText(
      chatId,
      `✅ *Correct!* 🎉\n\nThe answer was: *${trivia.opts[trivia.ans]}*\n\nType *!trivia* for another question!`,
    );
  } else {
    await whapi.sendText(
      chatId,
      `❌ *Wrong!*\n\nThe correct answer was: *${trivia.opts[trivia.ans]}*\n\nType *!trivia* to try again!`,
    );
  }
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

async function createAndSendPoll(chatId, question, options) {
  const pollId = generateId(6);
  polls.set(pollId, { question, options, votes: {}, chatId });

  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  let body = `📊 *POLL*\n🆔 ${pollId}\n\n*${question}*\n\n`;
  options.forEach((opt, i) => {
    body += `${emojis[i]} ${opt}\n`;
  });

  await whapi.sendButtons(
    chatId,
    body.trim(),
    options.slice(0, 3).map((opt, i) => ({
      id: `poll_vote_${pollId}_${i}`,
      title: `${emojis[i]} ${opt}`,
    })),
    "📊 Active Poll",
    `Poll ID: ${pollId}`,
  );
}

async function handlePollVote(chatId, userId, name, buttonId) {
  const parts = buttonId.split("_");
  const optIdx = parseInt(parts[parts.length - 1]);
  const pollId = parts.slice(3, parts.length - 1).join("_");
  const poll = polls.get(pollId);

  if (!poll) {
    await whapi.sendText(chatId, "❌ Poll not found or expired.");
    return;
  }
  if (poll.votes[userId] !== undefined) {
    await whapi.sendText(
      chatId,
      `⚠️ *${name}*, you already voted for *${poll.options[poll.votes[userId]]}*!`,
    );
    return;
  }

  poll.votes[userId] = optIdx;
  polls.set(pollId, poll);

  const total = Object.keys(poll.votes).length;
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

  let results = `📊 *Poll Results — ${poll.question}*\n🆔 ${pollId}\n\n`;
  poll.options.forEach((opt, i) => {
    const count = Object.values(poll.votes).filter((v) => v === i).length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const bar =
      "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    results += `${emojis[i]} ${opt}\n${bar} ${pct}% (${count} vote${count !== 1 ? "s" : ""})\n\n`;
  });
  results += `👥 Total votes: *${total}*`;

  await whapi.sendText(
    chatId,
    `✅ *${name}* voted for *${poll.options[optIdx]}*!\n\n${results}`,
  );
}

// ─── Weather ──────────────────────────────────────────────────────────────────

async function sendWeather(chatId, city) {
  const conditions = [
    { icon: "☀️", label: "Sunny & Clear" },
    { icon: "🌤", label: "Partly Cloudy" },
    { icon: "⛅", label: "Mostly Cloudy" },
    { icon: "🌧", label: "Rainy" },
    { icon: "⛈", label: "Thunderstorms" },
    { icon: "❄️", label: "Cold & Windy" },
    { icon: "🌫", label: "Foggy" },
  ];
  const cond = conditions[Math.floor(Math.random() * conditions.length)];
  const temp = Math.floor(Math.random() * 30) + 10;
  const humidity = Math.floor(Math.random() * 50) + 40;
  const wind = Math.floor(Math.random() * 40) + 5;
  const feels = temp - Math.floor(Math.random() * 5);
  const uv = Math.floor(Math.random() * 10) + 1;

  await whapi.sendText(
    chatId,
    `
🌤 *Weather — ${city}*

${cond.icon} *${cond.label}*
🌡 Temp      : *${temp}°C*  (feels like ${feels}°C)
💧 Humidity  : *${humidity}%*
💨 Wind      : *${wind} km/h*
🌞 UV Index  : *${uv}*
📅 ${moment().format("ddd, D MMM YYYY — HH:mm")}

⚠️ _Demo data — integrate OpenWeatherMap API for live results._
Type *!weather <city>* anytime to check another city.
  `.trim(),
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function startFlow(chatId, userId, state, prompt) {
  session.setState(userId, state);
  await whapi.sendText(
    chatId,
    `${prompt}\n\n_Type *cancel* to exit at any time._`,
  );
}

function isAdminUser(userId) {
  return config.bot.adminNumbers.includes(userId.split("@")[0]);
}

function fmtUptime(s) {
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${Math.floor(s % 60)}s`]
    .filter(Boolean)
    .join(" ");
}

module.exports = { handleMessage };
