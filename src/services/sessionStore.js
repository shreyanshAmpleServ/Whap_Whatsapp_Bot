/**
 * In-Memory Session Store
 * Tracks per-user state (conversation flow, data, etc.)
 * For production, replace with Redis or a database.
 */

const sessions = new Map();
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

class SessionStore {
  /**
   * Get or create session for a user
   */
  get(userId) {
    const session = sessions.get(userId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      sessions.delete(userId);
      return null;
    }
    // Refresh TTL on access
    session.expiresAt = Date.now() + DEFAULT_TTL;
    return session.data;
  }

  /**
   * Set / update session data
   */
  set(userId, data) {
    const existing = sessions.get(userId);
    sessions.set(userId, {
      data: { ...(existing?.data || {}), ...data },
      expiresAt: Date.now() + DEFAULT_TTL,
    });
  }

  /**
   * Delete session
   */
  delete(userId) {
    sessions.delete(userId);
  }

  /**
   * Check if session exists
   */
  has(userId) {
    return this.get(userId) !== null;
  }

  /**
   * Set a specific step/state
   */
  setState(userId, state, extra = {}) {
    this.set(userId, { ...extra, state });
  }

  /**
   * Get current state
   */
  getState(userId) {
    const session = this.get(userId);
    return session?.state || null;
  }

  /**
   * Stats
   */
  stats() {
    return {
      activeSessions: sessions.size,
      users: [...sessions.keys()],
    };
  }

  /**
   * Cleanup expired sessions (call periodically)
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, val] of sessions.entries()) {
      if (now > val.expiresAt) {
        sessions.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

module.exports = new SessionStore();
