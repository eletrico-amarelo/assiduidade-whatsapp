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
