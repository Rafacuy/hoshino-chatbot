// schedules/cronSetup.js
const schedule = require("node-schedule");
const logger = require("../utils/logger");
const memory = require("../data/memory");
const { getWeatherData, getWeatherString, getWeatherReminder } = require("../modules/weather");
const Mood = require("../modules/mood");
const { isFeatureEnabled } = require("../config/featureConfig");
const { sendMessage } = require("../utils/sendMessage");
const newsManager = require("../modules/newsManager");
const holidaysModule = require("../handler/holidayHandlers");
const sendSadSongNotification = require("../utils/songNotifier");
const relationState = require("../handler/relationHandler");
const config = require("../config/config"); // To get TARGET_CHAT_ID and calendarificApiKey
const chatSummarizer = require("../modules/chatSummarizer");
const globalState = require("../state/globalState"); // Import globalState

/**
 * @function setupCronJobs
 * @description Sets up all scheduled cron jobs for the application.
 * This includes weather updates, LTM cleanup, relationship checks, song notifications,
 * daily news, time-based mode updates, chat summarization,
 * and sulk status checks.
 * @param {object} bot - The Telegram bot instance.
 * @param {function} updateTimeBasedModes - Function to update time-based modes.
 * @param {function} checkNgambekStatus - Function to check and update the 'sulk' status.
 * @param {string} USER_NAME - The user's name.
 * @param {object} configuredChatId - The ChatID to send notifications to.
 * @param {object} Sentry - The Sentry object for error tracking.
 */
const setupCronJobs = (
  bot,
  updateTimeBasedModes,
  checkNgambekStatus,
  USER_NAME,
  configuredChatId,
  Sentry,
) => {
  if (!configuredChatId) {
    logger.warn(
      "⚠️ TARGET_CHAT_ID not found in config.js. Scheduled messages will NOT be sent."
    );
    return;
  }

  logger.info(
    `📬 Scheduled messages will be sent to chat ID: ${configuredChatId}`
  );

  // Cron job for weather reports (every 5 hours)
  // FF-CHECK: This job is guarded by its feature flag.
  if (isFeatureEnabled('ENABLE_WEATHER_REMINDER')) {
    schedule.scheduleJob(
      { rule: "0 */5 * * *", tz: "Asia/Jakarta" },
      async () => {
        try {
          const weather = await getWeatherData();
          if (weather) {
            sendMessage(
              configuredChatId,
              `🌸 Cuaca hari ini:\n${getWeatherString(
                weather
              )}\n${getWeatherReminder(weather)}`
            );
            logger.info(
              { event: "weather_report_sent", chatId: configuredChatId },
              "Weather report sent successfully."
            );
          } else {
            sendMessage(
              configuredChatId,
              `Hmm.. Kayaknya Lumina nggak nemu data cuaca hari ini deh.. ${Mood.SAD.emoji}`
            );
            logger.warn(
              { event: "weather_report_failed", chatId: configuredChatId },
              "Failed to fetch weather data."
            );
          }
        } catch (error) {
          logger.error(
            {
              event: "scheduled_weather_error",
              error: error.message,
              stack: error.stack,
            },
            "Error during scheduled weather task:"
          );
          Sentry.captureException(error);
        }
      }
    );
  } else {
    logger.info(
      { event: "weather_reminder_disabled" },
      "FF-CHECK: Weather reminder job is disabled by feature flag."
    );
  }

  // LTM cleanup every 2 months (60 days)
  schedule.scheduleJob(
    { rule: "0 0 1 */2 *", tz: "Asia/Jakarta" },
    async () => {
      logger.info("Running LTM cleanup job...");
      try {
        const allPrefs = await memory.getLongTermMemory();
        const twoMonthsAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
        let count = 0;

        for (const key in allPrefs) {
          if (key.startsWith("ltm_")) {
            const timestamp = parseInt(key.split("_")[1]);
            if (timestamp < twoMonthsAgo) {
              await memory.deletePreference(key);
              count++;
            }
          }
        }
        logger.info(`Cleaned up ${count} old LTM entries.`);
      } catch (error) {
        logger.error({ error: error.message }, "LTM cleanup failed.");
        Sentry.captureException(error);
      }
    }
  );

  // Relationship check every 7 hours
  schedule.scheduleJob({ rule: "0 */7 * * *" }, async () => {
    logger.info(
      { event: "relation_status_check_scheduled" },
      "Running scheduled relationship status check..."
    );
    try {
      await relationState.checkWeeklyConversation();
    } catch (error) {
      logger.error(
        {
          event: "scheduled_relation_check_error",
          error: error.message,
          stack: error.stack,
        },
        "Error during scheduled relationship check:"
      );
      Sentry.captureException(error);
    }
  });
  
  // Sad song recommendation every night at 10 PM
  // FF-CHECK: This job is guarded by its feature flag.
  if (isFeatureEnabled('ENABLE_SONGS_NOTIFIER')) {
    schedule.scheduleJob({ rule: "0 22 * * *", tz: "Asia/Jakarta" }, () => {
      try {
        sendSadSongNotification(configuredChatId);
        logger.info(
          { event: "sad_song_notification_sent", chatId: configuredChatId },
          "Sad song notification sent."
        );
      } catch (error) {
        logger.error(
          {
            event: "scheduled_song_notification_error",
            error: error.message,
            stack: error.stack,
          },
          "Error during scheduled song notification:"
        );
        Sentry.captureException(error);
      }
    });
  } else {
    logger.info(
      { event: "songs_notifier_disabled" },
      "FF-CHECK: Song notifier job is disabled by feature flag."
    );
  }

  // Daily news and summary every morning at 8 AM
  // FF-CHECK: This job is guarded by its feature flag.
  if (isFeatureEnabled('ENABLE_DAILY_NEWS')) {
    schedule.scheduleJob(
      { rule: "0 8 * * *", tz: "Asia/Jakarta" },
      async () => {
        logger.info(
          { event: "daily_news_send_scheduled" },
          "[Core] Running scheduled daily news delivery..."
        );
        try {
          await newsManager.sendDailyNews(configuredChatId);
        } catch (error) {
          logger.error(
            {
              event: "scheduled_daily_news_error",
              error: error.message,
              stack: error.stack,
            },
            "Error during scheduled daily news task:"
          );
          Sentry.captureException(error);
        }
      }
    );
  } else {
    logger.info(
      { event: "daily_news_disabled" },
      "FF-CHECK: Daily news job is disabled by feature flag."
    );
  }

  // Time-based mode update every hour
  schedule.scheduleJob({ rule: "0 * * * *", tz: "Asia/Jakarta" }, () => {
    try {
      updateTimeBasedModes(configuredChatId);
    } catch (error) {
      logger.error(
        {
          event: "scheduled_time_modes_update_error",
          error: error.message,
          stack: error.stack,
        },
        "Error during scheduled time-based mode update:"
      );
      Sentry.captureException(error);
    }
  });

  // Chat summary update every hour
  schedule.scheduleJob(
    { rule: "0 * * * *", tz: "Asia/Jakarta" },
    async () => {
      logger.info(
        { event: "update_chat_summary_start" },
        "[Core] Updating chat summary..."
      );
      try {
        const fullHistory = await memory.getInMemoryHistory();
        const summary = await chatSummarizer.getSummarizedHistory(50, fullHistory);
        if (summary) {
          globalState.currentChatSummary = summary;
          logger.info(
            { event: "update_chat_summary_success" },
            "[Core] New chat summary created successfully."
          );
        } else {
          globalState.currentChatSummary = null;
          logger.info(
            { event: "update_chat_summary_no_summary" },
            "[Core] No chat summary was generated or history is too short."
          );
        }
      } catch (error) {
        logger.error(
          {
            event: "update_chat_summary_error",
            error: error.message,
            stack: error.stack,
          },
          "Error while updating chat summary:"
        );
        Sentry.captureException(error);
      }
    }
  );

  // Scheduler for the Sulk System (every day at midnight)
  // FF-CHECK: This job is guarded by its feature flag.
  if (isFeatureEnabled('ENABLE_SULK_MODE')) {
    schedule.scheduleJob(
      { rule: "0 0 * * *", tz: "Asia/Jakarta" },
      async () => {
        logger.info(
          { event: "sulk_status_check_scheduled" },
          "[Sulk System] Checking sulk status..."
        );
        try {
          await checkSulkStatus(configuredChatId);
        } catch (error) {
          logger.error(
            {
              event: "scheduled_sulk_check_error",
              error: error.message,
              stack: error.stack,
            },
            "Error during scheduled sulk status check:"
          );
          Sentry.captureException(error);
        }
      }
    );
  } else {
    logger.info(
        { event: "sulk_mode_disabled" },
        "FF-CHECK: Sulk mode job is disabled by feature flag."
    );
  }

  // Check for holidays and send a notification if it's a holiday (every morning at 7 AM)
  // FF-CHECK: This job is guarded by its feature flag.
  if (isFeatureEnabled('ENABLE_HOLIDAYS_REMINDER')) {
    if (config.calendarificApiKey) {
      schedule.scheduleJob(
        { rule: "0 7 * * *", tz: "Asia/Jakarta" },
        async () => {
          try {
            await holidaysModule.checkAndNotifyDailyHolidays(
              config.calendarificApiKey,
              "ID",
              (message) => sendMessage(configuredChatId, message)
            );
            logger.info(
              { event: "daily_holiday_check_scheduled" },
              "Daily holiday check performed."
            );
          } catch (error) {
            logger.error(
              {
                event: "scheduled_holiday_check_error",
                error: error.message,
                stack: error.stack,
              },
              "Error during scheduled holiday check:"
            );
            Sentry.captureException(error);
          }
        }
      );
    } else {
      logger.warn(
        "[Core] Calendarific API Key not found. Holiday check is disabled."
      );
    }
  } else {
    logger.info(
      { event: "daily_holidays_check_disabled" },
      "FF-CHECK: Holiday reminder job is disabled by feature flag."
    );
  }
};

module.exports = { setupCronJobs };
