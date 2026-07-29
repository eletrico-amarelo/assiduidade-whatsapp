import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWhatsAppExport } from '../parser/whatsapp.js';
import { compareStoredExports, monthlyFilename, resolveCompleteMonths } from './imports.js';

test('formats the month with two digits in monthly filenames', () => {
  assert.equal(monthlyFilename(5, 2024), 'assiduidade_05_2024.txt');
  assert.equal(monthlyFilename(12, 2024), 'assiduidade_12_2024.txt');
});

test('sorts stored exports by year and month with the newest first', () => {
  const files = [
    { filename: 'assiduidade_12_2025.txt', edited: false, updatedAt: '2026-01-01T00:00:00.000Z' },
    { filename: 'assiduidade_01_2026.txt', edited: false, updatedAt: '2026-01-02T00:00:00.000Z' },
    { filename: 'assiduidade_05_2024.txt', edited: false, updatedAt: '2026-01-03T00:00:00.000Z' },
    { filename: 'assiduidade_01_2026_editado.txt', edited: true, updatedAt: '2026-01-04T00:00:00.000Z' },
  ];

  assert.deepEqual(
    files.sort(compareStoredExports).map((file) => file.filename),
    [
      'assiduidade_01_2026_editado.txt',
      'assiduidade_01_2026.txt',
      'assiduidade_12_2025.txt',
      'assiduidade_05_2024.txt',
    ],
  );
});

test('exports only months completely enclosed by the conversation interval', () => {
  const messages = parseWhatsAppExport([
    '15/01/2026, 09:00 - Ana: IN',
    '10/02/2026, 09:00 - Ana: IN',
    '10/03/2026, 09:00 - Ana: IN',
    '05/04/2026, 09:00 - Ana: IN',
  ].join('\n'));

  assert.deepEqual(resolveCompleteMonths(messages), [
    { month: 2, year: 2026 },
    { month: 3, year: 2026 },
  ]);
});

test('includes a boundary month when the conversation covers its first and last day', () => {
  const messages = parseWhatsAppExport([
    '01/02/2026, 09:00 - Ana: IN',
    '28/02/2026, 18:00 - Ana: OUT',
  ].join('\n'));

  assert.deepEqual(resolveCompleteMonths(messages), [{ month: 2, year: 2026 }]);
});
