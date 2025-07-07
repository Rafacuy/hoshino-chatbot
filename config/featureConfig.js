// config/featureConfig.js
// This module acts as a central control panel for all features in the bot.
// By changing a flag's value from `true` to `false`, you can disable
// a specific feature without altering the main logic code in other files.

// --- Feature Flags Configuration ---
// Change the values below to enable (true) or disable (false) features.
const featureFlagsConfig = {
    // Enables "Sulk Mode" if the bot hasn't been spoken to for a while.
    ENABLE_NGAMBEK_MODE: true,

    // Enables the AI's ability to analyze and describe images sent by the user.
    ENABLE_AI_VISION: true,

    // Enables handling of document files (like PDF, DOCX) sent by the user.
    ENABLE_DOC_HANDLER: true,

    // Enables all scheduled tasks (cron jobs) like daily reminders, mood updates, etc.
    ENABLE_CRON_JOBS: true,

    // Enables "Romance Mode," triggered by specific keywords from the user.
    ENABLE_ROMANCE_MODE: true,

    // Enables the point system that levels up the relationship with the user.
    ENABLE_RELATIONSHIP_POINTS: true,

    // Enables the bot's ability to remember user preferences (Long-Term Memory).
    ENABLE_LTM: true,

    // Enables daily reminders sent via Text-to-Speech (TTS).
    ENABLE_TTS_REMINDER: true,

    // Enables scheduling of holiday reminders via the Calendarific API.
    ENABLE_HOLIDAYS_REMINDER: true,

    // Enables the daily news schedule and its summarization via the NewsAPI.
    ENABLE_DAILY_NEWS: true,

    // Enables scheduled song notifications.
    ENABLE_SONGS_NOTIFIER: true,

    // Enables scheduled weather reminders.
    ENABLE_WEATHER_REMINDER: false,
};

/**
 * Checks if a feature is enabled based on its name.
 * @param {string} featureName - The name of the feature flag (e.g., 'ENABLE_AI_VISION').
 * @returns {boolean} - Returns `true` if the feature is enabled, `false` otherwise or if not found.
 */
const isFeatureEnabled = (featureName) => {
    // Returns the flag's value, or false if the flag is undefined to prevent errors.
    return !!featureFlagsConfig[featureName];
};

module.exports = {
    isFeatureEnabled,
    // We can also export the entire config object if needed elsewhere.
    // featureFlagsConfig
};
