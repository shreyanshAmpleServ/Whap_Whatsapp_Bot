require("dotenv").config();

const config = {
  whapi: {
    token: process.env.WHAPI_TOKEN || "",
    apiUrl: process.env.WHAPI_API_URL || "https://gate.whapi.cloud",
  },
  bot: {
    name: process.env.BOT_NAME || "AdvancedBot",
    prefix: process.env.BOT_PREFIX || "!",
    adminNumbers: (process.env.ADMIN_NUMBERS || "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
  },
  server: {
    port: parseInt(process.env.PORT) || 3000,
    webhookUrl: process.env.WEBHOOK_URL || "",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  app: {
    env: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "info",
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 20,
  },
  number: process.env.ADMIN_NUMBERS,
};

// Validate critical config
if (!config.whapi.token) {
  console.warn(
    "⚠️  WARNING: WHAPI_TOKEN is not set. Bot will not function correctly.",
  );
}

module.exports = config;
