require("dotenv").config();
const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const config = require("../config/config");
const logger = require("./utils/logger");
const whapi = require("./services/whapi");
const { processWebhook } = require("./handlers/webhookHandler");
const { initScheduler } = require("./services/scheduler");
const flowRoute = require("./Route/flowRoute.js");
const StepRoute = require("./Route/stepRoute.js");
const ConditionRoute = require("./Route/condition.js");

const app = express();
app.use(cors());

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// HTTP request logging (dev only)
if (config.app.env === "development") {
  app.use(morgan("dev"));
}

// Express-level rate limiting (per IP)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: "Too many requests from this IP.",
  }),
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/flows", flowRoute);
app.use("/api/steps", StepRoute);
app.use("/api/conditions", ConditionRoute);
/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: config.bot.name,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Main webhook endpoint — Whapi.Cloud sends all events here
 */
app.post("/webhook", async (req, res) => {
  // Acknowledge immediately to prevent timeouts
  res.sendStatus(200);
  // console.log("Received webhook payload:", req.body, config.number);
  try {
    await processWebhook(req.body);
  } catch (err) {
    logger.error(`Webhook processing error: ${err.message}`);
  }
});

/**
 * Manual send endpoint (for testing or external triggers)
 */
app.post("/send", async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({ error: "to and message are required" });
  }
  try {
    const result = await whapi.sendText(to, message);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/send-interactive", async (req, res) => {
  try {
    const payload = req.body;
    console.log("Received interactive message payload:", payload);
    if (!payload.to) {
      return res.status(400).json({ error: "Missing 'to'" });
    }

    const result = await whapi.sendInteractive(payload);

    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/send-menu", async (req, res) => {
  const { to } = req.body;

  try {
    // simulate user sending !menu
    await handleMessage({
      from: to,
      chat_id: to,
      type: "text",
      text: { body: "!menu" },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send-list", async (req, res) => {
  const { to, body, buttonText, sections } = req.body;

  try {
    const result = await whapi.sendList(to, body, buttonText, sections);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send-buttons", async (req, res) => {
  const { to, body, buttons } = req.body;

  try {
    const result = await whapi.sendButtons(to, body, buttons);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Dashboard (simple HTML page)
 */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});
app.get("/flows", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/flows.html"));
});

app.get("/flows/new", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/create.html"));
});

app.get("/flows/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/edit.html"));
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  logger.error(`Express error: ${err.message}`);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  const port = config.server.port;

  app.listen(port, async () => {
    logger.info(`\n${"─".repeat(50)}`);
    logger.info(`🤖 ${config.bot.name} is starting...`);
    logger.info(`🌐 Server: http://localhost:${port}`);
    logger.info(`📡 Webhook: POST /webhook`);
    logger.info(`🔑 Prefix: ${config.bot.prefix}`);
    logger.info(`${"─".repeat(50)}\n`);

    // Initialize scheduler
    initScheduler();

    // Auto-register webhook if WEBHOOK_URL is set
    if (config.server.webhookUrl) {
      logger.info(`📡 Using webhook: ${config.server.webhookUrl}/webhook`);
    } else {
      logger.warn("⚠️ WEBHOOK_URL not set");
    }

    // Notify admins bot is online
    // for (const adminPhone of config.bot.adminNumbers) {
    //   await whapi
    //     .sendText(
    //       `${adminPhone}@s.whatsapp.net`,
    //       `✅ *${config.bot.name}* is now online!\n\n🕐 ${new Date().toLocaleString()}`,
    //     )
    //     .catch(() => {});
    // }
  });
}

// Handle uncaught errors gracefully
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, err);
});

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

start();
