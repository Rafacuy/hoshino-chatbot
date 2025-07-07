// data/memory.js
// Handles persistence-data memory for the Lumina bot using LokiJS.
// Versi ini dioptimalkan untuk performa dan efisiensi memori.
// This module manages chat history, user preferences, and long-term memory (LTM),
// including automatic data cleanup routines.

const path = require("path");
const Loki = require("lokijs");

// --- Configuration Constants ---

const DB_PATH =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "data", "Lumina_memory.json")
    : path.join(__dirname, "memory.json");

const MAX_HISTORY_LENGTH = 100;
// OPTIMASI: Ambang batas untuk flush, memberikan buffer sebelum melakukan trim.
const FLUSH_THRESHOLD = MAX_HISTORY_LENGTH + 20;
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 1 minggu
const LTM_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 jam
const LTM_CLEANUP_BATCH_SIZE = 50; // OPTIMASI: Ukuran batch untuk penghapusan LTM.
const COMPACTION_INTERVAL = 12 * 60 * 60 * 1000; // 12 jam
const QUERY_CACHE_TTL = 5000; // 5 detik TTL untuk cache query.

// --- Database Lazy Initialization ---

// OPTIMASI: Objek database tidak diinisialisasi saat startup.
// Ini akan diinisialisasi pada panggilan database pertama.
let dbInstance = null;
let initializationPromise = null;
let queryCache = {
  history: {
    data: null,
    timestamp: 0,
  },
};

/**
 * OPTIMASI: Lazy Initialization
 * Menginisialisasi database hanya saat pertama kali dibutuhkan.
 * @returns {Promise<object>} Promise yang me-resolve dengan instance DB yang siap.
 */
const getDbInstance = () => {
  if (!initializationPromise) {
    initializationPromise = new Promise((resolve, reject) => {
      console.log(`Initializing LokiJS database at ${DB_PATH}...`);
      // OPTIMASI: Pengaturan autosave yang disesuaikan dan throttling dinonaktifkan.
      const db = new Loki(DB_PATH, {
        adapter: new Loki.LokiFsAdapter(),
        autoload: true,
        autoloadCallback: () => {
          // OPTIMASI: Indeks biner adaptif diaktifkan untuk query timestamp yang lebih cepat.
          const history =
            db.getCollection("history") ||
            db.addCollection("history", {
              indices: ["timestamp"],
              adaptiveBinaryIndices: true,
            });

          const preferences =
            db.getCollection("preferences") ||
            db.addCollection("preferences", { unique: ["key"] });

          // OPTIMASI: Koleksi terpisah untuk LTM untuk menghindari pemindaian regex yang lambat.
          const ltm =
            db.getCollection("ltm") ||
            db.addCollection("ltm", {
              indices: ["createdAt", "priority"],
            });

          dbInstance = { db, history, preferences, ltm };
          console.log("LokiJS database and collections are ready.");
          resolve(dbInstance);
        },
        // OPTIMASI: Interval autosave yang lebih lama dan non-throttled.
        autosave: true,
        autosaveInterval: 10000, // 10 detik
        throttledSaves: false,
      });
    }).catch((err) => {
      console.error("Fatal error during LokiJS database initialization:", err);
      process.exit(1);
    });
  }
  return initializationPromise;
};

// --- Core Memory Management Functions ---

/**
 * OPTIMASI: Caching Hasil Query
 * Memuat riwayat percakapan terbaru, dengan caching untuk mengurangi query berulang.
 * @returns {Promise<Array<Object>>}
 */
const load = async () => {
  const { history } = await getDbInstance();
  const now = Date.now();

  // Periksa cache terlebih dahulu
  if (queryCache.history.data && now - queryCache.history.timestamp < QUERY_CACHE_TTL) {
    return queryCache.history.data;
  }

  try {
    const recentHistory = history
      .chain()
      .simplesort("timestamp", true)
      .limit(MAX_HISTORY_LENGTH)
      .data();

    const chronologicalHistory = recentHistory.reverse();
    
    // Simpan hasil ke cache
    queryCache.history = {
        data: chronologicalHistory,
        timestamp: now
    };

    return chronologicalHistory;
  } catch (error) {
    console.error("Error loading history:", error);
    return [];
  }
};

/**
 * Menambahkan pesan baru ke riwayat.
 * @param {object} message - Objek pesan yang akan ditambahkan.
 */
const addMessage = async (message) => {
  const { history } = await getDbInstance();
  if (!message || typeof message.content !== "string" || message.content.trim() === "") {
    console.warn("Attempted to add invalid message:", message);
    return;
  }

  try {
    const messageToStore = {
      role: message.role || "user",
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      chatId: message.chatId || "",
      context: message.context || {},
    };
    history.insert(messageToStore);
    queryCache.history.data = null; // Invalidate cache
    await flush(); // Flush dipanggil di sini, tetapi logika internalnya dioptimalkan.
  } catch (error) {
    console.error("Error adding message to history:", error);
  }
};

/**
 * OPTIMASI: Flushing Berbasis Ambang Batas
 * Memangkas koleksi riwayat hanya jika ukurannya jauh melebihi batas maksimum.
 * @returns {Promise<boolean>}
 */
const flush = async () => {
  const { history } = await getDbInstance();
  try {
    const currentHistoryCount = history.count();

    if (currentHistoryCount > FLUSH_THRESHOLD) {
      const excessCount = currentHistoryCount - MAX_HISTORY_LENGTH;
      const oldMessages = history
        .chain()
        .simplesort("timestamp") // Urutkan menaik (yang tertua dulu)
        .limit(excessCount)
        .data();

      if (oldMessages.length > 0) {
        console.log(`Trimming ${oldMessages.length} old messages from history...`);
        history.remove(oldMessages);
        queryCache.history.data = null; // Invalidate cache
      }
    }
    return true;
  } catch (error) {
    console.error("Error during memory flush (trimming):", error);
    return false;
  }
};

/**
 * Menyimpan atau memperbarui preferensi.
 * @param {string} key - Kunci unik untuk preferensi.
 * @param {any} value - Nilai yang akan disimpan.
 */
const savePreference = async (key, value) => {
  const { preferences } = await getDbInstance();
  try {
    const existingPref = preferences.findOne({ key });
    if (existingPref) {
      existingPref.value = value;
      preferences.update(existingPref);
    } else {
      preferences.insert({ key, value });
    }
  } catch (error) {
    console.error(`Error saving preference for key "${key}":`, error);
  }
};

/**
 * Mengambil nilai preferensi berdasarkan kunci.
 * @param {string} key - Kunci preferensi yang akan diambil.
 * @returns {Promise<any|undefined>}
 */
const getPreference = async (key) => {
  const { preferences } = await getDbInstance();
  try {
    const pref = preferences.findOne({ key });
    return pref ? pref.value : undefined;
  } catch (error) {
    console.error(`Error getting preference for key "${key}":`, error);
    return undefined;
  }
};

// --- LTM Specific Functions (Optimized) ---

/**
 * OPTIMASI: Query LTM yang Efisien
 * Mengambil semua LTM dari koleksi khususnya.
 * @returns {Promise<Array<Object>>}
 */
const getLTMMemories = async () => {
  const { ltm } = await getDbInstance();
  try {
    // Cukup query koleksi ltm, jauh lebih cepat daripada regex.
    return ltm.chain().simplesort("priority", true).data();
  } catch (error) {
    console.error("Error getting LTM memories:", error);
    return [];
  }
};

/**
 * Menyimpan memori jangka panjang (LTM).
 * @param {string} key - Kunci unik untuk LTM.
 * @param {object} ltmData - Data LTM (termasuk konten, prioritas, dll.).
 */
const saveLTMMemory = async (key, ltmData) => {
    const { ltm } = await getDbInstance();
    try {
        const existingLtm = ltm.findOne({ key });
        const dataToStore = { key, ...ltmData, createdAt: ltmData.createdAt || new Date().toISOString() };
        if (existingLtm) {
            Object.assign(existingLtm, dataToStore);
            ltm.update(existingLtm);
        } else {
            ltm.insert(dataToStore);
        }
    } catch (error) {
        console.error(`Error saving LTM for key "${key}":`, error);
    }
};

/**
 * OPTIMASI: Pembersihan Batch
 * Membersihkan LTM lama secara bertahap untuk menghindari pemblokiran loop peristiwa.
 */
const cleanupOldLTMs = async () => {
  console.log("Auto-cleanup LTM: Starting batch cleanup process...");
  const { ltm } = await getDbInstance();
  try {
    const now = new Date();
    let deletedCount = 0;
    
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const criteria = {
        $or: [
            { priority: 100, createdAt: { $lt: new Date(now - 60 * MS_PER_DAY).toISOString() } }, // > 2 bulan
            { priority: { $between: [91, 99] }, createdAt: { $lt: new Date(now - 14 * MS_PER_DAY).toISOString() } }, // > 2 minggu
            { priority: { $lte: 90 }, createdAt: { $lt: new Date(now - 5 * MS_PER_DAY).toISOString() } } // > 5 hari
        ]
    };

    let hasMore = true;
    while (hasMore) {
        const oldDocs = ltm.chain().find(criteria).limit(LTM_CLEANUP_BATCH_SIZE).data();

        if (oldDocs.length > 0) {
            ltm.remove(oldDocs);
            deletedCount += oldDocs.length;
            console.log(`Auto-cleanup LTM: Batch removed ${oldDocs.length} entries.`);
        } else {
            hasMore = false;
        }
    }

    if (deletedCount > 0) {
      console.log(`Auto-cleanup LTM: Finished. Removed ${deletedCount} old LTM entries in total.`);
    } else {
      console.log("Auto-cleanup LTM: No old LTM entries to clean up.");
    }
  } catch (error) {
    console.error("Auto-cleanup LTM error:", error);
  }
};


// --- Auto-maintenance Functions ---

/**
 * OPTIMASI: Kompaksi Database Berkala
 * Secara berkala menyimpan database ke disk, yang juga melakukan kompaksi.
 */
const compactDatabase = async () => {
    console.log("Performing periodic database compaction...");
    const { db } = await getDbInstance();
    db.saveDatabase((err) => {
        if (err) {
            console.error("Error during periodic compaction:", err);
        } else {
            console.log("Database compaction successful.");
        }
    });
};

/**
 * Membersihkan pesan riwayat yang sangat lama.
 */
const cleanupOldMessages = async () => {
  const { history } = await getDbInstance();
  try {
    const oneWeekAgo = new Date(Date.now() - CLEANUP_INTERVAL).toISOString();
    const oldDocs = history.find({ timestamp: { $lt: oneWeekAgo } });
    if (oldDocs.length > 0) {
      history.remove(oldDocs);
      console.log(`Auto-cleanup: Removed ${oldDocs.length} old messages from history.`);
    }
  } catch (error) {
    console.error("Auto-cleanup error (history):", error);
  }
};

// --- Scheduling and Startup ---

(async () => {
  await getDbInstance(); // Pastikan DB siap sebelum menjadwalkan tugas.
  console.log("Scheduling maintenance jobs...");
  setInterval(cleanupOldMessages, CLEANUP_INTERVAL);
  setInterval(cleanupOldLTMs, LTM_CLEANUP_INTERVAL);
  setInterval(compactDatabase, COMPACTION_INTERVAL);

  console.log("Running initial cleanup on startup...");
  cleanupOldMessages();
  cleanupOldLTMs();
})();

// --- Module Exports ---

module.exports = {
  load,
  addMessage,
  getPreference,
  savePreference,
  deletePreference: async (key) => { 
      const { preferences } = await getDbInstance();
      preferences.findAndRemove({ key });
  },
  getLTMMemories,
  saveLTMMemory,
  closeDb: async () => {
    if (!dbInstance) return;
    const { db } = await getDbInstance();
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else {
          console.log("LokiJS Database connection closed.");
          resolve();
        }
      });
    });
  },
};
