const cron = require("node-cron");
const whapi = require("./whapi");
const session = require("./sessionStore");
const config = require("../../config/config");
const logger = require("../utils/logger");
const moment = require("moment");

/**
 * Initialize all scheduled tasks
 */
function initScheduler() {
  // ── Session cleanup every 10 minutes ──────────────────────────────────
  cron.schedule("*/10 * * * *", () => {
    const removed = session.cleanup();
    if (removed > 0)
      logger.info(`Session cleanup: removed ${removed} expired sessions`);
  });

  // ── Daily morning message to admins at 8:00 AM ───────────────────────
  // cron.schedule("0 8 * * *", async () => {
  //   logger.info("Running daily morning task...");
  //   const dateStr = moment().format("dddd, MMMM Do YYYY");
  //   const message = `🌅 Good Morning!\n\n📅 Today is *${dateStr}*\n\n_${config.bot.name} is running smoothly._\n\nHave a great day! ☀️`;

  //   for (const adminPhone of config.bot.adminNumbers) {
  //     try {
  //       await whapi.sendText(`${adminPhone}@s.whatsapp.net`, message);
  //     } catch (err) {
  //       logger.error(`Failed to send morning message to ${adminPhone}: ${err.message}`);
  //     }
  //   }
  // });

  // ── Weekly stats report every Sunday at 9:00 AM ──────────────────────
  cron.schedule("0 9 * * 0", async () => {
    logger.info("Running weekly stats task...");
    const mem = process.memoryUsage();
    const report = `
📊 *Weekly Bot Report*
📅 Week of: ${moment().format("MMMM Do YYYY")}

⏱ Uptime: ${formatUptime(process.uptime())}
💾 Memory: ${Math.round(mem.heapUsed / 1024 / 1024)}MB
👥 Sessions: ${session.stats().activeSessions}

_Report generated automatically by ${config.bot.name}_
    `.trim();

    for (const adminPhone of config.bot.adminNumbers) {
      try {
        await whapi.sendText(`${adminPhone}@s.whatsapp.net`, report);
      } catch (err) {
        logger.error(
          `Failed to send weekly report to ${adminPhone}: ${err.message}`,
        );
      }
    }
  });

  // ── Heartbeat log every hour ──────────────────────────────────────────
  cron.schedule("0 * * * *", () => {
    logger.info(
      `Heartbeat | Uptime: ${formatUptime(process.uptime())} | Sessions: ${session.stats().activeSessions}`,
    );
  });

  logger.info("⏰ Scheduler initialized");
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (
    [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") ||
    "< 1m"
  );
}

module.exports = { initScheduler };
