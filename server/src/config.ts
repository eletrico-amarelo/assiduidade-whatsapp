import type { AttendanceConfig } from './types.js';

export const defaultConfig: AttendanceConfig = {
  periods: [
    { id: 'morning', label: 'Manhã', start: '08:00', end: '13:30' },
    { id: 'afternoon', label: 'Tarde', start: '13:30', end: '20:00' },
  ],
  aliases: {
    in: ['IN', 'ENTRADA', 'CHECK IN', 'CHECK-IN'],
    out: ['OUT', 'SAÍDA', 'SAIDA', 'CHECK OUT', 'CHECK-OUT'],
  },
  ignoredMessagePatterns: [],
  toleranceMinutes: 15,
  workingDays: [1, 2, 3, 4, 5],
};
