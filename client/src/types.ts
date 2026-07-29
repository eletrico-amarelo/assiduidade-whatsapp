export type PunchKind = 'IN' | 'OUT';
export type DayStatus = 'complete' | 'partial' | 'absent' | 'holiday' | 'vacation';

export interface VacationPeriod {
  id: string;
  participant: string;
  from: string;
  to: string;
  description?: string;
}

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
  toleranceMinutes: number;
  vacations: VacationPeriod[];
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
  holidayName?: string;
  vacationDescription?: string;
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
  importId: string;
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
  monthlyExports: MonthlyExport[];
  editedFilename?: string;
}

export interface MonthlyExport {
  month: number;
  year: number;
  filename: string;
  exists: boolean;
}

export interface StoredExport {
  filename: string;
  size: number;
  updatedAt: string;
  edited: boolean;
}
