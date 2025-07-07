// handler/commandHandlers.js
// Defines and manages all command handlers, personality modes, and mood states for the Lumina bot.
 

// --- Module Imports ---
const { sendMessage } = require('../utils/sendMessage');
const commandHelper = require('../modules/commandLists');
const config = require('../config/config');
const Mood = require('../modules/mood');
const { getWeatherData, getWeatherString, getWeatherReminder } = require('../modules/weather');
const holidaysModule = require('./holidayHandlers');
const memory = require('../data/memory');
const sendSadSongNotification = require('../utils/songNotifier');
const logger = require('../utils/logger');
const Sentry = require('@sentry/node');

// --- Lumina Configuration ---

/**
 * @const {number} MOOD_TIMEOUT_MS
 * @description Duration for a temporary mood to last before resetting to NORMAL (2 days).
 */
const MOOD_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * @const {string} USER_NAME
 * @description The default name for the user, loaded from config.
 */
const USER_NAME = config.USER_NAME;

// --- Global State Variables ---

/**
 * @type {object}
 * @description The current mood of the bot (e.g., NORMAL, HAPPY, SAD).
 */
let currentMood = Mood.NORMAL;

/**
 * @type {NodeJS.Timeout}
 * @description Stores the timeout ID for resetting the bot's mood.
 */
let moodTimeoutId;

/**
 * @type {object}
 * @description A reference to the Telegram bot instance, used for actions like 'typing'.
 */
let botInstanceRef;

/**
 * @type {Function|null}
 * @description A reference to the AI summarizer function injected from the core module.
 */
let globalAISummarizer = null;

/**
 * @type {string}
 * @description The current personality mode of the bot ('TSUNDERE' or 'DEREDERE').
 */
let personalityMode = 'TSUNDERE';

// --- Core Functions ---

/**
 * Sets the bot's personality mode and persists it to memory.
 * @param {string} mode - The personality mode to set ('TSUNDERE' or 'DEREDERE').
 */
const setPersonalityMode = async (mode) => {
    personalityMode = mode;
    try {
        await memory.savePreference("lumina_personality", mode);
        logger.info({ event: 'personality_change', mode: personalityMode }, `[Personality] Mode changed to: ${personalityMode} and saved successfully.`);
    } catch (error) {
        logger.error({ event: 'personality_save_error', error: error.message, stack: error.stack }, "[Personality] Failed to save personality mode.");
        Sentry.captureException(error);
    }
};

/**
 * Gets the current personality mode.
 * @returns {string} The current personality mode.
 */
const getPersonalityMode = () => personalityMode;

/**
 * Injects the AI summarizer function from an external module.
 * @param {Function} fn - The AI summarizer function.
 */
const setAISummarizer = (fn) => {
    globalAISummarizer = fn;
};

/**
 * Retrieves the injected AI summarizer function.
 * @returns {Function|null} The AI summarizer function.
 */
const getAISummarizer = () => globalAISummarizer;

/**
 * Simulates a 'typing...' action in a specific chat for a given duration.
 * @param {string|number} chatId - The ID of the chat where the action should be shown.
 * @param {number} [duration=1500] - The duration in milliseconds to show the typing indicator.
 */
const LuminaTyping = async (chatId, duration = 1500) => {
    if (!botInstanceRef) {
        logger.warn({ event: 'typing_action_failed', reason: 'bot_instance_not_set' }, "Bot instance is not initialized. Cannot send typing indicator.");
        return;
    }
    try {
        await botInstanceRef.sendChatAction(chatId, 'typing');
        // Wait for the specified duration before resolving the promise.
        return new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        logger.error({ event: 'typing_action_error', chatId: chatId, error: error.message, stack: error.stack }, `Error in LuminaTyping for chat ID ${chatId}`);
        Sentry.captureException(error, { extra: { chatId } });
    }
};

/**
 * Sets the bot's mood and schedules a reset to 'NORMAL' after a specified duration.
 * @param {string|number} chatId - The chat ID to send a mood status message.
 * @param {object} newMood - The new mood object (from the Mood constants) to set.
 * @param {number} [durationMs=MOOD_TIMEOUT_MS] - The duration in milliseconds for the new mood to last.
 */
const setMood = (chatId, newMood, durationMs = MOOD_TIMEOUT_MS) => {
    clearTimeout(moodTimeoutId); // Clear any existing mood reset timer.

    if (currentMood !== newMood) {
        currentMood = newMood;
        logger.info({ event: 'mood_change', mood: newMood.name, chatId }, `Mood changed to ${newMood.name}`);
        if (chatId) {
            sendMessage(chatId, `Lumina sekarang ${newMood.name} ${newMood.emoji}`);
        }
    }

    // Schedule a reset only if the new mood is not a permanent one (like NORMAL or CALM).
    if (newMood !== Mood.NORMAL && newMood !== Mood.CALM) {
        moodTimeoutId = setTimeout(() => {
            currentMood = Mood.NORMAL;
            logger.info({ event: 'mood_reset', chatId }, `Mood reset to NORMAL`);
        }, durationMs);
    }
};

/**
 * Gets a random mood from the predefined Mood constants.
 * @returns {object} A randomly selected mood object.
 */
const getRandomMood = () => {
    // Exclude CALM from random selection as it's a special state.
    const moods = Object.values(Mood).filter(mood => mood !== Mood.CALM);
    const randomIndex = Math.floor(Math.random() * moods.length);
    return moods[randomIndex];
};

// --- Command Handlers ---
/**
 * @type {Array<object>}
 * @description An array of command handler objects. Each object contains a regex pattern
 * to match against incoming messages and a response function to execute.
 */
const commandHandlers = [
    // --- Basic Commands ---
    {
        pattern: /^\/start$/i,
        response: (chatId, msg) => {
            const userFirstName = msg.from.first_name || USER_NAME;
            const startMessage = `
🌸 Selamat datang, ${userFirstName}! 🌸

Saya Lumina, asisten virtual pribadi Anda. Saya di sini untuk membantu Anda dengan berbagai tugas dan membuat hari Anda lebih mudah!

Anda dapat berinteraksi dengan saya menggunakan bahasa alami atau menggunakan beberapa perintah cepat di bawah ini:

- /help - Menampilkan pesan bantuan ini.
- /cuaca - Mendapatkan informasi cuaca terkini berdasarkan lokasi Anda.
- /mood - Memeriksa suasana hati saya saat ini.
- /note [pesan] - Menyimpan catatan singkat.
- /shownotes - Menampilkan semua catatan Anda.
- /reminder [waktu] [pesan] - Mengatur pengingat.
- /search [kueri] - Mencari di web dan meringkas informasi.

Saya juga memiliki dua mode kepribadian yang dapat Anda alihkan:
- /tsundere - Mode default saya, agak angkuh tetapi penyayang.
- /deredere - Mode yang lebih manis, lebih ceria, dan penuh kasih sayang.

Jangan ragu untuk mencoba perintah atau sekadar mengobrol dengan saya! ${Mood.HAPPY.emoji}`;

            return {
                text: startMessage,
                mood: Mood.HAPPY
            };
        }
    },
    {
        pattern: /^\/help/i,
        response: async (chatId) => {
            await LuminaTyping(chatId);
            const responseText = commandHelper.getHelpMessage(personalityMode);
            return { text: responseText, mood: Mood.NORMAL };
        }
    },
    {
        pattern: /^\/author/i,
        response: async (chatId) => {
            await LuminaTyping(chatId);
            const responseText = commandHelper.getAuthorInfo();
            return { text: responseText, mood: Mood.NORMAL };
        }
    },

    // --- Conversational Triggers ---
    {
        pattern: /^(hai|halo|bot|helo|haii|woy|hoy)/i,
        response: (chatId) => {
            const greeting = personalityMode === 'TSUNDERE' ?
                `Iya? Apa ada yang bisa aku bantu untukmu? ${currentMood.emoji}` :
                `Halo, Tuan~ apa yang terjadi hari ini? Ceritain dong! ${currentMood.emoji}`;
            return {
                text: greeting,
                mood: Mood.HAPPY
            };
        }
    },
    {
        pattern: /^(terima kasih|makasih|makasih ya)/i,
        response: () => {
            const thanksResponse = personalityMode === 'TSUNDERE' ?
                `J-Jangan berpikir seperti itu! Aku hanya melakukan tugasku.. ${Mood.NORMAL.emoji}` :
                `*Giggle* Sama-sama, Tuan~ Lumina senang bisa membantu! >_< ${Mood.HAPPY.emoji}`;
            return {
                text: thanksResponse,
                mood: Mood.HAPPY
            };
        }
    },
    {
        pattern: /(siapa kamu|kamu siapa)/i,
        response: (chatId, msg) => {
            const userName = msg.from.first_name || 'Tuan';
            return {
                text: `Aku Lumina, ${userName} Asisten virtualmu. Apa ada yang bisa aku bantu? ${Mood.NORMAL.emoji}`,
                mood: Mood.NORMAL
            };
        }
    },
    {
        pattern: /(lagi apa|lagi ngapain)/i,
        response: () => ({
            text: `Lumina? Lumina sedang bersiap membantu anda, Ada yang bisa saya bantu? ${Mood.NORMAL.emoji}`,
            mood: Mood.NORMAL
        })
    },

    // --- State & Info Commands ---
    {
        pattern: /^(mood|suasana hati)/i,
        response: () => ({
            text: `Mood Lumina sekarang adalah ${currentMood.name} ${currentMood.emoji}`,
            mood: currentMood
        })
    },
    {
        pattern: /(jam berapa|waktu sekarang)/i,
        response: () => {
            const now = new Date();
            const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' };
            const timeString = now.toLocaleTimeString('id-ID', options);
            return {
                text: `Waktu sekarang adalah ${timeString}. ${currentMood.emoji}`,
                mood: currentMood
            };
        }
    },
    {
        pattern: /(tanggal berapa|hari ini tanggal berapa)/i,
        response: (chatId, msg) => {
            const userName = msg.from.first_name;
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' };
            const dateString = now.toLocaleDateString('id-ID', options);
            return {
                text: `Today is ${dateString}, ${userName}. ${currentMood.emoji}`,
                mood: currentMood
            };
        }
    },

    // --- Functional Commands ---
    {
        pattern: /^\/cuaca/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const userId = msg.from.id;
                const userName = msg.from.first_name || USER_NAME;
                
                // Cek apakah lokasi pengguna sudah tersimpan di memori
                const userLocation = await memory.getPreference(`user_location_${userId}`);

                if (userLocation && userLocation.latitude && userLocation.longitude) {
                    // Jika lokasi ada, langsung ambil data cuaca
                    sendMessage(chatId, `Baik, ${userName}! Aku akan cek cuaca di lokasimu yang tersimpan...`);
                    const weather = await getWeatherData(userLocation.latitude, userLocation.longitude);
                    if (weather) {
                        const weatherString = getWeatherString(weather);
                        const weatherReminder = getWeatherReminder(weather, userName);
                        return {
                            text: `${weatherString}\n\n${weatherReminder}`,
                            mood: currentMood
                        };
                    } else {
                        return {
                            text: `Maaf, Lumina tidak bisa menganalisis data cuaca untuk lokasimu yang tersimpan. ${Mood.SAD.emoji}`,
                            mood: Mood.SAD
                        };
                    }
                } else {
                    // Jika lokasi tidak ada, minta pengguna untuk mengirim lokasi
                    const requestMessage = "Kirim lokasimu dulu ya~ 📍\n\nTenang saja, lokasi Anda hanya akan digunakan untuk memberikan informasi cuaca dan tidak akan kami salahgunakan.";
                    
                    // Mengirim pesan dengan tombol permintaan lokasi
                    botInstanceRef.sendMessage(chatId, requestMessage, {
                        reply_markup: {
                            keyboard: [
                                [{
                                    text: "📍 Kirim Lokasi Saat Ini",
                                    request_location: true
                                }]
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: true
                        }
                    });
                    
                    // Tidak mengembalikan teks karena pesan sudah dikirim langsung
                    return { text: null }; 
                }
            } catch (error) {
                logger.error({ event: 'weather_command_error', error: error.message, stack: error.stack }, "Error in /cuaca command handler");
                Sentry.captureException(error);
                return { text: `Maaf, Kesalahan terjadi saat melakukan perintah. ${Mood.SAD.emoji}`, mood: Mood.SAD };
            }
        }
    },
    {
        pattern: /^\/note\s+(.+)/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const [, noteMessage] = msg.text.match(/^\/note\s+(.+)/i);
                const userId = msg.from.id;
                const responseText = await commandHelper.addNote(userId, noteMessage);
                return { text: responseText, mood: Mood.HAPPY };
            } catch (error) {
                logger.error({ event: 'note_command_error', error: error.message, stack: error.stack }, "Error in /note command handler");
                Sentry.captureException(error);
                return { text: 'Maaf, Kesalahan terjadi saat menyimpan catatan. Mohon coba lagi nanti.' };
            }
        }
    },
    {
        pattern: /^\/shownotes/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const userId = msg.from.id;
                const responseText = await commandHelper.showNotes(userId);
                return { text: responseText, mood: Mood.NORMAL };
            } catch (error) {
                logger.error({ event: 'shownotes_command_error', error: error.message, stack: error.stack }, "Error in /shownotes command handler");
                Sentry.captureException(error);
                return { text: 'Maaf, Kesalahan terjadi saat menampilkan catatan. Mohon coba lagi nanti.' };
            }
        }
    },
    {
        pattern: /^\/reminder\s+(\S+)\s+(.+)/i,
        response: async (chatId, msg) => {
             try {
                await LuminaTyping(chatId);
                const [, timeString, message] = msg.text.match(/^\/reminder\s+(\S+)\s+(.+)/i);
                const userName = msg.from.first_name || msg.from.username || 'Master';
                const responseText = await commandHelper.setReminder(botInstanceRef, chatId, timeString, message, userName);
                return { text: responseText, mood: Mood.NORMAL };
            } catch (error) {
                logger.error({ event: 'reminder_command_error', error: error.message, stack: error.stack }, "Error in /reminder command handler");
                Sentry.captureException(error);
                return { text: 'Maaf, terdapat kesalahan saat mengatur pengingat. Mohon coba lagi nanti.' };
            }
        }
    },
    {
        pattern: /^\/search\s+(.+)$/i,
        response: async (chatId, msg) => {
            try {
                const match = msg.text.match(/^\/search\s+(.+)$/i);
                if (!match || !match[1]) {
                    return { text: `Maaf, ${msg.from.first_name || ''}. The /search command format is incorrect.` };
                }
                const query = match[1].trim();
                const userNameForCommand = msg.from.first_name || '';
                
                await LuminaTyping(chatId);
                sendMessage(chatId, `Oke, ${userNameForCommand}. Lumina akan mencari tentang "${query}" dan mencoba merangkumnya... Tunggu sebentar! ${getCurrentMood().emoji}`);
                
                const searchResultText = await commandHelper.performSearch(
                    query,
                    userNameForCommand,
                    chatId,
                    getAISummarizer()
                );
                return { text: searchResultText };
            } catch (error) {
                logger.error({ event: 'search_command_error', query: msg.text, error: error.message, stack: error.stack }, "Error in /search command handler");
                Sentry.captureException(error, { extra: { query: msg.text }});
                return { text: `Maaf, ${msg.from.first_name || ''}. Ada kesalahan saat memproses perintah ini.` };
            }
        }
    },

    // --- Emotional & Mood-based Commands ---
    {
        pattern: /^(lagu sedih|rekomendasi lagu sedih|rekomendasi lagu sad|lagu sad)/i,
        response: async (chatId) => {
            await sendSadSongNotification(chatId);
            // No text response needed as the notifier sends its own message.
            return {
                text: null,
                mood: Mood.SAD
            };
        }
    },
    {
        pattern: /(lagi sedih|lagi galau|patah hati|lagi nangis)/i,
        response: async (chatId) => {
            await sendSadSongNotification(chatId);
            const comfortMessage = personalityMode === 'TSUNDERE' ?
                `*Sigh*... Sangat lemah.. Tapi aku akan mendengarkanmu. ${Mood.CALM.emoji}` :
                `Virtual hug~ Aku disini untukmu! ${Mood.CALM.emoji}`;
            return {
                text: comfortMessage,
                mood: Mood.CALM
            };
        }
    },
    
    // --- Personality Switch Commands ---
    {
        pattern: /^\/tsundere/i,
        response: async (chatId) => {
            await setPersonalityMode('TSUNDERE');
            return {
                text: `Hmph, Oke! Jangan berharap aku akan jadi manis, Baka 💢`,
                mood: Mood.ANGRY 
            };
        }
    },
    {
        pattern: /^\/deredere/i,
        response: async (chatId) => {
            await setPersonalityMode('DEREDERE');
            return {
                text: `Kyaa~! Okay~ Lumina akan menjadi baik dan friendly untukmu! `,
                mood: Mood.LOVING 
            };
        }
    },
];

// --- Conditional Command Registration ---

// Register holiday-related commands only if the API key is provided.
if (config.calendarificApiKey) {
    commandHandlers.push({
        pattern: /^\/(hariini|liburhariini|infohari)$/i,
        response: async (chatId, msg) => {
            try {
                await LuminaTyping(chatId);
                const holidayMessage = await holidaysModule.getFormattedTodaysHolidays(
                    config.calendarificApiKey,
                    'ID', // Country code for Indonesia
                    config.USER_NAME
                );
                return { text: holidayMessage };
            } catch (error) {
                 logger.error({ event: 'holiday_command_error', error: error.message, stack: error.stack }, "Error in /hariini command handler");
                 Sentry.captureException(error);
                 return { text: 'Sorry, an error occurred while checking for holidays.' };
            }
        }
    });
    logger.info('[Commands] /hariini command for holiday info has been enabled.');
} else {
    logger.warn('[Commands] Calendarific API Key not found in config.js. The /hariini command (holiday info) is disabled.');
}

// --- Module Exports ---

/**
 * Sets the Telegram bot instance. This must be called once during initialization.
 * @param {object} bot - The Telegram bot instance.
 */
const setBotInstance = (bot) => {
    botInstanceRef = bot;
};

/**
 * Returns the bot's current mood.
 * @returns {object} The current mood object.
 */
const getCurrentMood = () => currentMood;

module.exports = {
    Mood,
    setMood,
    getRandomMood,
    commandHandlers,
    setBotInstance,
    getCurrentMood,
    LuminaTyping,
    setAISummarizer,
    getPersonalityMode,
    setPersonalityMode 
};
