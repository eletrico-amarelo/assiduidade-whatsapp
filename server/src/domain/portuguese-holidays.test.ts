import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateEasterSunday,
  getPortugueseNationalHolidayName,
  isPortugueseNationalHoliday,
} from './portuguese-holidays.js';

test('calculates Portuguese movable national holidays from Easter', () => {
  assert.equal(calculateEasterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(isPortugueseNationalHoliday('2026-04-03'), true);
  assert.equal(isPortugueseNationalHoliday('2026-04-05'), true);
  assert.equal(isPortugueseNationalHoliday('2026-06-04'), true);
  assert.equal(getPortugueseNationalHolidayName('2026-06-04'), 'Corpo de Deus');
});

test('includes national fixed holidays but excludes Carnival and a municipal holiday', () => {
  assert.equal(isPortugueseNationalHoliday('2026-04-25'), true);
  assert.equal(isPortugueseNationalHoliday('2026-12-25'), true);
  assert.equal(isPortugueseNationalHoliday('2026-02-17'), false); // Carnaval
  assert.equal(isPortugueseNationalHoliday('2026-06-13'), false); // Santo António/Lisboa
});
