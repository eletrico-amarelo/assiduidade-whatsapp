import type {
  AnalysisResponse,
  AttendanceConfig,
  AttendanceDay,
  ParticipantSummary,
  MonthlyExport,
  PeriodResult,
  Punch,
  PunchKind,
  WhatsAppMessage,
} from '../types.js';

export function analyseAttendance(
  filename: string,
  messages: WhatsAppMessage[],
  config: AttendanceConfig,
  context: {
    importId?: string;
    monthlyExports?: MonthlyExport[];
    editedFilename?: string;
  } = {},
): AnalysisResponse {
  validateConfig(config);

  const analysableMessages = messages.filter(
    (message) => !matchesIgnoredMessage(message.text, config.ignoredMessagePatterns),
  );
  const excludedMessages = messages.length - analysableMessages.length;
  const classifiedMessages = analysableMessages.map((message) => ({
    message,
    punch: toPunch(message, config),
  }));
  const punches = classifiedMessages
    .map(({ punch }) => punch)
    .filter((punch): punch is Punch => punch !== null);
  const ignoredMessageDetails = classifiedMessages
    .filter(({ punch }) => punch === null)
    .map(({ message }) => ({
      date: message.date,
      time: message.time,
      author: message.author,
      text: message.text,
      sourceLine: message.sourceLine,
    }));

  const participants = [...new Set(punches.map((punch) => punch.participant))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );

  const warnings: string[] = [];
  if (messages.length === 0) warnings.push('Não foi reconhecida nenhuma mensagem no formato de exportação do WhatsApp.');
  if (punches.length === 0 && analysableMessages.length > 0) warnings.push('Foram lidas mensagens, mas nenhuma correspondia aos aliases configurados para IN ou OUT.');

  const dateRange = resolveDateRange(punches, config);
  if (!dateRange && punches.length > 0) warnings.push('Não foi possível determinar um intervalo de datas válido.');

  const days = dateRange
    ? participants.flatMap((participant) => buildParticipantDays(participant, punches, config, dateRange.from, dateRange.to))
    : [];

  const summaries = participants.map((participant) => summariseParticipant(participant, days));

  return {
    importId: context.importId ?? '',
    filename,
    totalMessages: messages.length,
    recognisedPunches: punches.length,
    ignoredMessages: ignoredMessageDetails.length,
    ignoredMessageDetails,
    excludedMessages,
    participants,
    days,
    summaries,
    warnings,
    config,
    monthlyExports: context.monthlyExports ?? [],
    editedFilename: context.editedFilename,
  };
}

export function toPunch(message: WhatsAppMessage, config: AttendanceConfig): Punch | null {
  if (!message.author) return null;
  const kind = resolvePunchKind(message.text, config);
  if (!kind) return null;

  return {
    participant: message.author,
    date: message.date,
    time: message.time,
    minuteOfDay: message.minuteOfDay,
    sortKey: message.sortKey,
    kind,
    message: message.text,
  };
}

export function resolvePunchKind(text: string, config: AttendanceConfig): PunchKind | null {
  const normalised = normaliseText(text);
  const matchesIn = matchesAlias(normalised, config.aliases.in);
  const matchesOut = matchesAlias(normalised, config.aliases.out);
  if (matchesIn === matchesOut) return null;
  return matchesIn ? 'IN' : 'OUT';
}

function buildParticipantDays(
  participant: string,
  allPunches: Punch[],
  config: AttendanceConfig,
  from: string,
  to: string,
): AttendanceDay[] {
  const punches = allPunches.filter((punch) => punch.participant === participant);
  const byDate = new Map<string, Punch[]>();
  for (const punch of punches) {
    const entries = byDate.get(punch.date) ?? [];
    entries.push(punch);
    byDate.set(punch.date, entries);
  }

  return enumerateDates(from, to)
    .filter((date) => config.workingDays.includes(dayOfWeek(date)))
    .map((date) => evaluateDay(participant, date, byDate.get(date) ?? [], config));
}

function evaluateDay(
  participant: string,
  date: string,
  punches: Punch[],
  config: AttendanceConfig,
): AttendanceDay {
  const sorted = [...punches].sort((a, b) => a.sortKey - b.sortKey);
  const assigned = new Set<Punch>();

  const periods = config.periods.map((period) => {
    const start = timeToMinutes(period.start);
    const end = timeToMinutes(period.end);
    const periodPunches = sorted.filter((punch) => punch.minuteOfDay >= start && punch.minuteOfDay <= end);
    periodPunches.forEach((punch) => assigned.add(punch));
    return evaluatePeriod(period.id, period.label, periodPunches);
  });

  const outsidePeriod = sorted
    .filter((punch) => !assigned.has(punch))
    .map((punch) => ({ time: punch.time, kind: punch.kind, message: punch.message }));

  const completePeriods = periods.filter((period) => period.complete).length;
  const status = resolveDayStatus(sorted.length, completePeriods, config.periods.length);
  const score = config.periods.length === 0 ? 0 : Math.round((completePeriods / config.periods.length) * 100);

  const issues = periods.flatMap((period) => period.issues.map((issue) => `${period.label}: ${issue}`));
  if (outsidePeriod.length > 0) {
    issues.push(`${outsidePeriod.length} picagem(ns) fora dos períodos configurados`);
  }

  return {
    participant,
    date,
    weekday: weekdayLabel(date),
    status,
    score,
    periods,
    outsidePeriod,
    issues,
  };
}

function evaluatePeriod(periodId: string, label: string, punches: Punch[]): PeriodResult {
  const issues: string[] = [];
  const ins = punches.filter((punch) => punch.kind === 'IN');
  const outs = punches.filter((punch) => punch.kind === 'OUT');

  let selectedIn: Punch | undefined;
  let selectedOut: Punch | undefined;

  for (const candidateIn of ins) {
    const candidateOut = outs.find((out) => out.sortKey > candidateIn.sortKey);
    if (candidateOut) {
      selectedIn = candidateIn;
      selectedOut = candidateOut;
      break;
    }
  }

  const complete = Boolean(selectedIn && selectedOut);

  if (!complete) {
    if (ins.length === 0 && outs.length === 0) issues.push('sem IN e OUT');
    else if (ins.length === 0) issues.push('falta IN');
    else if (outs.length === 0) issues.push('falta OUT');
    else issues.push('OUT anterior ao IN');
  }

  const usedCount = complete ? 2 : 0;
  if (punches.length > usedCount && punches.length > 1) {
    const extraCount = complete ? punches.length - 2 : Math.max(0, punches.length - 1);
    if (extraCount > 0) issues.push(`${extraCount} picagem(ns) adicional(is)`);
  }

  return {
    periodId,
    label,
    complete,
    inTime: selectedIn?.time ?? ins[0]?.time,
    outTime: selectedOut?.time ?? outs.at(-1)?.time,
    punchCount: punches.length,
    issues,
  };
}

function summariseParticipant(participant: string, days: AttendanceDay[]): ParticipantSummary {
  const participantDays = days.filter((day) => day.participant === participant);
  const completeDays = participantDays.filter((day) => day.status === 'complete').length;
  const partialDays = participantDays.filter((day) => day.status === 'partial').length;
  const absentDays = participantDays.filter((day) => day.status === 'absent').length;
  const totalDays = participantDays.length;

  return {
    participant,
    totalDays,
    completeDays,
    partialDays,
    absentDays,
    attendanceRate: totalDays === 0 ? 0 : Math.round((completeDays / totalDays) * 1000) / 10,
  };
}

function resolveDateRange(punches: Punch[], config: AttendanceConfig): { from: string; to: string } | null {
  const sortedDates = [...new Set(punches.map((punch) => punch.date))].sort();
  const from = config.dateFrom || sortedDates[0];
  const to = config.dateTo || sortedDates.at(-1);
  if (!from || !to || from > to || !isIsoDate(from) || !isIsoDate(to)) return null;
  return { from, to };
}

function resolveDayStatus(punchCount: number, completePeriods: number, periodCount: number) {
  if (punchCount === 0) return 'absent' as const;
  if (periodCount > 0 && completePeriods === periodCount) return 'complete' as const;
  return 'partial' as const;
}

function validateConfig(config: AttendanceConfig) {
  if (!Array.isArray(config.periods) || config.periods.length === 0) throw new Error('É necessário configurar pelo menos um período.');
  if (!Array.isArray(config.workingDays) || config.workingDays.length === 0) throw new Error('Seleciona pelo menos um dia útil.');

  const sorted = config.periods
    .map((period) => ({ ...period, startMinutes: timeToMinutes(period.start), endMinutes: timeToMinutes(period.end) }))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  for (const period of sorted) {
    if (!period.id.trim() || !period.label.trim()) throw new Error('Todos os períodos precisam de identificador e nome.');
    if (period.startMinutes > period.endMinutes) throw new Error(`O início de ${period.label} não pode ser posterior ao fim.`);
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous && current && current.startMinutes <= previous.endMinutes) {
      throw new Error(`Os períodos ${previous.label} e ${current.label} sobrepõem-se.`);
    }
  }
}

function matchesAlias(text: string, aliases: string[]) {
  return aliases.some((alias) => {
    const candidate = normaliseText(alias);
    if (!candidate) return false;
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i').test(text);
  });
}

function matchesIgnoredMessage(text: string, patterns: string[]) {
  const normalised = normaliseText(text);
  return patterns.some((pattern) => {
    const candidate = normaliseText(pattern);
    return candidate.length > 0 && normalised.includes(candidate);
  });
}

function normaliseText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Hora inválida: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Hora inválida: ${value}`);
  return hour * 60 + minute;
}

function enumerateDates(from: string, to: string) {
  const dates: string[] = [];
  const cursor = isoToDate(from);
  const final = isoToDate(to);
  while (cursor <= final) {
    dates.push(dateToIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function dayOfWeek(date: string) {
  return isoToDate(date).getUTCDay();
}

function weekdayLabel(date: string) {
  const labels = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return labels[dayOfWeek(date)] ?? '';
}

function isoToDate(value: string) {
  const parts = value.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function dateToIso(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dateToIso(isoToDate(value)) === value;
}
