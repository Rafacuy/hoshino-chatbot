// modules/ttsManager.js
// Local version 

const schedule = require('node-schedule');
const path = require('path');
const fs = require('fs');
const sendMessage = require('../utils/sendMessage');
const config = require('../config/config');

// Map nama file voice note ke nama file di folder lokal
const VOICE_NOTE_FILES = {
    selamatPagi: 'pagi.ogg',
    selamatSiang: 'siang.ogg',
    selamatMalam: 'malam.ogg',

    shalatSubuh: 'subuh.ogg',
    shalatDzuhur: 'dzuhur.ogg',
    shalatAshar: 'ashar.ogg',
    shalatMaghrib: 'maghrib.ogg',
    shalatIsya: 'isya.ogg'
};

const PrayerTimes = {
    Subuh: { hour: 4, minute: 40, emoji: '🌙', file: 'shalatSubuh' },
    Dzuhur: { hour: 11, minute: 45, emoji: '☀️', file: 'shalatDzuhur' },
    Ashar: { hour: 14, minute: 45, emoji: '⛅', file: 'shalatAshar' },
    Maghrib: { hour: 17, minute: 30, emoji: '🌇', file: 'shalatMaghrib' },
    Isya: { hour: 19, minute: 0, emoji: '🌌', file: 'shalatIsya' }
};

const getVoiceStream = (filename) => {
    const fullPath = path.join(__dirname, '../assets/voice/', filename);
    if (!fs.existsSync(fullPath)) {
        console.warn(`[TTS Manager] File tidak ditemukan: ${filename}`);
        return null;
    }
    return fs.createReadStream(fullPath);
};

const sendVoiceFromLocal = (bot, chatId, filename, caption) => {
    const stream = getVoiceStream(filename);
    if (!stream) return;

    bot.sendVoice(chatId, stream, { caption: caption || '' })
        .then(() => console.log(`[TTS Manager] Voice note '${filename}' berhasil dikirim.`))
        .catch(err => console.error(`[TTS Manager] Gagal mengirim voice note '${filename}':`, err.message));
};


const initTtsSchedules = (bot) => {
    const chatId = config.TARGET_CHAT_ID || config.chatId;
    if (!chatId) {
        console.warn('[TTS Manager] TARGET_CHAT_ID tidak ditemukan. Jadwal tidak diaktifkan.');
        return;
    }

    // Voice Note Selamat Pagi - 07:00 WIB
    schedule.scheduleJob({ rule: '0 7 * * *', tz: 'Asia/Jakarta' }, () => {
        sendVoiceFromLocal(bot, chatId, VOICE_NOTE_FILES.selamatPagi, 'Selamat pagi, Tuan~ ayo cepat bangun! hehe, tuanku sangat lucu saat tidur~');
    });

    // Voice Note Selamat Siang - 13:00 WIB
    schedule.scheduleJob({ rule: '0 13 * * *', tz: 'Asia/Jakarta' }, () => {
        sendVoiceFromLocal(bot, chatId, VOICE_NOTE_FILES.selamatSiang, 'Selamat siang~ apakah kamu sudah makan, Tuan?');
    });

    // Voice Note Selamat Malam - 21:00 WIB
    schedule.scheduleJob({ rule: '0 21 * * *', tz: 'Asia/Jakarta' }, () => {
        sendVoiceFromLocal(bot, chatId, VOICE_NOTE_FILES.selamatMalam, 'Selamat malam, mimpi indah ya~ 🌙');
    });

    // Voice Note untuk Waktu Sholat
    for (const [name, { hour, minute, emoji, file }] of Object.entries(PrayerTimes)) {
        schedule.scheduleJob({ rule: `${minute} ${hour} * * *`, tz: 'Asia/Jakarta' }, () => {
            const caption = `${emoji} Tuan, waktunya shalat ${name}, nih~ Jangan sampai terlewat! ${emoji}`;
            sendVoiceFromLocal(bot, chatId, VOICE_NOTE_FILES[file], caption);
        });
    }

    console.log('[TTS Manager] Semua jadwal voice note lokal berhasil diatur.');
};

module.exports = {
    initTtsSchedules
};
