const FIXED_HOLIDAYS = new Map([
  ['01-01', 'Ano Novo'],
  ['04-25', 'Dia da Liberdade'],
  ['05-01', 'Dia do Trabalhador'],
  ['06-10', 'Dia de Portugal'],
  ['08-15', 'Assunção de Nossa Senhora'],
  ['10-05', 'Implantação da República'],
  ['11-01', 'Dia de Todos os Santos'],
  ['12-01', 'Restauração da Independência'],
  ['12-08', 'Imaculada Conceição'],
  ['12-25', 'Natal'],
]);

export function isPortugueseNationalHoliday(isoDate: string) {
  return getPortugueseNationalHolidayName(isoDate) !== null;
}

export function getPortugueseNationalHolidayName(isoDate: string) {
  const [yearRaw] = isoDate.split('-');
  const year = Number(yearRaw);
  if (!Number.isInteger(year)) return null;
  const fixedName = FIXED_HOLIDAYS.get(isoDate.slice(5));
  if (fixedName) return fixedName;

  const easter = calculateEasterSunday(year);
  const movable = new Map([
    [dateToIso(addUtcDays(easter, -2)), 'Sexta-Feira Santa'],
    [dateToIso(easter), 'Domingo de Páscoa'],
    [dateToIso(addUtcDays(easter, 60)), 'Corpo de Deus'],
  ]);
  return movable.get(isoDate) ?? null;
}

// Algoritmo gregoriano de Meeus/Jones/Butcher.
export function calculateEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateToIso(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
