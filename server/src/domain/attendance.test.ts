import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig } from '../config.js';
import { analyseAttendance } from './attendance.js';
import { parseWhatsAppExport } from '../parser/whatsapp.js';

test('marks a day complete only with both ordered pairs', () => {
  const content = [
    '20/07/2026, 09:01 - Ana: IN',
    '20/07/2026, 13:20 - Ana: OUT',
    '20/07/2026, 13:32 - Ana: IN',
    '20/07/2026, 18:58 - Ana: OUT',
  ].join('\n');

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), defaultConfig);
  assert.equal(result.days[0]?.status, 'complete');
  assert.equal(result.days[0]?.score, 100);
});

test('marks missing afternoon OUT as partial', () => {
  const content = [
    '20/07/2026, 09:01 - Ana: IN',
    '20/07/2026, 13:20 - Ana: OUT',
    '20/07/2026, 13:32 - Ana: IN',
  ].join('\n');

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), defaultConfig);
  assert.equal(result.days[0]?.status, 'partial');
  assert.equal(result.days[0]?.score, 50);
  assert.match(result.days[0]?.issues.join(' ') ?? '', /falta OUT/);
});

test('adds absent weekdays inside an explicit date range', () => {
  const content = [
    '20/07/2026, 09:01 - Ana: IN',
    '20/07/2026, 13:20 - Ana: OUT',
    '20/07/2026, 13:32 - Ana: IN',
    '20/07/2026, 18:58 - Ana: OUT',
  ].join('\n');
  const config = { ...defaultConfig, dateFrom: '2026-07-20', dateTo: '2026-07-22' };

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), config);
  assert.deepEqual(result.days.map((day) => day.status), ['complete', 'absent', 'absent']);
});

test('returns the messages that were not recognised as punches', () => {
  const content = [
    '20/07/2026, 09:01 - Ana: IN',
    '20/07/2026, 10:15 - Ana: Reunião às 11',
    '20/07/2026, 12:00 - Mensagens neste grupo estão protegidas',
  ].join('\n');

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), defaultConfig);

  assert.equal(result.ignoredMessages, 2);
  assert.deepEqual(
    result.ignoredMessageDetails.map((message) => ({
      author: message.author,
      text: message.text,
    })),
    [
      { author: 'Ana', text: 'Reunião às 11' },
      { author: undefined, text: 'Mensagens neste grupo estão protegidas' },
    ],
  );
});

test('excludes messages matching configured ignore patterns', () => {
  const content = [
    '20/07/2026, 09:01 - Ana: IN',
    '20/07/2026, 10:15 - Ana: Mensagem eliminada',
    '20/07/2026, 10:16 - Ana: REUNIÃO de equipa',
  ].join('\n');
  const config = {
    ...defaultConfig,
    ignoredMessagePatterns: ['mensagem eliminada', 'reuniao'],
  };

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), config);

  assert.equal(result.excludedMessages, 2);
  assert.equal(result.ignoredMessages, 0);
  assert.equal(result.recognisedPunches, 1);
});
