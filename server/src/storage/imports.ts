import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWhatsAppExport } from '../parser/whatsapp.js';
import type { MonthlyExport, WhatsAppMessage } from '../types.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(currentDirectory, '../../../data');
const importsDirectory = path.join(dataDirectory, 'imports');
const exportsDirectory = path.join(dataDirectory, 'exports');

interface ImportMetadata {
  filename: string;
  editedFilename?: string;
  editedInExports?: boolean;
}

export async function archiveImport(filename: string, content: string) {
  const importId = randomUUID();
  const directory = importDirectory(importId);
  const safeFilename = sanitiseFilename(filename);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, safeFilename), content, { encoding: 'utf8', flag: 'wx' });
  await writeMetadata(importId, { filename: safeFilename });
  return { importId, filename: safeFilename };
}

export async function getMonthlyExportPlan(messages: WhatsAppMessage[]): Promise<MonthlyExport[]> {
  const completeMonths = resolveCompleteMonths(messages);
  await mkdir(exportsDirectory, { recursive: true });
  return Promise.all(completeMonths.map(async ({ month, year }) => {
    const filename = monthlyFilename(month, year);
    return { month, year, filename, exists: await fileExists(path.join(exportsDirectory, filename)) };
  }));
}

export async function createMonthlyExports(importId: string) {
  const { content } = await readActiveImport(importId);
  const messages = parseWhatsAppExport(content);
  const plan = await getMonthlyExportPlan(messages);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const item of plan) {
    const target = path.join(exportsDirectory, item.filename);
    if (item.exists || await fileExists(target)) {
      skipped.push(item.filename);
      continue;
    }
    const monthKey = `${item.year}-${String(item.month).padStart(2, '0')}`;
    const monthContent = messages
      .filter((message) => message.date.startsWith(monthKey))
      .map((message) => message.raw)
      .join('\n');
    await writeFile(target, `${monthContent}\n`, { encoding: 'utf8', flag: 'wx' });
    created.push(item.filename);
  }

  return { created, skipped, plan: await getMonthlyExportPlan(messages) };
}

export function getMonthlyExportPath(filename: string) {
  if (!isMonthlyFilename(filename)) {
    throw new Error('Nome de exportação inválido.');
  }
  return path.join(exportsDirectory, filename);
}

export async function listMonthlyExports() {
  await mkdir(exportsDirectory, { recursive: true });
  const entries = await readdir(exportsDirectory);
  const files = entries.filter(isMonthlyFilename);
  const details = await Promise.all(files.map(async (filename) => {
    const info = await stat(path.join(exportsDirectory, filename));
    return {
      filename,
      size: info.size,
      updatedAt: info.mtime.toISOString(),
      edited: /_editado\.txt$/i.test(filename),
    };
  }));
  return details.sort(compareStoredExports);
}

export async function readMonthlyExport(filename: string) {
  return readFile(getMonthlyExportPath(filename), 'utf8');
}

export async function readActiveImportFile(importId: string) {
  const { content, metadata } = await readActiveImport(importId);
  return {
    content,
    filename: metadata.editedFilename ?? metadata.filename,
  };
}

export async function editImport(
  importId: string,
  changes: Array<{ sourceLine: number; text?: string; remove?: boolean }>,
) {
  const { content, metadata } = await readActiveImport(importId);
  const messages = parseWhatsAppExport(content);
  const byLine = new Map(changes.map((change) => [change.sourceLine, change]));
  const editedContent = messages
    .filter((message) => !byLine.get(message.sourceLine)?.remove)
    .map((message) => {
      const change = byLine.get(message.sourceLine);
      return change && typeof change.text === 'string' ? serialiseMessage(message, change.text) : message.raw;
    })
    .join('\n');

  const editedFilename = withEditedSuffix(metadata.filename);
  const isMonthlyFile = isMonthlyFilename(metadata.filename);
  const editedDirectory = isMonthlyFile ? exportsDirectory : importDirectory(importId);

  if (isMonthlyFile) {
    await mkdir(exportsDirectory, { recursive: true });
    const originalExportPath = path.join(exportsDirectory, metadata.filename);
    if (!await fileExists(originalExportPath)) {
      const originalContent = await readFile(path.join(importDirectory(importId), metadata.filename), 'utf8');
      await writeFile(originalExportPath, originalContent, { encoding: 'utf8', flag: 'wx' });
    }
  }

  await writeFile(path.join(editedDirectory, editedFilename), `${editedContent}\n`, 'utf8');
  await writeMetadata(importId, { ...metadata, editedFilename, editedInExports: isMonthlyFile });
  return { content: editedContent, filename: editedFilename };
}

export function resolveCompleteMonths(messages: WhatsAppMessage[]) {
  const dates = messages.map((message) => message.date).sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return [];

  const firstMonth = first.slice(0, 7);
  const lastMonth = last.slice(0, 7);
  const cursor = new Date(`${firstMonth}-01T00:00:00Z`);
  const final = new Date(`${lastMonth}-01T00:00:00Z`);
  const months: Array<{ month: number; year: number }> = [];

  while (cursor <= final) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const fullyCovered =
      key > firstMonth && key < lastMonth
      || (first <= `${key}-01` && last >= `${key}-${String(lastDay).padStart(2, '0')}`);
    if (fullyCovered) months.push({ month, year });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

async function readActiveImport(importId: string) {
  validateImportId(importId);
  const metadata = JSON.parse(
    await readFile(path.join(importDirectory(importId), 'metadata.json'), 'utf8'),
  ) as ImportMetadata;
  const activeFilename = metadata.editedFilename ?? metadata.filename;
  const activeDirectory = metadata.editedFilename && metadata.editedInExports
    ? exportsDirectory
    : importDirectory(importId);
  const content = await readFile(path.join(activeDirectory, activeFilename), 'utf8');
  return { content, metadata };
}

async function writeMetadata(importId: string, metadata: ImportMetadata) {
  await writeFile(
    path.join(importDirectory(importId), 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8',
  );
}

function serialiseMessage(message: WhatsAppMessage, text: string) {
  const [year, month, day] = message.date.split('-');
  const author = message.author ? `${message.author}: ` : '';
  return `${day}/${month}/${year}, ${message.time} - ${author}${text.trim()}`;
}

function importDirectory(importId: string) {
  validateImportId(importId);
  return path.join(importsDirectory, importId);
}

function validateImportId(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Importação inválida.');
}

function sanitiseFilename(filename: string) {
  const safe = path.basename(filename).replace(/[^\p{L}\p{N}._ -]/gu, '_');
  return safe.toLowerCase().endsWith('.txt') ? safe : `${safe}.txt`;
}

function withEditedSuffix(filename: string) {
  return filename.replace(/(?:_editado)?\.txt$/i, '_editado.txt');
}

function isMonthlyFilename(filename: string) {
  return /^assiduidade_(?:0[1-9]|1[0-2])_\d{4}(?:_editado)?\.txt$/i.test(filename);
}

export function monthlyFilename(month: number, year: number) {
  return `assiduidade_${String(month).padStart(2, '0')}_${year}.txt`;
}

export function compareStoredExports(
  a: { filename: string; edited: boolean; updatedAt: string },
  b: { filename: string; edited: boolean; updatedAt: string },
) {
  const aDate = monthlyFilenameDate(a.filename);
  const bDate = monthlyFilenameDate(b.filename);
  if (aDate !== bDate) return bDate - aDate;
  if (a.edited !== b.edited) return a.edited ? -1 : 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function monthlyFilenameDate(filename: string) {
  const match = /^assiduidade_(\d{2})_(\d{4})/i.exec(filename);
  if (!match) return 0;
  return Number(match[2]) * 100 + Number(match[1]);
}

async function fileExists(filename: string) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}
