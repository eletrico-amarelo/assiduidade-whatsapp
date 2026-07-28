export type PunchKind = 'IN' | 'OUT';
export type DayStatus = 'complete' | 'partial' | 'absent';

export interface PeriodRule {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface AttendanceConfig {
  periods: PeriodRule[];
  aliases: {
    in: string[];
    out: string[];
  };
  ignoredMessagePatterns: string[];
  workingDays: number[];
  dateFrom?: string;
  dateTo?: string;
}

export interface PeriodResult {
  periodId: string;
  label: string;
  complete: boolean;
  inTime?: string;
  outTime?: string;
  punchCount: number;
  issues: string[];
}

export interface AttendanceDay {
  participant: string;
  date: string;
  weekday: string;
  status: DayStatus;
  score: number;
  periods: PeriodResult[];
  outsidePeriod: Array<{
    time: string;
    kind: PunchKind;
    message: string;
  }>;
  issues: string[];
}

export interface ParticipantSummary {
  participant: string;
  totalDays: number;
  completeDays: number;
  partialDays: number;
  absentDays: number;
  attendanceRate: number;
}

export interface IgnoredMessage {
  date: string;
  time: string;
  author?: string;
  text: string;
  sourceLine: number;
}

export interface AnalysisResponse {
  filename: string;
  totalMessages: number;
  recognisedPunches: number;
  ignoredMessages: number;
  ignoredMessageDetails: IgnoredMessage[];
  excludedMessages: number;
  participants: string[];
  days: AttendanceDay[];
  summaries: ParticipantSummary[];
  warnings: string[];
  config: AttendanceConfig;
}
