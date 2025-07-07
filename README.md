# 🌟 MyLumina Bot - Telegram AI Companion

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)
[![License](https://img.shields.io/github/license/Ileriayo/markdown-badges?style=for-the-badge)](https://github.com/Rafacuy/MyLumina/blob/main/LICENSE)

> Version 1.2 - Optimized Core  
> by Rafacuy | [@rafardhancuy](https://tiktok.com/@rafardhancuy) | MIT License

---

## 📜 Quick Description

MyLumina is a Node.js-based Telegram bot that leverages AI, long-term memory (LTM), mood simulation, and various personalized features to deliver natural and engaging conversation experiences.

---

## 🚀 Main Features

### AI & Intelligence
- **Groq-Powered Chat**: Lightning-fast AI responses powered by LLaMA/deepseek models
- **Web Search + AI Summary**: Summarizes Google search results using AI
- **AI Vision**: Image recognition & OCR text extraction
- **Document Reader**: Reads/summarizes TXT, PDF, DOCX, CSV, and Markdown files

### Daily Life Tools
- **Real-Time Weather**: Live weather info + personalized weather reminders
- **Prayer Times**: Auto-scheduled for Asia/Jakarta timezone
- **Holiday Tracker**: Public holiday info & reminders
- **News Digest**: Daily summarized news at 8 AM

### Interactive Experience
- **Dynamic Mood System**: Moods change based on time & interactions (auto-reset)
- **DeepTalk Mode**: Switches to deep conversations after 9 PM
- **Relationship System**: Personality evolves with ongoing interactions
- **Context Detection**: Automatically detects conversation topics

### Productivity
- **Voice/Text Reminders**: Set reminders via voice or text
- **Personal Notes**: Secure personal note storage
- **Long-Term Memory**: Learns from chat history & preferences

### Personalized Touches
- **Nightly Sad Songs**: Sends calming song recommendations at 10 PM

### System Optimization
- **Auto Cache Cleanup**: Manages memory & storage efficiently
- **Dotenv Security**: Encrypted API key management
- **Structured Logging**: Uses Pino for structured system logs
- **Error Tracking**: Integrated with Sentry for crash reporting

---

## ⚙️ Tech Stack
- **Node.js 18+**
- **Telegram Bot API (node-telegram-bot-api)**
- **LokiJS** (embedded database)
- **Pino + pino-pretty** (logging)
- **Sentry SDK**
- **Cron Jobs (node-schedule)**

---

## 📂 Folder Structure
```bash
core/         => Core logic & AI response
modules/      => Weather, mood, TTS, and more
data/         => LokiJS database & memory management
scheduler/    => Cron jobs & automation
handler/      => Command & context handler
utils/        => Helper functions (logger, time, etc)
config/       => Configuration & feature flags
state/        => Global state management
```

---

## 🔧 Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/Rafacuy/MyLumina.git
   cd MyLumina
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Add a `.env` file (see `.env.example` for reference)
4. Run the bot:
   ```bash
   node index.js
   ```

---

## ⚙️ Environment Configuration

| Variable          | Description                                   |
| ----------------- | --------------------------------------------- |
| TELEGRAM_TOKEN    | Telegram Bot Token                            |
| DSN_KEY           | Sentry DSN project key                        |
| NODE_ENV          | production / development                      |
| TARGET_CHAT_ID    | Default chat ID for cron & notifications      |
| LATITUDE          | Latitude location for Weather API             |
| LONGITUDE         | Longitude location for Weather API            |
| GROQ_API_KEY      | Groq API key for AI                           |
| NEWSAPI           | Daily news API                                |
| OCR_API_KEY       | API key for OCR                               |
| IMAGGA_API        | Imagga API key                                |
| IMAGGA_SECRET     | Imagga API secret key                         |
| WEATHER_API_KEY   | OpenWeather API key                           |
| GOOGLE_SEARCH     | Google Search API key                         |
| GOOGLE_CX_KEY     | Google Search CX key                          |
| CALENDARIFIC_KEY  | Calendarific API key                          |
| PORT              | 3000 / 8080 (depending on your setup)         |

_(See full details in `.env.example` file)_

---

## 🚀 Deployment Guide

1. Make sure Node.js 18+ and dependencies are installed.
2. Set environment variables for API keys and tokens (see `.env.example` for reference).
3. Run `node index.js` locally or deploy to Railway / Render / VPS.

---

## 🤝 Contribution

Open for PRs & feedback. DM me on [Tiktok @rafardhancuy](https://tiktok.com/@rafardhancuy) for casual discussions.

[![TikTok](https://img.shields.io/badge/TikTok-%23000000.svg?style=for-the-badge&logo=TikTok&logoColor=white)](https://tiktok.com/@rafardhancuy)

---

## 📜 License

MIT License.  
Copyright © 2025 Arash
