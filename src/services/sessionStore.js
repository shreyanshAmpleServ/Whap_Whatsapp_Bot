const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_TTL = 30 * 60 * 1000;

class SessionStore {
  // ==========================
  // GET SESSION
  // ==========================
  async get(userId) {
    const session = await prisma.userSession.findUnique({
      where: {
        userId,
      },
    });

    if (!session) return null;

    // Expired
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      await this.delete(userId);
      return null;
    }

    // Refresh TTL
    await prisma.userSession.update({
      where: {
        userId,
      },
      data: {
        expiresAt: new Date(Date.now() + DEFAULT_TTL),
      },
    });

    // Parse JSON string safely
    let parsedData = {};

    try {
      parsedData = session?.data ? JSON.parse(session?.data) : {};
    } catch (err) {
      console.error("Session JSON parse error:", err.message);
    }

    return {
      state: session.state,
      ...parsedData,
    };
  }

  // ==========================
  // SET SESSION
  // ==========================
  async set(userId, data) {
    const existing = (await this.get(userId)) || {};

    const merged = {
      ...existing,
      ...data,
    };

    await prisma.userSession.upsert({
      where: {
        userId,
      },

      update: {
        state: merged.state,

        data: JSON.stringify(merged),

        expiresAt: new Date(Date.now() + DEFAULT_TTL),
      },

      create: {
        userId,

        state: merged.state,

        data: JSON.stringify(merged),

        expiresAt: new Date(Date.now() + DEFAULT_TTL),
      },
    });

    return merged;
  }

  // ==========================
  // SET STATE
  // ==========================
  async setState(userId, state, extra = {}) {
    return this.set(userId, {
      ...extra,
      state,
    });
  }

  // ==========================
  // GET STATE
  // ==========================
  async getState(userId) {
    const session = await this.get(userId);

    return session?.state || null;
  }

  // ==========================
  // DELETE SESSION
  // ==========================
  async delete(userId) {
    try {
      await prisma.userSession.delete({
        where: {
          userId,
        },
      });
    } catch (err) {}
  }

  // ==========================
  // HAS SESSION
  // ==========================
  async has(userId) {
    return (await this.get(userId)) !== null;
  }

  // ==========================
  // CLEANUP
  // ==========================
  async cleanup() {
    const result = await prisma.userSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }
}

module.exports = new SessionStore();

// const sessions = new Map();
// const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

// class SessionStore {
//   /**
//    * Get or create session for a user
//    */
//   get(userId) {
//     const session = sessions.get(userId);
//     if (!session) return null;
//     if (Date.now() > session.expiresAt) {
//       sessions.delete(userId);
//       return null;
//     }
//     // Refresh TTL on access
//     session.expiresAt = Date.now() + DEFAULT_TTL;
//     return session.data;
//   }

//   /**
//    * Set / update session data
//    */
//   set(userId, data) {
//     const existing = sessions.get(userId);
//     sessions.set(userId, {
//       data: { ...(existing?.data || {}), ...data },
//       expiresAt: Date.now() + DEFAULT_TTL,
//     });
//   }

//   /**
//    * Delete session
//    */
//   delete(userId) {
//     sessions.delete(userId);
//   }

//   /**
//    * Check if session exists
//    */
//   has(userId) {
//     return this.get(userId) !== null;
//   }

//   /**
//    * Set a specific step/state
//    */
//   setState(userId, state, extra = {}) {
//     this.set(userId, { ...extra, state });
//   }

//   /**
//    * Get current state
//    */
//   getState(userId) {
//     const session = this.get(userId);
//     return session?.state || null;
//   }

//   /**
//    * Stats
//    */
//   stats() {
//     return {
//       activeSessions: sessions.size,
//       users: [...sessions.keys()],
//     };
//   }

//   /**
//    * Cleanup expired sessions (call periodically)
//    */
//   cleanup() {
//     const now = Date.now();
//     let removed = 0;
//     for (const [key, val] of sessions.entries()) {
//       if (now > val.expiresAt) {
//         sessions.delete(key);
//         removed++;
//       }
//     }
//     return removed;
//   }
// }

// module.exports = new SessionStore();
