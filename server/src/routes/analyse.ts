import '../env.js';
import { Router } from 'express';
import multer from 'multer';
import { defaultConfig } from '../config.js';
import { analyseAttendance } from '../domain/attendance.js';
import { parseWhatsAppExport } from '../parser/whatsapp.js';
import type { AttendanceConfig } from '../types.js';

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 5);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const valid = file.originalname.toLowerCase().endsWith('.txt') || file.mimetype === 'text/plain';
    if (!valid) {
      callback(new Error('Apenas são aceites ficheiros .txt.'));
      return;
    }
    callback(null, true);
  },
});

export const analyseRouter = Router();

analyseRouter.post('/', upload.single('file'), (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'Não foi recebido nenhum ficheiro .txt.' });
      return;
    }

    const config = parseConfig(request.body.config);
    const content = decodeTextFile(request.file.buffer);
    const messages = parseWhatsAppExport(content);
    const result = analyseAttendance(request.file.originalname, messages, config);

    response.json(result);
  } catch (error) {
    next(error);
  }
});

function parseConfig(value: unknown): AttendanceConfig {
  if (!value || typeof value !== 'string') return structuredClone(defaultConfig);
  const parsed = JSON.parse(value) as Partial<AttendanceConfig>;
  return {
    periods: Array.isArray(parsed.periods) ? parsed.periods : defaultConfig.periods,
    aliases: {
      in: Array.isArray(parsed.aliases?.in) ? parsed.aliases.in : defaultConfig.aliases.in,
      out: Array.isArray(parsed.aliases?.out) ? parsed.aliases.out : defaultConfig.aliases.out,
    },
    ignoredMessagePatterns: Array.isArray(parsed.ignoredMessagePatterns)
      ? parsed.ignoredMessagePatterns
      : defaultConfig.ignoredMessagePatterns,
    workingDays: Array.isArray(parsed.workingDays) ? parsed.workingDays : defaultConfig.workingDays,
    dateFrom: parsed.dateFrom || undefined,
    dateTo: parsed.dateTo || undefined,
  };
}

function decodeTextFile(buffer: Buffer) {
  // WhatsApp exports are normally UTF-8. The fallback avoids a hard failure on malformed bytes.
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}
