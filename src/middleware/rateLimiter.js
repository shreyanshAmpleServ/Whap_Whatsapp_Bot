const config = require("../../config/config");
const logger = require("../utils/logger");

// Simple in-memory rate limiter per user
const userRequests = new Map();

/**
 * Rate limit: max N messages per minute per user
 */
function rateLimiter(userId, limit = config.app.rateLimitPerMinute) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute

  if (!userRequests.has(userId)) {
    userRequests.set(userId, []);
  }

  const timestamps = userRequests.get(userId).filter((t) => now - t < windowMs);
  timestamps.push(now);
  userRequests.set(userId, timestamps);

  if (timestamps.length > limit) {
    logger.warn(`Rate limit exceeded for user: ${userId}`);
    return false;
  }
  return true;
}

/**
 * Cleanup old entries every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of userRequests.entries()) {
    const fresh = timestamps.filter((t) => now - t < 60000);
    if (fresh.length === 0) {
      userRequests.delete(userId);
    } else {
      userRequests.set(userId, fresh);
    }
  }
}, 5 * 60 * 1000);

module.exports = { rateLimiter };
