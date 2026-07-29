import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWhatsAppExport } from '../parser/whatsapp.js';
import { resolveCompleteMonths } from './imports.js';

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
