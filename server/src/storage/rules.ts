import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../config.js';
import { validateConfig } from '../domain/attendance.js';
import type { AttendanceConfig } from '../types.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const configDirectory = path.resolve(currentDirectory, '../../../data/config');
const rulesPath = path.join(configDirectory, 'regras.json');
const backupPath = path.join(configDirectory, 'regras.backup.json');
const temporaryPath = path.join(configDirectory, 'regras.tmp.json');

export async function loadRules(): Promise<{
  config: AttendanceConfig;
  source: 'saved' | 'default';
}> {
  try {
    const parsed = JSON.parse(await readFile(rulesPath, 'utf8')) as AttendanceConfig;
    validateConfig(parsed);
    return { config: parsed, source: 'saved' };
  } catch (error) {
    if (isMissingFile(error)) return { config: structuredClone(defaultConfig), source: 'default' };
    throw new Error(`Não foi possível ler regras.json: ${error instanceof Error ? error.message : 'conteúdo inválido'}`);
  }
}

export async function saveRules(config: AttendanceConfig) {
  validateConfig(config);
  await mkdir(configDirectory, { recursive: true });

  try {
    await copyFile(rulesPath, backupPath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  await writeFile(temporaryPath, `${JSON.stringify({ version: 1, ...config }, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, rulesPath);
  return loadRules();
}

export async function resetRules() {
  await mkdir(configDirectory, { recursive: true });
  try {
    await copyFile(rulesPath, backupPath);
    await unlink(rulesPath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  return { config: structuredClone(defaultConfig), source: 'default' as const };
}

export function getRulesFilePath() {
  return rulesPath;
}

function isMissingFile(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
