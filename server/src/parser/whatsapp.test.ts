import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWhatsAppExport } from './whatsapp.js';

test('parses Android and iOS exports', () => {
  const content = [
    '17/07/2026, 09:02 - Ana: IN',
    '[17/07/2026, 13:05:12] Ana: OUT',
    '17/07/26, 13:35 - Bruno: Entrada',
  ].join('\n');

  const messages = parseWhatsAppExport(content);
  assert.equal(messages.length, 3);
  assert.deepEqual(messages.map((message) => message.time), ['09:02', '13:05', '13:35']);
  assert.equal(messages[0]?.author, 'Ana');
});

test('attaches multiline content to the previous message', () => {
  const messages = parseWhatsAppExport('17/07/2026, 09:02 - Ana: IN\nnota adicional');
  assert.equal(messages[0]?.text, 'IN\nnota adicional');
});
