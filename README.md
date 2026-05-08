# 🤖 Advanced WhatsApp Bot — Whapi.Cloud + Node.js

A production-ready, feature-rich WhatsApp bot built with [Whapi.Cloud](https://whapi.cloud) and Node.js.

---

## ✨ Features

| Category | Features |
|---|---|
| **Commands** | 20+ commands with prefix system (`!`) |
| **Interactive** | Buttons, lists, polls, menus |
| **Media** | Images, videos, documents, audio, stickers |
| **Conversation Flows** | State machine for multi-step dialogs |
| **Admin Panel** | Broadcast, ban/unban, stats, status |
| **Scheduler** | Daily greetings, weekly reports, reminders |
| **Rate Limiting** | Per-user message rate limiting |
| **Session Management** | In-memory sessions with TTL |
| **Dashboard** | Web UI at `http://localhost:3000` |
| **Logging** | Winston logger with file rotation |

---

## 📦 Project Structure

```
whatsapp-advanced-bot/
├── config/
│   └── config.js              # Central configuration
├── src/
│   ├── index.js               # Entry point + Express server
│   ├── handlers/
│   │   ├── commandHandler.js  # All !commands
│   │   ├── messageHandler.js  # Message router + NLP
│   │   └── webhookHandler.js  # Webhook payload parser
│   ├── middleware/
│   │   └── rateLimiter.js     # Per-user rate limiting
│   ├── services/
│   │   ├── whapi.js           # Whapi.Cloud API wrapper
│   │   ├── sessionStore.js    # In-memory sessions
│   │   └── scheduler.js       # Cron jobs
│   └── utils/
│       ├── logger.js          # Winston logger
│       └── helpers.js         # Utility functions
├── public/
│   └── dashboard.html         # Web dashboard
├── logs/                      # Auto-created log files
├── .env.example               # Environment template
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+
- A [Whapi.Cloud](https://whapi.cloud) account and token
- A connected WhatsApp channel on Whapi.Cloud

### 2. Install

```bash
unzip whatsapp-advanced-bot.zip
cd whatsapp-advanced-bot
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env with your details
```

**Required `.env` values:**

```env
WHAPI_TOKEN=your_token_from_whapi_cloud
WHAPI_API_URL=https://gate.whapi.cloud
BOT_PREFIX=!
ADMIN_NUMBERS=919999999999    # Your WhatsApp number (no + sign)
PORT=3000
WEBHOOK_URL=https://your-ngrok-url.ngrok.io
```

### 4. Expose with ngrok (local dev)

```bash
# Install ngrok: https://ngrok.com
ngrok http 3000
# Copy the https URL → paste as WEBHOOK_URL in .env
```

### 5. Run

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Open **http://localhost:3000** for the dashboard.

---

## 📋 Commands Reference

| Command | Description | Admin |
|---|---|---|
| `!help` | Show all commands | |
| `!start` | Welcome message with buttons | |
| `!hello` | Greeting | |
| `!ping` | Latency check | |
| `!info` | Bot information | |
| `!time` | Current date & time | |
| `!calc <expr>` | Calculator (e.g. `!calc 2+2*10`) | |
| `!weather <city>` | Weather info | |
| `!quote` | Random inspirational quote | |
| `!joke` | Random joke | |
| `!dice [sides]` | Roll a dice | |
| `!flip` | Flip a coin | |
| `!remind <mins> <msg>` | Set a reminder | |
| `!menu` | Interactive list menu | |
| `!poll <Q\|opt1\|opt2>` | Create a poll | |
| `!feedback <text>` | Send feedback to admins | |
| `!broadcast <msg>` | Broadcast a message | ✅ |
| `!status <text>` | Set bot WhatsApp status | ✅ |
| `!stats` | Bot statistics | ✅ |
| `!ban <phone>` | Ban a user | ✅ |
| `!unban <phone>` | Unban a user | ✅ |
| `!tag` | Tag all members (groups) | |

---

## 🔌 Webhook Setup

The bot auto-registers its webhook if `WEBHOOK_URL` is set. Or manually in Whapi.Cloud dashboard:

- **URL:** `https://your-domain.com/webhook`
- **Method:** POST
- **Events:** messages, statuses, contacts, groups

---

## 🛠 Adding Custom Commands

In `src/handlers/commandHandler.js`:

```js
// 1. Add to commands registry
const commands = {
  ...
  mycommand: cmdMyCommand,
};

// 2. Implement the handler
async function cmdMyCommand({ from, args, rawArgs, isAdmin }) {
  await whapi.sendText(from, `You ran mycommand with: ${rawArgs}`);
}
```

---

## 🔒 Security Notes

- Tokens are loaded from `.env` (never hardcode them)
- Rate limiting protects against spam
- Admin commands verify the sender's phone number
- Never expose your `.env` file publicly

---

## 📄 License

MIT — use freely, build amazing things!

---

## 🔗 Resources

- [Whapi.Cloud Docs](https://whapi.cloud/docs)
- [Whapi.Cloud Dashboard](https://panel.whapi.cloud)
- [Node.js](https://nodejs.org)
