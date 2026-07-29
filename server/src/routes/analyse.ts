import '../env.js';
import { Router } from 'express';
import multer from 'multer';
import { defaultConfig } from '../config.js';
import { analyseAttendance } from '../domain/attendance.js';
import { parseWhatsAppExport } from '../parser/whatsapp.js';
import {
  archiveImport,
  createMonthlyExports,
  editImport,
  getMonthlyExportPath,
  getMonthlyExportPlan,
} from '../storage/imports.js';
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

analyseRouter.post('/', upload.single('file'), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'Não foi recebido nenhum ficheiro .txt.' });
      return;
    }

    const config = parseConfig(request.body.config);
    const content = decodeTextFile(request.file.buffer);
    const messages = parseWhatsAppExport(content);
    const archived = await archiveImport(request.file.originalname, content);
    const monthlyExports = await getMonthlyExportPlan(messages);
    const result = analyseAttendance(archived.filename, messages, config, {
      importId: archived.importId,
      monthlyExports,
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

analyseRouter.post('/imports/:importId/export-months', async (request, response, next) => {
  try {
    response.json(await createMonthlyExports(request.params.importId));
  } catch (error) {
    next(error);
  }
});

analyseRouter.get('/exports/:filename', (request, response, next) => {
  try {
    response.download(getMonthlyExportPath(request.params.filename), request.params.filename, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

analyseRouter.patch('/imports/:importId/messages', async (request, response, next) => {
  try {
    const changes = parseChanges(request.body.changes);
    const config = parseConfigValue(request.body.config);
    const edited = await editImport(request.params.importId, changes);
    const messages = parseWhatsAppExport(edited.content);
    const monthlyExports = await getMonthlyExportPlan(messages);
    response.json(analyseAttendance(edited.filename, messages, config, {
      importId: request.params.importId,
      monthlyExports,
      editedFilename: edited.filename,
    }));
  } catch (error) {
    next(error);
  }
});

function parseConfig(value: unknown): AttendanceConfig {
  if (!value || typeof value !== 'string') return structuredClone(defaultConfig);
  return parseConfigValue(JSON.parse(value));
}

function parseConfigValue(value: unknown): AttendanceConfig {
  const parsed = (value && typeof value === 'object' ? value : {}) as Partial<AttendanceConfig>;
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

function parseChanges(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Não foram recebidas alterações.');
  return value.map((change) => {
    if (!change || typeof change !== 'object') throw new Error('Alteração de mensagem inválida.');
    const candidate = change as { sourceLine?: unknown; text?: unknown; remove?: unknown };
    if (!Number.isInteger(candidate.sourceLine) || Number(candidate.sourceLine) < 1) {
      throw new Error('Linha de mensagem inválida.');
    }
    if (candidate.remove !== true && typeof candidate.text !== 'string') {
      throw new Error('Indica o novo texto ou remove a mensagem.');
    }
    return {
      sourceLine: Number(candidate.sourceLine),
      text: typeof candidate.text === 'string' ? candidate.text : undefined,
      remove: candidate.remove === true,
    };
  });
}

function decodeTextFile(buffer: Buffer) {
  // WhatsApp exports are normally UTF-8. The fallback avoids a hard failure on malformed bytes.
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}
