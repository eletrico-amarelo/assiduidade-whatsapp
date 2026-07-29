import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig } from '../config.js';
import { analyseAttendance, validateConfig } from './attendance.js';
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

test('assigns OUT and IN at the shared 13:30 boundary to different periods', () => {
  const content = [
    '20/07/2026, 08:01 - Ana: IN',
    '20/07/2026, 13:30 - Ana: OUT',
    '20/07/2026, 13:30 - Ana: IN',
    '20/07/2026, 19:59 - Ana: OUT',
  ].join('\n');

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), defaultConfig);

  assert.equal(result.days[0]?.status, 'complete');
  assert.deepEqual(
    result.days[0]?.periods.map((period) => [period.inTime, period.outTime]),
    [['08:01', '13:30'], ['13:30', '19:59']],
  );
});

test('accepts punches up to 15 minutes outside each period', () => {
  const content = [
    '20/07/2026, 07:45 - Ana: IN',
    '20/07/2026, 13:40 - Ana: OUT',
    '20/07/2026, 13:20 - Ana: IN',
    '20/07/2026, 20:15 - Ana: OUT',
  ].join('\n');

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), defaultConfig);

  assert.equal(result.days[0]?.status, 'complete');
  assert.equal(result.days[0]?.outsidePeriod.length, 0);
  assert.deepEqual(
    result.days[0]?.periods.map((period) => [period.inTime, period.outTime]),
    [['07:45', '13:40'], ['13:20', '20:15']],
  );
});

test('keeps punches beyond the tolerance outside configured periods', () => {
  const content = [
    '20/07/2026, 07:44 - Ana: IN',
    '20/07/2026, 13:20 - Ana: OUT',
    '20/07/2026, 13:31 - Ana: IN',
    '20/07/2026, 20:16 - Ana: OUT',
  ].join('\n');

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), defaultConfig);

  assert.equal(result.days[0]?.status, 'partial');
  assert.equal(result.days[0]?.outsidePeriod.length, 2);
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

test('does not count Portuguese national holidays as attendance days', () => {
  const content = [
    '30/04/2026, 08:01 - Ana: IN',
    '30/04/2026, 13:20 - Ana: OUT',
    '30/04/2026, 13:31 - Ana: IN',
    '30/04/2026, 19:00 - Ana: OUT',
  ].join('\n');
  const config = { ...defaultConfig, dateFrom: '2026-04-30', dateTo: '2026-05-04' };

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), config);

  assert.deepEqual(
    result.days.map((day) => [day.date, day.status]),
    [
      ['2026-04-30', 'complete'],
      ['2026-05-01', 'holiday'],
      ['2026-05-04', 'absent'],
    ],
  );
  assert.equal(result.summaries[0]?.totalDays, 2);
});

test('shows participant vacations without counting them in attendance totals', () => {
  const content = [
    '03/08/2026, 08:01 - Ana Silva: IN',
    '03/08/2026, 13:20 - Ana Silva: OUT',
    '03/08/2026, 13:31 - Ana Silva: IN',
    '03/08/2026, 19:00 - Ana Silva: OUT',
  ].join('\n');
  const config = {
    ...defaultConfig,
    dateFrom: '2026-08-03',
    dateTo: '2026-08-05',
    vacations: [{
      id: 'ferias-ana',
      participant: 'ana silva',
      from: '2026-08-04',
      to: '2026-08-05',
      description: 'Férias de verão',
    }],
  };

  const result = analyseAttendance('chat.txt', parseWhatsAppExport(content), config);

  assert.deepEqual(result.days.map((day) => day.status), ['complete', 'vacation', 'vacation']);
  assert.equal(result.days[1]?.vacationDescription, 'Férias de verão');
  assert.equal(result.summaries[0]?.totalDays, 1);
  assert.equal(result.summaries[0]?.attendanceRate, 100);
});

test('rejects overlapping vacations for the same participant', () => {
  assert.throws(() => validateConfig({
    ...defaultConfig,
    vacations: [
      { id: 'one', participant: 'Ana', from: '2026-08-01', to: '2026-08-10' },
      { id: 'two', participant: 'ana', from: '2026-08-10', to: '2026-08-15' },
    ],
  }), /sobrepostos/);
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
