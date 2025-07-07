// core/core.js
// MyLumina v1.2.3 (Optimized)
// AUTHOR: Arash
// TIKTOK: @rafardhancuy
// Github: https://github.com/Rafacuy
// LANGUAGE: ID (Indonesia) - Core logic is designed for Indonesian context.
// TIME FORMAT: Asia/Jakarta - All time-based operations use Jakarta timezone.
// MIT License

// ===== FILE IMPORTS =====

// --- Core & Library Imports ---
const { Mutex } = require("async-mutex"); 
const Sentry = require("@sentry/node"); 

// --- Configuration Imports ---
const config = require("../config/config");
const { isFeatureEnabled } = require("../config/featureConfig");

// --- Data Imports ---
const memory = require("../data/memory");
const globalState = require("../state/globalState");

// --- Module Imports ---
const weather = require("../modules/weather");
const lists = require("../modules/commandLists");
const loveState = require("../modules/loveStateManager");
const { initTtsSchedules } = require("../modules/ttsManager");
const ltmProcessor = require("../modules/ltmProcessor");
const ttsManager = require("../modules/ttsManager");
const Mood = require("../modules/mood");

// --- Utility Imports ---
const { sendMessage } = require("../utils/sendMessage");
const timeHelper = require("../utils/timeHelper");
const chatFormatter = require("../utils/chatFormatter");
const { getUserName } = require("../utils/telegramHelper");
const logger = require("../utils/logger");
const { manageCache } = require("../utils/cacheHelper");

// --- Scheduler Imports ---
const { setupCronJobs } = require("../scheduler/cronSetup");
const updateTimeBasedModes = require("../scheduler/updateTimeModes");

// --- Handler Imports ---
const contextManager = require("../handler/contextHandler");
const docHandler = require("../handler/docHandler");
const commandHandlers = require("../handler/commandHandlers");
const relationState = require("../handler/relationHandler");
const visionHandler = require("../handler/visionHandler");

// --- Core AI Import ---
const {
  generateAIResponse,
  initialize: initializeAIResponseGenerator,
} = require("./ai-response");

// ===== GLOBAL STATE & OPTIMIZATION SETUP =====

// Instantiate a Mutex to protect shared resources.
const interactionMutex = new Mutex();

// Structures to hold optimized command handlers.
let commandMap = new Map(); // For O(1) lookup of prefixed commands (e.g., /help).
let regexHandlers = []; // For iterating over more complex regex patterns.

// Initialize globalState from memory on startup.
globalState.initializeFromMemory(
  memory,
  logger,
  commandHandlers.setPersonalityMode
);
globalState.manageCache = manageCache; // Store manageCache for access from aiResponseGenerator.

// Lumina bot configuration parameters.
const MIN_CHATS_PER_DAY_TO_END_NGAMBEK = 6;
const NGAMBEK_DURATION_DAYS = 2;
const END_NGAMBEK_INTERACTION_DAYS = 2;

/**
 * Updates the user's interaction status using a proper mutex.
 * This prevents race conditions when multiple messages arrive concurrently,
 * ensuring data integrity for timestamps and chat counts.
 */
const updateInteractionStatus = async () => {
  // Use the mutex to ensure this function runs exclusively.
  // No other call to this function can start until the current one finishes.
  await interactionMutex.runExclusive(async () => {
    try {
      const now = new Date();
      globalState.lastInteractionTimestamp = now.toISOString();
      const today = now.toISOString().slice(0, 10);

      const loadedCounts = await memory.getPreference("dailyChatCounts");
      globalState.dailyChatCounts =
        loadedCounts && typeof loadedCounts === "object" ? loadedCounts : {};

      if (!globalState.dailyChatCounts[today]) {
        globalState.dailyChatCounts[today] = 0;
      }
      globalState.dailyChatCounts[today]++;

      await memory.savePreference(
        "lastInteractionTimestamp",
        globalState.lastInteractionTimestamp
      );
      await memory.savePreference(
        "dailyChatCounts",
        globalState.dailyChatCounts
      );
      logger.info(
        {
          event: "interaction_status_updated",
          todayChatCount: globalState.dailyChatCounts[today],
        },
        `[Interaction] Interaction status updated. Today's chats: ${globalState.dailyChatCounts[today]}.`
      );
    } catch (error) {
      logger.error(
        {
          event: "update_interaction_status_error",
          error: error.message,
          stack: error.stack,
        },
        "Error updating interaction status:"
      );
      Sentry.captureException(error);
    }
  });
};

/**
 * Checks Lumina's "Ngambek" status with a cleaner, more declarative approach.
 * Instead of a manual `for` loop, it generates an array of required dates and uses `.every()`
 * to verify if the interaction criteria are met for all of them.
 * @param {string} chatId - The chat ID to send notifications to.
 */
const checkNgambekStatus = async (chatId) => {
  if (!isFeatureEnabled("ENABLE_NGAMBEK_MODE")) {
    if (globalState.isNgambekMode) {
      globalState.isNgambekMode = false;
      await memory.savePreference("isNgambekMode", false);
      logger.info(
        { event: "ngambek_mode_force_disabled" },
        "[Ngambek System] Ngambek mode disabled by feature flag."
      );
    }
    return;
  }

  const now = new Date();
  const lastInteractionDate = globalState.lastInteractionTimestamp
    ? new Date(globalState.lastInteractionTimestamp)
    : null;

  // --- Check if Lumina should enter 'ngambek' mode ---
  if (!globalState.isNgambekMode && lastInteractionDate) {
    const diffTime = Math.abs(now - lastInteractionDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= NGAMBEK_DURATION_DAYS) {
      globalState.isNgambekMode = true;
      commandHandlers.setMood(chatId, Mood.JEALOUS);
      await memory.savePreference("isNgambekMode", true);
      logger.info(
        { event: "ngambek_mode_activated", diffDays },
        "[Ngambek System] Lumina is now in Ngambek mode!"
      );
      sendMessage(
        chatId,
        `Hmph! Kamu kemana aja?! Lumina sekarang ngambek karena kamu tidak mendengarkan Lumina selama ${diffDays} hari! 😒`
      );
    }
  }

  // --- Check if Lumina should stop 'ngambek' mode ---
  if (globalState.isNgambekMode) {
    // Generate an array of date strings for the past N days.
    const checkDates = Array.from(
      { length: END_NGAMBEK_INTERACTION_DAYS },
      (_, i) => {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        return d.toISOString().slice(0, 10);
      }
    );

    // Use .every() for a clean, mathematical check. It returns true only if
    // the condition is met for all items in the array.
    const hasSufficientInteraction = checkDates.every(
      (dateStr) =>
        (globalState.dailyChatCounts[dateStr] || 0) >=
        MIN_CHATS_PER_DAY_TO_END_NGAMBEK
    );

    if (hasSufficientInteraction) {
      globalState.isNgambekMode = false;
      commandHandlers.setMood(chatId, commandHandlers.getRandomMood());
      await memory.savePreference("isNgambekMode", false);
      globalState.dailyChatCounts = {}; // Reset counts
      await memory.savePreference(
        "dailyChatCounts",
        globalState.dailyChatCounts
      );
      logger.info(
        { event: "ngambek_mode_deactivated" },
        "[Ngambek System] Lumina is no longer sulking!"
      );
      sendMessage(
        chatId,
        `Akhirnya kamu kembali! Lumina tidak ngambek sekarang, t-tapi jangan buat itu lagi, oke! 😌`
      );
    }
  }

  // --- Clean up old dailyChatCounts data ---
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - NGAMBEK_DURATION_DAYS - 1);
  for (const date in globalState.dailyChatCounts) {
    if (new Date(date) < twoDaysAgo) {
      delete globalState.dailyChatCounts[date];
    }
  }
  await memory.savePreference("dailyChatCounts", globalState.dailyChatCounts);
};

/**
 * Checks if the given string consists only of emojis.
 * @param {string} str - The input string to check.
 * @returns {boolean} True if the string contains only emojis, false otherwise.
 */
function isOnlyEmojis(str) {
  if (typeof str !== "string") return false;
  const emojiRegex =
    /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Component})+$/u;
  return emojiRegex.test(str);
}

/**
 * Checks if the given string consists only of numeric digits.
 * @param {string} str - The input string to check.
 * @returns {boolean} True if the string contains only numbers, false otherwise.
 */
function isOnlyNumbers(str) {
  if (typeof str !== "string") return false;
  const numberRegex = /^[0-9]+$/;
  return numberRegex.test(str);
}

/**
 * Analyzes the user's message to save preferences to long-term memory.
 * @param {string} text - The message text from the user.
 */
const analyzeAndSavePreferences = async (text) => {
  if (!isFeatureEnabled("ENABLE_LTM")) return;
  if (typeof text !== "string" || text.length < 10) return;

  try {
    const analysis = await ltmProcessor.processForLTM(text);
    if (analysis.should_save_preferences) {
      await ltmProcessor.saveLTMResult(analysis, text);
      logger.info(
        {
          priority: analysis.priorities_level,
          summary: analysis.query_preferences,
        },
        "LTM preference detected and saved"
      );
    }
  } catch (error) {
    logger.error(
      { event: "ltm_processing_error", error: error.message },
      "Error in LTM processing pipeline"
    );
    Sentry.captureException(error);
  }
};

/**
 * Sets up the Telegram bot's message listener with optimized command handling.
 * @param {object} bot - The Telegram bot instance.
 */
const setupMessageListener = (bot) => {
  bot.on("message", async (msg) => {
    const {
      chat,
      text,
      photo,
      caption,
      from: senderInfo,
      document,
      location,
    } = msg;
    const currentMessageChatId = chat.id;
    const userPromptText = (text || caption || "").trim();
    const USER_NAME = getUserName(msg);

    // --- Location Message Handler ---
    if (location) {
      try {
        await updateInteractionStatus();
        const userId = senderInfo.id;
        const { latitude, longitude } = location;

        if (!latitude || !longitude) {
          logger.warn({ event: "invalid_location_received", userId });
          sendMessage(
            currentMessageChatId,
            "Lokasi yang Anda kirim sepertinya tidak valid. Mohon coba lagi.",
            { reply_markup: { remove_keyboard: true } }
          );
          return;
        }

        await memory.savePreference(`user_location_${userId}`, {
          latitude,
          longitude,
        });
        logger.info(
          { event: "location_saved", userId },
          `User location saved for weather.`
        );

        await commandHandlers.LuminaTyping(currentMessageChatId);
        sendMessage(
          currentMessageChatId,
          "Oke, lokasi sudah disimpan! Aku akan carikan info cuacanya...",
          { reply_markup: { remove_keyboard: true } }
        );

        const weatherData = await weather.getWeatherData(latitude, longitude);
        if (weatherData) {
          const weatherString = weather.getWeatherString(weatherData);
          const weatherReminder = weather.getWeatherReminder(
            weatherData,
            USER_NAME
          );
          const fullResponse = `${weatherString}\n\n${weatherReminder}`;
          sendMessage(currentMessageChatId, fullResponse);
        } else {
          sendMessage(
            currentMessageChatId,
            `Maaf, ${USER_NAME}, sepertinya Lumina tidak berhasil mendapatkan data cuaca untuk lokasi tersebut. Coba lagi nanti ya. ${Mood.SAD.emoji}`
          );
        }
      } catch (error) {
        logger.error(
          {
            event: "location_handler_error",
            error: error.message,
            stack: error.stack,
          },
          "Error handling location message."
        );
        Sentry.captureException(error);
        sendMessage(
          currentMessageChatId,
          "Aduh, ada kesalahan teknis saat memproses lokasimu. Maaf ya."
        );
      }
      return;
    }

    // --- Document Handler ---
    if (document && isFeatureEnabled("ENABLE_DOC_HANDLER")) {
      try {
        await updateInteractionStatus();
        const aiDependencies = {
          generateAIResponse,
          USER_NAME,
          Mood: commandHandlers.Mood,
        };
        await docHandler.handleDocument(msg, bot, aiDependencies);
      } catch (error) {
        logger.error(
          { event: "document_core_handler_error", error: error.message },
          "Error in core.js document handling block."
        );
        Sentry.captureException(error);
        sendMessage(
          currentMessageChatId,
          "Oops, Sepertinya ada kesalahan saat saya menganalisis dokumen, Tuan."
        );
      }
      return;
    }

    // --- Vision (Image) Handler ---
    if (photo && photo.length > 0 && isFeatureEnabled("ENABLE_AI_VISION")) {
      const fileId = photo[photo.length - 1].file_id;
      try {
        const fileLink = await bot.getFileLink(fileId);
        logger.info(
          { event: "image_received", fileId },
          `Image received, initiating VisionAgent flow...`
        );
        const visionResult = await visionHandler.handleVisionRequest(
          fileLink,
          currentMessageChatId
        );

        if (visionResult && visionResult.description) {
          logger.info(
            { event: "vision_success", description: visionResult.description },
            "VisionAgent successfully generated a description."
          );
          await memory.addMessage({
            role: "user",
            content: `[IMAGE SENT] ${userPromptText}`.trim(),
            from: senderInfo,
            chatId: chat.id,
            timestamp: new Date(msg.date * 1000).toISOString(),
            context: {
              type: "image_input",
              visionOutput: visionResult.description,
            },
          });
          await commandHandlers.LuminaTyping(currentMessageChatId);
          const messageContext = contextManager.analyzeMessage(msg);
          const aiResponse = await generateAIResponse(
            userPromptText,
            currentMessageChatId,
            messageContext,
            USER_NAME,
            Mood,
            visionResult.description
          );
          sendMessage(currentMessageChatId, aiResponse);
        } else {
          logger.warn(
            { event: "vision_failed" },
            "VisionAgent did not generate a description."
          );
          sendMessage(
            currentMessageChatId,
            `Maaf, tuan. Lumina sepertinya kesusahan untuk menganalisis gamabr tersebut. ${Mood.SAD.emoji}`
          );
        }
        return;
      } catch (error) {
        logger.error(
          { event: "process_image_error", error: error.message },
          "Failed to process image in main flow."
        );
        Sentry.captureException(error);
        await commandHandlers.LuminaTyping(currentMessageChatId);
        sendMessage(
          currentMessageChatId,
          `Maaf, Tuan. Sepertinya Lumina terdapat kesalahan saat menganalisis gambar. ${Mood.SAD.emoji}`
        );
        return;
      }
    }

    // --- General Text Message Handling ---
    if (
      !userPromptText ||
      (userPromptText.length === 1 &&
        (isOnlyEmojis(userPromptText) || isOnlyNumbers(userPromptText)))
    ) {
      return;
    }

    if (isFeatureEnabled("ENABLE_RELATIONSHIP_POINTS")) {
      await relationState.addPointOnMessage();
    }

    await updateInteractionStatus();
    await analyzeAndSavePreferences(userPromptText);

    const messageContext = contextManager.analyzeMessage(msg);
    const userMessageToStore = {
      role: "user",
      content: userPromptText,
      from: senderInfo,
      chatId: chat.id,
      message_id: msg.message_id,
      date: msg.date,
      timestamp: new Date(msg.date * 1000).toISOString(),
      context: messageContext,
    };
    await memory.addMessage(userMessageToStore);
    logger.info(
      {
        event: "user_message_saved",
        chatId: chat.id,
        messageId: msg.message_id,
      },
      `User message saved to memory with context.`
    );

    if (messageContext.autoReply) {
      await commandHandlers.LuminaTyping(currentMessageChatId);
      sendMessage(currentMessageChatId, messageContext.autoReply);
      await memory.addMessage({
        role: "assistant",
        content: messageContext.autoReply,
        timestamp: new Date().toISOString(),
        chatId: currentMessageChatId,
        context: { topic: messageContext.topic, tone: "auto_reply" },
      });
      return;
    }

    // ===== COMMAND HANDLING LOGIC =====
    let commandHandled = false;

    // Check for prefixed commands (e.g., /help) using the O(1) Map.
    const commandMatch = userPromptText.match(/^\/(\w+)/);
    if (commandMatch) {
      const commandKey = commandMatch[1].toLowerCase();
      if (commandMap.has(commandKey)) {
        const handler = commandMap.get(commandKey);
        const result = await handler.response(currentMessageChatId, msg);
        if (result && result.text) {
          await commandHandlers.LuminaTyping(currentMessageChatId);
          sendMessage(currentMessageChatId, result.text);
          await memory.addMessage({
            role: "assistant",
            content: result.text,
            timestamp: new Date().toISOString(),
            chatId: currentMessageChatId,
            context: {
              topic: "command_response",
              command: handler.name || commandKey,
            },
          });
        }
        if (result && result.mood) {
          commandHandlers.setMood(currentMessageChatId, result.mood);
        }
        commandHandled = true;
      }
    }

    // If no prefixed command was handled, check the general regex handlers.
    if (!commandHandled) {
      for (const handler of regexHandlers) {
        if (handler.pattern.test(userPromptText)) {
          const result = await handler.response(currentMessageChatId, msg);
          if (result && result.text) {
            await commandHandlers.LuminaTyping(currentMessageChatId);
            sendMessage(currentMessageChatId, result.text);
            await memory.addMessage({
              role: "assistant",
              content: result.text,
              timestamp: new Date().toISOString(),
              chatId: currentMessageChatId,
              context: {
                topic: "command_response",
                command: handler.name || handler.pattern.source,
              },
            });
          }
          if (result && result.mood) {
            commandHandlers.setMood(currentMessageChatId, result.mood);
          }
          commandHandled = true;
          break; // Exit after the first matching regex handler.
        }
      }
    }

    // If a command was handled by either method, stop further processing.
    if (commandHandled) {
      return;
    }

    // --- Default AI response generation if no specific handlers apply ---
    await commandHandlers.LuminaTyping(currentMessageChatId);
    const aiResponse = await generateAIResponse(
      userPromptText,
      currentMessageChatId,
      messageContext,
      USER_NAME,
      commandHandlers.Mood
    );
    sendMessage(currentMessageChatId, aiResponse);
  });
};

// ==== Module Exports & Bot Instance Management ====

module.exports = {
  generateAIResponse,
  /**
   * Initializes the MyLumina bot. This is the main entry point.
   * @param {object} bot - The instance of the Telegram bot client.
   */
  initLuminabot: (bot) => {
    commandHandlers.setBotInstance(bot);
    const configuredChatId = config.TARGET_CHAT_ID || config.chatId;

    logger.info(`🌸 MyLumina v1 (Optimized) is now running.`);

    // Initialize and categorize command handlers at startup.
    // This separates commands into a fast map (for /commands) and a list (for regex)
    // to avoid looping through every single handler on every message.
    logger.info("Initializing and optimizing command handlers...");
    // This regex identifies simple prefixed command patterns like `^/help` or `^/cuaca`.
    const commandPrefixRegex = /^\^\\\/(\w+)/;

    commandHandlers.commandHandlers.forEach((handler) => {
      const patternString = handler.pattern.toString();
      const match = patternString.match(commandPrefixRegex);

      if (match && !patternString.includes("|")) {
        // Ensure it's a simple command, not /cmd1|cmd2
        // This is a simple, prefixed command. Add it to the map for O(1) lookup.
        const commandKey = match[1].toLowerCase();
        commandMap.set(commandKey, handler);
        logger.info(
          `[Optimizer] Mapped command for O(1) lookup: /${commandKey}`
        );
      } else {
        // This is a more complex regex (e.g., contains '|' or doesn't start with '^/').
        // Add it to the list for iteration.
        regexHandlers.push(handler);
        logger.info(
          `[Optimizer] Added to regex list for iteration: ${patternString}`
        );
      }
    });
    logger.info("Command handler optimization complete.");

    // Initialize the AI response generator with all necessary dependencies.
    initializeAIResponseGenerator({
      config,
      memory,
      contextManager,
      timeHelper,
      commandHandlers,
      weather,
      lists,
      relationState,
      loveState,
      ttsManager,
      chatFormatter,
      ltmProcessor,
      visionHandler,
      logger,
      globalState,
      sendMessageFunction: sendMessage,
    });

    lists.rescheduleReminders(bot);

    if (isFeatureEnabled("ENABLE_TTS_REMINDER")) {
      initTtsSchedules(bot);
    }

    checkNgambekStatus(configuredChatId);
    updateTimeBasedModes(configuredChatId);

    if (isFeatureEnabled("ENABLE_CRON_JOBS")) {
      setupCronJobs(
        bot,
        updateTimeBasedModes,
        checkNgambekStatus,
        configuredChatId,
        Sentry
      );
    } else {
      logger.warn(
        { event: "cron_jobs_disabled" },
        "Cron jobs are disabled by feature flag."
      );
    }

    // Set up the message listener after all other initializations are complete.
    setupMessageListener(bot);
  },
};
