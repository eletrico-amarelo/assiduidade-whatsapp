import type { AnalysisResponse, AttendanceConfig } from './types';

export async function analyseFile(file: File, config: AttendanceConfig): Promise<AnalysisResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('config', JSON.stringify(config));

  const response = await fetch('/api/analyse', {
    method: 'POST',
    body: form,
  });

  const payload = (await response.json()) as AnalysisResponse | { error?: string };

  if (!response.ok) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Não foi possível analisar o ficheiro.');
  }

  return payload as AnalysisResponse;
}

export async function exportCompleteMonths(importId: string) {
  const response = await fetch(`/api/analyse/imports/${importId}/export-months`, { method: 'POST' });
  const payload = (await response.json()) as {
    created?: string[];
    skipped?: string[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? 'Não foi possível exportar os meses.');
  return { created: payload.created ?? [], skipped: payload.skipped ?? [] };
}

export async function changeImportedMessages(
  importId: string,
  config: AttendanceConfig,
  changes: Array<{ sourceLine: number; text?: string; remove?: boolean }>,
) {
  const response = await fetch(`/api/analyse/imports/${importId}/messages`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, changes }),
  });
  const payload = (await response.json()) as AnalysisResponse | { error?: string };
  if (!response.ok) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Não foi possível guardar as alterações.');
  }
  return payload as AnalysisResponse;
}
