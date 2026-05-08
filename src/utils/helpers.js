const moment = require("moment");

/**
 * Extract phone number from WhatsApp chat ID
 * e.g. "919999999999@s.whatsapp.net" → "919999999999"
 */
function extractPhoneNumber(chatId) {
  return chatId ? chatId.split("@")[0] : "";
}

/**
 * Build a WhatsApp chat ID from a phone number
 */
function buildChatId(phone) {
  const clean = phone.replace(/\D/g, "");
  return `${clean}@s.whatsapp.net`;
}

/**
 * Format a number as a readable string
 */
function formatNumber(num) {
  return num.toLocaleString("en-IN");
}

/**
 * Greeting based on time of day
 */
function getGreeting() {
  const hour = moment().hour();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

/**
 * Delay helper
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chunk array into smaller pieces
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sanitize text to avoid markdown issues
 */
function sanitize(text) {
  return String(text).replace(/[*_~`]/g, "\\$&");
}

/**
 * Parse command and arguments from a message
 */
function parseCommand(text, prefix = "!") {
  if (!text.startsWith(prefix)) return null;
  const parts = text.slice(prefix.length).trim().split(/\s+/);
  return {
    command: parts[0].toLowerCase(),
    args: parts.slice(1),
    rawArgs: parts.slice(1).join(" "),
  };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a simple unique ID
 */
function generateId(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

/**
 * Truncate text to max length
 */
function truncate(text, maxLen = 100) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
}

module.exports = {
  extractPhoneNumber,
  buildChatId,
  formatNumber,
  getGreeting,
  sleep,
  chunkArray,
  sanitize,
  parseCommand,
  formatBytes,
  isValidUrl,
  generateId,
  truncate,
};
