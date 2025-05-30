// index.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/config');
const { initAlyabot, generateAIResponse } = require('./core/core');
const command = require('./modules/commandHandlers');

command.setAISummarizer(generateAIResponse); 

const bot = new TelegramBot(config.telegramBotToken, { polling: true });

initAlyabot(bot);