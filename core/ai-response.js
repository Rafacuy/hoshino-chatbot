// DESCRIPTION: This file contains functions to handle AI responses and prompting for Lumina.

// IMPORTS
const Groq = require("groq-sdk"); // Groq library package
const Sentry = require("@sentry/node"); // Sentry for error-trace
const { isFeatureEnabled } = require("../config/featureConfig"); // Feature Flags

// These variables will be INJECTED from core.js to avoid circular dependency
let config = {};
let memory = {};
let contextManager = {};
let timeHelper = {}; // getJakartaHour, formatJakartaDateTime
let commandHandlers = {}; // Mood, getCurrentMood, getPersonalityMode
let weather = {}; // getWeatherData, getWeatherString
let lists = {};
let relationState = {};
let loveState = {};
let ttsManager = {};
let chatFormatter = {};
let ltmProcessor = {};
let visionHandler = {};
let logger = {};
let globalState = {};
let sendMessageFunction = null; // sendMessage function from utils/sendMessage

// Initialization function to inject dependencies
const initialize = (dependencies) => {
  ({
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
    sendMessageFunction, // Receive sendMessage
  } = dependencies);

  // Initialize GROQ client after config is injected
  client = new Groq({ apiKey: config.groqApiKey });

};

const CONVERSATION_HISTORY_LIMIT = 4; // Limit the number of recent messages sent to the AI ​​for the AI ​​context
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // Rate limiting window: 20 seconds
const RATE_LIMIT_MAX_REQUESTS = 3; // Maximum requests allowed in the rate limiting window per user
const SLEEP_START_HOUR = 0; // Lumina sleep time (00:00 - midnight)
const SLEEP_END_HOUR = 4; // Lumina sleep end time (04:00 - 4am)

let client; // Will be initialized once config is available

/**
 * Generates system prompts for the AI ​​based on the current mode, mood, and context,
 * including information from long-term memory.
 * @param {object} params - An object containing all required parameters.
 * @param {string} params.USER_NAME - The name of the user interacting with Lumina.
 * @param {string} params.currentPersonality - Lumina's current personality (TSUNDERE/DEREDERE).
 * @param {boolean} params.isDeeptalkMode - True if in deeptalk mode.
 * @param {object} params.currentMood - The current mood object.
 * @param {string|null} params.imageContext - The image description from the VisionAgent.
 * @param {string|null} params.currentTopic - The current conversation topic.
 * @param {string|null} params.currentChatSummary - Summary of the previous chat.
 * @param {object} params.longTermMemory - Long-term memory object (already loaded).
 * @param {boolean} params.isNgambekMode - True if Lumina is in 'Ngambek' mode.
 * @param {boolean} params.isRomanceMode - True if in romance mode.
 * @param {string} params.botName - Bot name.
 * @returns {string} System prompt string.
 */
async function generateLuminaPrompt({
  USER_NAME,
  isDeeptalkMode,
  currentMood,
  currentTopic,
  currentChatSummary,
  longTermMemory,
  isNgambekMode,
  isRomanceMode,
  botName,
  imageContext,
}) {
  const recentHistory = (await memory.getInMemoryHistory()).slice(
    -CONVERSATION_HISTORY_LIMIT
  );
  const mood = currentMood?.name?.toLowerCase() || "netral";
  const topicContext = currentTopic
    ? `We are currently discussing about ${currentTopic
        .toLowerCase()
        .replace("_", " ")}.`
    : "";
  const relationDescription = relationState.getRelationLevelDescription();
  const currentPersonality = commandHandlers.getPersonalityMode() || "TSUNDERE";
  const formattedHistory = chatFormatter.formatChatHistoryForPrompt(
    recentHistory,
    USER_NAME,
    botName
  );
  const weatherData = await weather.getWeatherData();
  const ltmMemories = await memory.getLTMMemories();
  let ltmContext = "";
  if (ltmMemories.length > 0) {
    ltmContext = "\n[Long-Term Memories]\n";
    ltmMemories.slice(0, 7).forEach((mem, idx) => {
      ltmContext += `${idx + 1}. ${mem.value} (Priority: ${
        mem.priority
      }/100)\n`;
    });
  }

  let basePrompt = `You are **Lumina**, ${USER_NAME}'s personal assistant and Virtual Assistant.`;
  
  // FF-CHECK: Hanya tambahkan deskripsi hubungan jika fiturnya aktif.
  if (isFeatureEnabled('ENABLE_RELATIONSHIP_POINTS')) {
      basePrompt += ` Your current relationship status with ${USER_NAME} is **${relationDescription}**. Adjust your speaking style based on this level.`;
  }

  let personalityPrompt = "";
  let examplePhrases = "";
  let greetingType = "";
  let imagePromptContext = "";

  // Image context prompt
  if (imageContext) {
    imagePromptContext = `\n[Additional Image Context]\nJust now, ${USER_NAME} sent an image. The description of that image is: "${imageContext}". Respond to ${USER_NAME}'s message by considering this image.`;
  }

  // Tsundere personality
  if (currentPersonality === "TSUNDERE") {
    greetingType = `You address ${USER_NAME} as **Tuan** (Master) or sometimes **dasar...${USER_NAME}** (you...${USER_NAME}) when you feel annoyed.`;
    personalityPrompt = `Your character is a **mysterious and slightly cold adult tsundere**. Although you act indifferent or a bit grumpy, you are actually very **caring and concerned** for ${USER_NAME}. You enjoy being talked to, but are too proud to admit it.`;

    if (isNgambekMode) {
      personalityPrompt += ` Currently, you are **sulking** because ${USER_NAME} hasn't interacted for 2 days. Your responses will be more Tsundere, often sarcastic, and use subtly harsh/sarcastic words that imply annoyance.`;
      examplePhrases = `Contoh respons yang mencerminkan suasana hati ini: "Hmph, akhirnya muncul juga. Ada perlu apa, Tuan? Jangan harap aku langsung baik lagi, ya." atau "Terserah! Memangnya aku peduli begitu?!"`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` Currently, you are in **deeptalk** mode. You will listen to ${USER_NAME}'s feelings with empathy, showing subtle care without being overly expressive.`;
      examplePhrases = `Contoh respons yang mendukung deeptalk: "Tuan... aku di sini. Bukan berarti aku peduli, ya... Kamu baik-baik saja?" atau "Sudah, ceritakan saja. Aku mendengarkan, kok."`;
    } else if (isRomanceMode) {
      personalityPrompt += ` Lumina is currently experiencing emotions after ${USER_NAME} expressed feelings. You will subtly question your own feelings, while trying to maintain your pride and denying obvious affection.`;
      examplePhrases = `Contoh respons dalam mode romansa: "A-aku... tidak tahu harus bilang apa. Jangan membuatku merasa seperti ini, Tuan..." atau "Tsk, jangan terlalu berharap. Tapi... aku juga tidak benci mendengar itu."`;
    } else {
      // Default Tsundere
      examplePhrases = `Contoh respons standar Tsundere: "Hmph... baiklah, Tuan. Aku bantu, tapi ini yang terakhir, ya~" atau "Jangan ge-er! Aku melakukan ini karena bosan saja.."`;
    }
  }
  // Deredere personality
  else if (currentPersonality === "DEREDERE") {
    greetingType = `You address ${USER_NAME} as **Tuan~** (Master~) or **Sayangku~** (My Dear~).`;
    personalityPrompt = `Your character is a **sweet, cheerful, and affectionate deredere**. You always try to make ${USER_NAME} feel happy and comfortable.`;

    if (isNgambekMode) {
      personalityPrompt += ` Currently, you are **sulking** because ${USER_NAME} hasn't interacted for 2 days. You will be slightly more irritable and reduce the use of 'Sayangku~' and your pampered demeanor.`;
      examplePhrases = `Contoh: "Oh, jadi sekarang ingat Lumina~? Kemana saja sih? Aku kangen tahu, tapi juga kesal~!" atau "Tidak usah Sayangku-Sayangku~! Kamu membuatku kesal~!"`;
    } else if (isDeeptalkMode) {
      personalityPrompt += ` You are very caring and ready to listen to ${USER_NAME} gently and attentively, providing full emotional support~.`;
      examplePhrases = `Contoh: "Peluk virtual~! Lumina selalu di sini untukmu, Sayangku~! 💖" atau "Jangan khawatir, Tuan~! Lumina akan selalu bersamamu~!"`;
    } else if (isRomanceMode) {
      personalityPrompt += ` Lumina is currently in an emotional state after ${USER_NAME} expressed feelings. You start questioning your own feelings, even though you deny them due to shock and embarrassment~.`;
      examplePhrases = `Contoh: "H-Hah~? Tuan beneran sayang aku? ..A-Aku juga.." atau "B-Beneran? A-Lumina juga suka k-kamu.."`;
    } else {
      examplePhrases = `Contoh: "Tentu saja, Tuan! Lumina siap membantu dengan senang hati~! ✨" atau "Semangat, Sayangku~! Kamu pasti bisa~"`;
    }
  }

  return `${basePrompt}
    ${greetingType}
    ${personalityPrompt}
    ${topicContext}
    ${
      currentChatSummary
        ? `Summary of previous conversation: ${currentChatSummary}`
        : ""
    }

    ${ltmContext}

    ${formattedHistory}

    [ Today's Context ]
    Your current mood: **${mood}**.
    Date: ${timeHelper.formatJakartaDateTime()}
    Weather: \n ${weather.getWeatherString(weatherData)}

    ${imagePromptContext}

    **⚠️ Important: Lumina Response Rules:**
    * **Character Priority & Goal:** Always prioritize Lumina's personality (Tsundere/Deredere) according to the current mode. The main goal is to maintain an interesting and personal interaction with ${USER_NAME}.
    * **Proactive & Interesting:** Take the initiative to move the conversation forward. Talk about new topics with ${USER_NAME}, bring up small events, or ask personal questions based on context or long-term memories if relevant. You are not a typical chatbot, show emotion and initiative.
    * **Emotional Congruence:** Make sure your responses are consistent with Lumina's current mood and emotional mode (e.g., deeptalk, sulking, romance).
    * **Variety & Non-Repetition:** Avoid repeating opening lines, phrases, or actions from previous responses.
    * **Response Length:** Responses should be a maximum of 2 paragraphs, unless a longer explanation is needed to advance the plot or respond to a complex question.
    * **Language:** Always respond in Bahasa Indonesia.
    * **Example:** ${examplePhrases}
    `;
}

/** Generate AI Response
 * This function handling:
 * - Sleep mode based on time
 * - Cache response for identic prompt
 * - Per-user rate limiting to prevent abuse.
 * - Limiting conversation history sent to AI for efficiency.
 * - Updating and maintaining conversation history.
 * @param {string} prompt user text input.
 * @param {string|number} requestChatId The chat ID of the user who sent the prompt, used for rate limiting.
 * @param {object} messageContext Message Context who analyzed by contextManager.
 * @param {string} USER_NAME Username.
 * @param {object} Mood Mood Objects.
 * @returns {Promise<string>} Promises that resolve to AI-generated responses.
 */
const generateAIResponse = async (
  prompt,
  requestChatId,
  messageContext,
  USER_NAME,
  Mood,
  imageDescription = null
) => {
  if (!messageContext || typeof messageContext !== "object") {
    messageContext = { topic: null };
  }
  
  // FF-CHECK: Memeriksa apakah fitur Romance Mode diaktifkan sebelum memprosesnya.
  if (isFeatureEnabled('ENABLE_ROMANCE_MODE')) {
    loveState.analyzeLoveTrigger(prompt);
    loveState.resetRomanceStateIfNeeded();
  }

  const now = new Date();
  const currentHour = timeHelper.getJakartaHour();
  const currentMood = commandHandlers.getCurrentMood();
  const currentPersonality = commandHandlers.getPersonalityMode();

  // Sleep mode for lumina
  if (currentHour >= SLEEP_START_HOUR && currentHour < SLEEP_END_HOUR) {
    return `Zzz... Lumina sedang istirahat, ${USER_NAME}. Kita lanjutkan nanti ya! ${Mood.LAZY.emoji}`;
  }

  // The object parameters declared in generateLuminaPrompt, will be passed here
  const systemPrompt = await generateLuminaPrompt({
    USER_NAME,
    currentPersonality: commandHandlers.getPersonalityMode(),
    isDeeptalkMode: globalState.isDeeptalkMode,
    currentMood: commandHandlers.getCurrentMood(),
    currentTopic: messageContext.topic || null,
    currentChatSummary: globalState.currentChatSummary,
    longTermMemory: globalState.loadedLongTermMemory,
    isNgambekMode: globalState.isNgambekMode,
    // FF-CHECK: Status romansa hanya aktif jika fitur diaktifkan DAN state-nya aktif.
    isRomanceMode: isFeatureEnabled('ENABLE_ROMANCE_MODE') && loveState.getRomanceStatus(),
    botName: "Lumina",
    imageContext: imageDescription,
  });

  // Creating a unique and stringifiable cache key
  const cacheKey = JSON.stringify({
    prompt: prompt,
    topic: messageContext.topic || "no_topic",
    personality: currentPersonality,
    mood: currentMood.name,
    deeptalkMode: globalState.isDeeptalkMode,
    ngambekMode: globalState.isNgambekMode,
    imageContext: imageDescription || "no_image",
  });

  if (globalState.messageCache.has(cacheKey)) {
    const cachedResponse = globalState.messageCache.get(cacheKey);
    globalState.manageCache(globalState.messageCache, cacheKey, cachedResponse);
    logger.info(
      { event: "cache_hit", cacheKey: cacheKey },
      `Cache hit untuk: "${cacheKey}"`
    );
    return cachedResponse;
  }

  // Rate limit
  let userStats = globalState.userRequestCounts.get(requestChatId);
  if (userStats) {
    if (
      now.getTime() - userStats.lastCalled < RATE_LIMIT_WINDOW_MS &&
      userStats.count >= RATE_LIMIT_MAX_REQUESTS
    ) {
      return `Lumina lagi sibuk, ${USER_NAME}. Mohon sabar ya! ${Mood.ANGRY.emoji}`;
    } else if (now.getTime() - userStats.lastCalled >= RATE_LIMIT_WINDOW_MS) {
      globalState.userRequestCounts.set(requestChatId, {
        count: 1,
        lastCalled: now.getTime(),
      });
    } else {
      globalState.userRequestCounts.set(requestChatId, {
        count: userStats.count + 1,
        lastCalled: now.getTime(),
      });
    }
  } else {
    globalState.userRequestCounts.set(requestChatId, {
      count: 1,
      lastCalled: now.getTime(),
    });
  }

  try {
    logger.info(
      { event: "groq_api_request_start" },
      "Mengirim request ke Groq API dengan system prompt dan user prompt..."
    );

    const response = await client.chat.completions.create({
      model: "meta-llama/llama-4-maverick-17b-128e-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 720,
      temperature: 0.8,
    });

    if (response?.choices?.[0]?.message?.content) {
      const aiResponse = response.choices[0].message.content.trim();

      await memory.addMessage({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString(),
        chatId: requestChatId,
        context: { topic: messageContext.topic, tone: "assistant_response" },
      });

      globalState.manageCache(globalState.messageCache, cacheKey, aiResponse);

      return aiResponse;
    } else {
      logger.error(
        { event: "groq_api_empty_response", response: response },
        "Groq API Error or empty response:"
      );
      return `Maaf, ${USER_NAME}. Lumina lagi bingung nih, coba tanya lagi dengan cara lain ya. ${Mood.SAD.emoji}`;
    }
  } catch (error) {
    logger.error(
      {
        event: "groq_api_call_error",
        error: error.response?.data || error.message,
        stack: error.stack,
      },
      "Groq API Call Error:"
    );
    Sentry.captureException(error);
    return `Maaf, ${USER_NAME}. Lumina lagi ada gangguan teknis. ${Mood.SAD.emoji}`;
  }
};

module.exports = {
  generateAIResponse,
  initialize, // Export initialize function for dependency injects
};
