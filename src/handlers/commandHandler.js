const whapi = require("../services/whapi");
const session = require("../services/sessionStore");
const { parseCommand, getGreeting, generateId, sleep } = require("../utils/helpers");
const config = require("../../config/config");
const logger = require("../utils/logger");
const moment = require("moment");

// ─── Command Registry ──────────────────────────────────────────────────────────

const commands = {
  // ── General ──────────────────────────────────────────────────────────
  help: cmdHelp,
  start: cmdStart,
  hello: cmdHello,
  ping: cmdPing,
  info: cmdInfo,
  time: cmdTime,

  // ── Utilities ─────────────────────────────────────────────────────────
  calc: cmdCalc,
  weather: cmdWeather,
  quote: cmdQuote,
  joke: cmdJoke,
  dice: cmdDice,
  flip: cmdFlip,
  remind: cmdRemind,

  // ── Interactive ───────────────────────────────────────────────────────
  menu: cmdMenu,
  poll: cmdPoll,
  feedback: cmdFeedback,

  // ── Admin ─────────────────────────────────────────────────────────────
  broadcast: cmdBroadcast,
  status: cmdStatus,
  stats: cmdStats,
  ban: cmdBan,
  unban: cmdUnban,

  // ── Fun ───────────────────────────────────────────────────────────────
  sticker: cmdSticker,
  tag: cmdTag,
};

// Banned users store (in-memory; use DB in production)
const bannedUsers = new Set();

// Active reminders
const reminders = new Map();

// Poll storage
const polls = new Map();

// ─── Main Handler ─────────────────────────────────────────────────────────────

async function handleCommand(message) {
  const text = message.text?.body || "";
  const from = message.chat_id;
  const senderId = message.from;
  const messageId = message.id;

  const parsed = parseCommand(text, config.bot.prefix);
  if (!parsed) return false;

  const { command, args, rawArgs } = parsed;
  const handler = commands[command];

  if (!handler) {
    await whapi.sendText(from, `❓ Unknown command: *${command}*\nType *${config.bot.prefix}help* for the list of commands.`);
    return true;
  }

  // Check ban
  if (bannedUsers.has(senderId)) {
    await whapi.reactToMessage(messageId, from, "🚫");
    return true;
  }

  const ctx = { message, from, senderId, messageId, args, rawArgs, isAdmin: isAdmin(senderId) };

  try {
    await whapi.markAsRead(messageId);
    await handler(ctx);
  } catch (err) {
    logger.error(`Command error [${command}]: ${err.message}`);
    await whapi.sendText(from, `⚠️ Something went wrong executing *${command}*. Please try again.`);
  }

  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(userId) {
  const phone = userId.split("@")[0];
  return config.bot.adminNumbers.includes(phone);
}

function adminOnly(ctx, handler) {
  if (!ctx.isAdmin) {
    return whapi.sendText(ctx.from, "🔒 This command is *admin only*.");
  }
  return handler(ctx);
}

// ─── Command Implementations ──────────────────────────────────────────────────

async function cmdHelp({ from }) {
  const prefix = config.bot.prefix;
  const helpText = `
🤖 *${config.bot.name} — Command Menu*

*📌 General*
${prefix}help — Show this menu
${prefix}start — Welcome message
${prefix}hello — Greeting
${prefix}ping — Latency check
${prefix}info — Bot information
${prefix}time — Current date & time

*🛠 Utilities*
${prefix}calc <expr> — Calculator (e.g. !calc 2+2)
${prefix}weather <city> — Weather info
${prefix}quote — Random inspirational quote
${prefix}joke — Random joke
${prefix}dice [sides] — Roll a dice
${prefix}flip — Flip a coin
${prefix}remind <mins> <msg> — Set a reminder

*🎮 Interactive*
${prefix}menu — Show interactive menu
${prefix}poll <Q|opt1|opt2...> — Create a poll
${prefix}feedback <text> — Send feedback

*⚙️ Admin Only*
${prefix}broadcast <msg> — (configure targets)
${prefix}status <text> — Set bot status
${prefix}stats — Bot statistics
${prefix}ban <number> — Ban a user
${prefix}unban <number> — Unban a user

*🎨 Fun*
${prefix}sticker <url> — Convert image to sticker
${prefix}tag — Tag everyone (groups)
`.trim();

  await whapi.sendText(from, helpText);
}

async function cmdStart({ from, senderId }) {
  const greeting = getGreeting();
  await whapi.sendButtons(
    from,
    `${greeting}! 👋 Welcome to *${config.bot.name}*!\n\nI'm your advanced WhatsApp assistant. What would you like to do?`,
    [
      { id: "btn_menu", title: "📋 Main Menu" },
      { id: "btn_help", title: "❓ Help" },
      { id: "btn_info", title: "ℹ️ About Bot" },
    ],
    `🤖 ${config.bot.name}`,
    "Powered by Whapi.Cloud"
  );
}

async function cmdHello({ from, message }) {
  const name = message.from_name || "Friend";
  const greeting = getGreeting();
  await whapi.sendText(from, `${greeting}, *${name}*! 😊\nHow can I assist you today? Type *${config.bot.prefix}help* to see all commands.`);
}

async function cmdPing({ from, messageId }) {
  const start = Date.now();
  const msg = await whapi.replyToMessage(from, messageId, "🏓 Pong!");
  const latency = Date.now() - start;
  await whapi.sendText(from, `✅ Latency: *${latency}ms*`);
}

async function cmdInfo({ from }) {
  const profile = await whapi.getProfile().catch(() => ({}));
  await whapi.sendText(from, `
ℹ️ *Bot Information*

🤖 Name: ${config.bot.name}
📱 WhatsApp: ${profile.phone || "N/A"}
⚡ Version: 1.0.0
🔧 Prefix: ${config.bot.prefix}
🌐 Platform: Whapi.Cloud
📅 Uptime: ${formatUptime(process.uptime())}
💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
`.trim());
}

async function cmdTime({ from }) {
  const now = moment();
  await whapi.sendText(from, `
🕐 *Current Date & Time*

📅 Date: ${now.format("dddd, MMMM Do YYYY")}
⏰ Time: ${now.format("hh:mm:ss A")}
🌍 Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
`.trim());
}

async function cmdCalc({ from, rawArgs }) {
  if (!rawArgs) return whapi.sendText(from, "❌ Usage: !calc <expression>\nExample: !calc 2+2*3");

  try {
    // Safe eval using Function (avoids direct eval)
    const sanitized = rawArgs.replace(/[^0-9+\-*/.()%\s]/g, "");
    if (!sanitized) throw new Error("Invalid expression");
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${sanitized})`)();
    if (!isFinite(result)) throw new Error("Result is not finite");
    await whapi.sendText(from, `🧮 *Calculator*\n\n\`${sanitized}\` = *${result}*`);
  } catch {
    await whapi.sendText(from, "❌ Invalid expression. Example: !calc 2+2*3");
  }
}

async function cmdWeather({ from, rawArgs }) {
  if (!rawArgs) return whapi.sendText(from, "❌ Usage: !weather <city>\nExample: !weather Mumbai");

  // Simulated weather (integrate OpenWeatherMap API for real data)
  const conditions = ["☀️ Sunny", "🌤 Partly Cloudy", "🌧 Rainy", "⛈ Stormy", "❄️ Cold"];
  const cond = conditions[Math.floor(Math.random() * conditions.length)];
  const temp = Math.floor(Math.random() * 30) + 10;
  const humidity = Math.floor(Math.random() * 50) + 40;

  await whapi.sendText(from, `
🌤 *Weather Report — ${rawArgs}*

${cond}
🌡 Temperature: ${temp}°C
💧 Humidity: ${humidity}%
💨 Wind: ${Math.floor(Math.random() * 30)}km/h

_⚠️ Demo data — integrate OpenWeatherMap for live results_
`.trim());
}

async function cmdQuote({ from }) {
  const quotes = [
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  ];
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  await whapi.sendText(from, `💬 *Quote of the Moment*\n\n_"${q.text}"_\n\n— *${q.author}*`);
}

async function cmdJoke({ from }) {
  const jokes = [
    "Why don't scientists trust atoms? Because they make up everything! 😄",
    "Why did the scarecrow win an award? He was outstanding in his field! 🌾",
    "I told my wife she was drawing her eyebrows too high. She looked surprised! 😮",
    "What do you call a fish without eyes? A fsh! 🐟",
    "Why can't you give Elsa a balloon? Because she'll let it go! 🎈",
    "What do you call cheese that isn't yours? Nacho cheese! 🧀",
  ];
  const joke = jokes[Math.floor(Math.random() * jokes.length)];
  await whapi.sendText(from, `😂 *Random Joke*\n\n${joke}`);
}

async function cmdDice({ from, args }) {
  const sides = parseInt(args[0]) || 6;
  if (sides < 2 || sides > 1000) return whapi.sendText(from, "❌ Dice sides must be between 2 and 1000.");
  const roll = Math.floor(Math.random() * sides) + 1;
  await whapi.sendText(from, `🎲 Rolling a *${sides}-sided* dice...\n\n*Result: ${roll}*`);
}

async function cmdFlip({ from }) {
  const result = Math.random() < 0.5 ? "🪙 *HEADS*" : "🪙 *TAILS*";
  await whapi.sendText(from, `Flipping a coin...\n\n${result}`);
}

async function cmdRemind({ from, senderId, args }) {
  if (args.length < 2) return whapi.sendText(from, "❌ Usage: !remind <minutes> <message>\nExample: !remind 5 Drink water");
  
  const minutes = parseInt(args[0]);
  if (isNaN(minutes) || minutes < 1 || minutes > 1440) return whapi.sendText(from, "❌ Minutes must be between 1 and 1440 (24h).");
  
  const reminderMsg = args.slice(1).join(" ");
  const id = generateId(6);
  
  await whapi.sendText(from, `⏰ Reminder set! I'll remind you in *${minutes} minute(s)*.\n🆔 ID: ${id}`);
  
  const timer = setTimeout(async () => {
    await whapi.sendText(from, `⏰ *REMINDER* (${id})\n\n${reminderMsg}`);
    reminders.delete(id);
  }, minutes * 60 * 1000);
  
  reminders.set(id, { timer, userId: senderId, message: reminderMsg });
}

async function cmdMenu({ from }) {
  await whapi.sendList(
    from,
    "Welcome to the main menu! Choose a category below:",
    "📋 Open Menu",
    [
      {
        title: "🛠 Utilities",
        rows: [
          { id: "menu_calc", title: "Calculator", description: "Perform calculations" },
          { id: "menu_weather", title: "Weather", description: "Check weather by city" },
          { id: "menu_time", title: "Date & Time", description: "Current time info" },
        ],
      },
      {
        title: "🎮 Fun & Games",
        rows: [
          { id: "menu_joke", title: "Random Joke", description: "Get a funny joke" },
          { id: "menu_quote", title: "Daily Quote", description: "Inspirational quote" },
          { id: "menu_dice", title: "Roll Dice", description: "Roll a 6-sided dice" },
          { id: "menu_flip", title: "Coin Flip", description: "Heads or tails" },
        ],
      },
      {
        title: "ℹ️ Information",
        rows: [
          { id: "menu_info", title: "Bot Info", description: "About this bot" },
          { id: "menu_help", title: "Help", description: "All available commands" },
        ],
      },
    ],
    "🤖 Main Menu",
    `${config.bot.name} v1.0`
  );
}

async function cmdPoll({ from, rawArgs }) {
  if (!rawArgs || !rawArgs.includes("|")) {
    return whapi.sendText(from, "❌ Usage: !poll <Question|Option1|Option2|...>\nExample: !poll Fav color?|Red|Blue|Green");
  }
  
  const parts = rawArgs.split("|").map((s) => s.trim());
  const question = parts[0];
  const options = parts.slice(1, 7); // max 6 options
  
  if (options.length < 2) return whapi.sendText(from, "❌ Polls need at least 2 options.");
  
  const pollId = generateId(6);
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];
  
  let pollText = `📊 *POLL — ${question}*\nID: ${pollId}\n\n`;
  options.forEach((opt, i) => { pollText += `${emojis[i]} ${opt}\n`; });
  pollText += `\nReply with the emoji to vote!`;
  
  polls.set(pollId, { question, options, votes: {}, createdBy: from });
  await whapi.sendText(from, pollText);
}

async function cmdFeedback({ from, rawArgs }) {
  if (!rawArgs) return whapi.sendText(from, "❌ Usage: !feedback <your message>");
  
  logger.info(`Feedback from ${from}: ${rawArgs}`);
  
  // Notify admins
  for (const admin of config.bot.adminNumbers) {
    await whapi.sendText(`${admin}@s.whatsapp.net`, `📨 *New Feedback*\n\nFrom: ${from}\n\n${rawArgs}`).catch(() => {});
  }
  
  await whapi.sendText(from, "✅ Thank you for your feedback! It has been forwarded to the team. 🙏");
}

// ─── Admin Commands ───────────────────────────────────────────────────────────

async function cmdBroadcast(ctx) {
  return adminOnly(ctx, async ({ from, rawArgs }) => {
    if (!rawArgs) return whapi.sendText(from, "❌ Usage: !broadcast <message>");
    await whapi.sendText(from, `📢 Broadcast queued:\n\n${rawArgs}\n\n_(Configure target list in src/services/broadcastList.js)_`);
  });
}

async function cmdStatus(ctx) {
  return adminOnly(ctx, async ({ from, rawArgs }) => {
    if (!rawArgs) return whapi.sendText(from, "❌ Usage: !status <new status text>");
    await whapi.setStatus(rawArgs);
    await whapi.sendText(from, `✅ Status updated to: _${rawArgs}_`);
  });
}

async function cmdStats(ctx) {
  return adminOnly(ctx, async ({ from }) => {
    const sessionStats = session.stats();
    const mem = process.memoryUsage();
    await whapi.sendText(from, `
📊 *Bot Statistics*

👥 Active Sessions: ${sessionStats.activeSessions}
⏱ Uptime: ${formatUptime(process.uptime())}
💾 Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)}MB
💾 RSS: ${Math.round(mem.rss / 1024 / 1024)}MB
📝 Active Reminders: ${reminders.size}
📊 Active Polls: ${polls.size}
🚫 Banned Users: ${bannedUsers.size}
`.trim());
  });
}

async function cmdBan(ctx) {
  return adminOnly(ctx, async ({ from, args }) => {
    if (!args[0]) return whapi.sendText(from, "❌ Usage: !ban <phone_number>");
    const phone = args[0].replace(/\D/g, "");
    bannedUsers.add(`${phone}@s.whatsapp.net`);
    await whapi.sendText(from, `🚫 User *${phone}* has been banned.`);
  });
}

async function cmdUnban(ctx) {
  return adminOnly(ctx, async ({ from, args }) => {
    if (!args[0]) return whapi.sendText(from, "❌ Usage: !unban <phone_number>");
    const phone = args[0].replace(/\D/g, "");
    bannedUsers.delete(`${phone}@s.whatsapp.net`);
    await whapi.sendText(from, `✅ User *${phone}* has been unbanned.`);
  });
}

async function cmdSticker({ from, rawArgs }) {
  if (!rawArgs) return whapi.sendText(from, "❌ Usage: !sticker <image_url>");
  await whapi.sendText(from, "🎨 Sticker creation via URL noted. Integrate with sticker API for production use.");
}

async function cmdTag({ from, message }) {
  if (!message.chat_id.includes("@g.us")) {
    return whapi.sendText(from, "❌ This command only works in groups.");
  }
  try {
    const groupInfo = await whapi.getGroupInfo(message.chat_id);
    const participants = groupInfo.participants || [];
    const mentions = participants.map((p) => `@${p.id.split("@")[0]}`).join(" ");
    await whapi.sendText(from, `📢 Tagging all members:\n${mentions}`);
  } catch {
    await whapi.sendText(from, "❌ Could not fetch group members.");
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(" ");
}

module.exports = { handleCommand };
