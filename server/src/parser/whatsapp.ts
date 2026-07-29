import type { WhatsAppMessage } from '../types.js';

const MESSAGE_PATTERNS = [
  // Android: 17/07/2026, 09:02 - Nome: IN
  /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\s+[\-–—]\s+(.*)$/i,
  // iOS: [17/07/2026, 09:02:12] Nome: IN
  /^\[(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\]\s*(.*)$/i,
];

export function parseWhatsAppExport(content: string): WhatsAppMessage[] {
  const lines = content.replace(/^\uFEFF/, '').replace(/[\u200e\u200f]/g, '').split(/\r?\n/);
  const messages: WhatsAppMessage[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const parsed = parseStartLine(line, index + 1);

    if (parsed) {
      messages.push(parsed);
      continue;
    }

    const previous = messages.at(-1);
    if (previous && line.trim()) {
      previous.text += `\n${line}`;
      previous.raw += `\n${line}`;
    }
  }

  return messages.sort((a, b) => a.sortKey - b.sortKey);
}

function parseStartLine(line: string, sourceLine: number): WhatsAppMessage | null {
  for (const pattern of MESSAGE_PATTERNS) {
    const match = line.match(pattern);
    if (!match) continue;

    const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw = '0', meridiem, body = ''] = match;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = normaliseYear(Number(yearRaw));
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);

    if (meridiem) {
      const marker = meridiem.toLowerCase();
      if (marker === 'pm' && hour < 12) hour += 12;
      if (marker === 'am' && hour === 12) hour = 0;
    }

    if (!isValidDateParts(year, month, day, hour, minute, second)) return null;

    const { author, text } = splitAuthor(body);
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const time = `${pad(hour)}:${pad(minute)}`;

    return {
      date,
      time,
      minuteOfDay: hour * 60 + minute,
      sortKey: Date.UTC(year, month - 1, day, hour, minute, second),
      author,
      text,
      sourceLine,
      raw: line,
    };
  }

  return null;
}

function splitAuthor(body: string): { author?: string; text: string } {
  const separator = body.indexOf(':');
  if (separator <= 0) return { text: body.trim() };

  const author = body.slice(0, separator).trim();
  const text = body.slice(separator + 1).trim();
  return author ? { author, text } : { text };
}

function normaliseYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function isValidDateParts(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  if (month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
