// modules/weather.js

const axios = require('axios').default;
const config = require('../config/config'); 
const Mood  = require('./mood');  
const logger = require('../utils/logger');

/**
 * format data cuaca mentah jadi string yang mudah dibaca pengguna.
 * @param {object} weatherData  data cuaca yang diperoleh dari OpenWeatherMap API.
 * @returns {string} String yang diformat yang menjelaskan kondisi cuaca saat ini.
 */
const getWeatherString = (weatherData) => {
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return "Maaf, Lumina tidak bisa mendapatkan informasi cuaca saat ini.";
    }
    const { temp, feels_like, humidity } = weatherData.main;
    const description = weatherData.weather[0].description;
    const cityName = weatherData.name || "lokasi Anda";

    // Format deskripsi dengan huruf kapital di awal
    const formattedDescription = description.charAt(0).toUpperCase() + description.slice(1);

    return `🌤️ Cuaca di ${cityName}: ${Math.round(temp)}°C (${formattedDescription})\n` +
           `Terasa seperti: ${Math.round(feels_like)}°C\n` +
           `Kelembaban: ${humidity}%`;
};

/**
 * Memberikan pengingat yang dipersonalisasi berdasarkan cuaca.
 * Pengingat beradaptasi berdasarkan kondisi cuaca utama.
 * @param {object} weatherData Objek data cuaca dari OpenWeatherMap API.
 * @param {string} userName Nama pengguna untuk personalisasi pesan.
 * @returns {string} Pesan pengingat yang dipersonalisasi terkait cuaca.
 */
const getWeatherReminder = (weatherData, userName = "Tuan") => {
    if (!weatherData?.main || !weatherData?.weather?.length) {
        return `Maaf, Lumina lagi pusing nih... ${Mood.SAD.emoji}`;
    }
    const weatherMain = weatherData.weather[0].main; // Kondisi cuaca utama

    const reminders = {
        Rain: `Jangan lupa bawa payung atau jas hujan ya, ${userName}. Jaga kesehatan! ${Mood.NORMAL.emoji}`,
        Clear: `Cuacanya cerah banget! Waktu yang pas buat produktif di luar, tapi jangan lupa pakai sunscreen ya, ${userName}! ${Mood.HAPPY.emoji}`,
        Clouds: `Langitnya berawan, mungkin akan teduh. Tetap semangat ya, ${userName}! ${Mood.NORMAL.emoji}`,
        Thunderstorm: `Ada badai petir! Sebaiknya tetap di dalam ruangan yang aman ya, ${userName}. ${Mood.SAD.emoji}`,
        Snow: `Wah, ada salju! Pakai baju yang tebal ya, nanti kedinginan! ${Mood.HAPPY.emoji}`,
        Drizzle: `Gerimis manja nih, hati-hati di jalan ya kalau bepergian, ${userName}! ${Mood.NORMAL.emoji}`,
        Mist: `Ada kabut, hati-hati saat berkendara ya, ${userName}. Jarak pandang terbatas.`,
        Smoke: `Ada asap, sebaiknya kurangi aktivitas di luar atau gunakan masker ya.`,
        Haze: `Udara berkabut, jaga kesehatan pernapasan ya, ${userName}.`,
        Fog: `Kabut tebal, visibility sangat rendah. Hati-hati ya, ${userName}.`
    };

    // Fallback jika kondisi cuaca tidak ada di daftar
    return reminders[weatherMain] || `Jaga diri baik-baik ya hari ini, ${userName}! ${Mood.NORMAL.emoji}`; 
};


/**
 * Mengambil data cuaca saat ini dari OpenWeatherMap API.
 * Jika latitude dan longitude tidak diberikan, akan menggunakan fallback dari config.
 * @param {number} [latitude] Latitude dari lokasi pengguna (opsional).
 * @param {number} [longitude] Longitude dari lokasi pengguna (opsional).
 * @returns {Promise<object|null>} Promise yang menyelesaikan ke objek data cuaca.
 */
const getWeatherData = async (latitude, longitude) => {
    try {
        const apiKey = config.weatherApiKey;
        
        // Gunakan lokasi dari argumen, atau fallback ke config jika tidak ada
        const lat = latitude || config.latitude;
        const lon = longitude || config.longitude;

        if (!lat || !lon) {
            logger.error("Error: Latitude atau Longitude tidak valid dan tidak ada fallback di config.");
            return null;
        }

        if (!apiKey) {
            logger.error("Konfigurasi API Cuaca (weatherApiKey) hilang di config.js.");
            return null;
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=id`;
        const response = await axios.get(url);
        logger.info({ event: 'weather_data_fetched', location: response.data.name }, "Successfully fetched weather data.");
        return response.data;
    } catch (error) {
        logger.error("Error fetching weather data:", error.message);
        if (error.response) {
            logger.error("Status error respons API Cuaca:", error.response.status);
            logger.error("Data respons API Cuaca:", error.response.data);
        }
        return null;
    }
};

module.exports = {
    getWeatherData,
    getWeatherString,
    getWeatherReminder,
};
