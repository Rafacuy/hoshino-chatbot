// modules/documentReader.js

const fs = require('fs').promises;
const path = require('path');
const Sentry = require('@sentry/node');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const logger = require('../utils/logger');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_LENGTH = 15000; // Batas karakter untuk dikirim ke AI, mencegah token limit
const SUSPICIOUS_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.py', '.msi', '.dll', '.vbs'];

/**
 * Membaca file, mengekstrak teksnya, dan mengembalikannya untuk dirangkum menggunakan generateAIResponse.
 * @param {string} filePath - Path menuju file yang akan diproses.
 * @param {object} msg - Objek pesan asli dari Telegram untuk konteks.
 * @param {object} aiDependencies - Objek berisi { generateAIResponse, USER_NAME, Mood }.
 * @returns {Promise<string>} Rangkuman dokumen yang dihasilkan oleh AI.
 */
async function summarizeDocument(filePath, msg, aiDependencies) {
    try {
        const stats = await fs.stat(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        // Security Check file Extension & Size
        if (SUSPICIOUS_EXTENSIONS.includes(fileExt)) {
            throw new Error(`File type ${fileExt} is not allowed for security reasons.`);
        }
        if (stats.size > MAX_FILE_SIZE) {
            throw new Error(`File size ${stats.size} exceeds the 5MB limit.`);
        }

        logger.info({ event: 'file_processing_start', file: filePath, size: stats.size }, 'Starting document processing.');

        // Ekstrak Teks berdasarkan Tipe File
        let text = '';
        switch (fileExt) {
            case '.pdf':
                const dataBuffer = await fs.readFile(filePath);
                const data = await pdf(dataBuffer);
                text = data.text;
                break;
            case '.docx':
                const docxResult = await mammoth.extractRawText({ path: filePath });
                text = docxResult.value;
                break;
            case '.txt':
            case '.csv':
            case '.md':
                text = await fs.readFile(filePath, 'utf-8');
                break;
            default:
                throw new Error(`Unsupported file type: ${fileExt}`);
        }

        logger.info({ event: 'text_extraction_success', length: text.length }, 'Text extracted successfully.');

        // Potong Teks jika terlalu panjang
        let processedText = text;
        if (text.length > MAX_TEXT_LENGTH) {
            processedText = text.substring(0, MAX_TEXT_LENGTH) + "\n\n[...teks dipotong karena terlalu panjang...]";
            logger.warn({ event: 'text_truncated', original: text.length, new: processedText.length }, 'Text truncated due to length limit.');
        }

        // Dapatkan fungsi dan data yang diperlukan dari dependensi
        const { generateAIResponse, USER_NAME, Mood } = aiDependencies;

        // Buat prompt khusus untuk tugas merangkum, yang akan menjadi input 'user' untuk generateAIResponse.
        // Prompt ini menginstruksikan AI untuk bertindak sebagai Lumina tetapi dengan tugas khusus.
        // Prompt sistem dari generateAIResponse akan tetap menangani kepribadiannya.
        const summaryUserPrompt = `[Document Context] User baru saja mengirimkan dokumen. Coba analisis dan bantu user dengan dokumen yang dikirimkan. Jika tidak ada konteks, rangkum dokumen yang dikirimkan user. \n\nBerikut teksnya:\n\n---\n\n${processedText}`;

        logger.info({ event: 'summarization_start_with_ai_response' }, 'Sending document text to generateAIResponse for summarization.');

        // Panggil generateAIResponse dengan argumen yang sesuai
        const summary = await generateAIResponse(
            summaryUserPrompt,
            msg.chat.id,
            { topic: 'document_summary' }, // messageContext
            USER_NAME,
            Mood
        );

        logger.info({ event: 'summarization_success_with_ai_response' }, 'Successfully received summary via generateAIResponse.');
        return summary;

    } catch (error) {
        logger.error({ event: 'document_processing_error', error: error.message, stack: error.stack }, 'An error occurred in summarizeDocument.');
        Sentry.captureException(error);
        // Melempar error lagi agar bisa ditangkap oleh handler
        throw error;
    } finally {
        // Auto-delete file
        try {
            await fs.unlink(filePath);
            logger.info({ event: 'file_cleanup_success', file: filePath }, 'Temporary file deleted successfully.');
        } catch (unlinkError) {
            logger.error({ event: 'file_cleanup_error', error: unlinkError.message, file: filePath }, 'Failed to delete temporary file.');
            Sentry.captureException(unlinkError);
        }
    }
}

module.exports = { summarizeDocument };
