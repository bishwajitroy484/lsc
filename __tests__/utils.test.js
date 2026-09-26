const { colToLetter, _colToLetter, parseSafeDate, distributeDailyProration } = require('../src/Utils_DB');

describe('Universal Column Converter (colToLetter)', () => {
  test('correctly converts 1-based indices to column letters', () => {
    expect(colToLetter(1)).toBe('A');
    expect(colToLetter(26)).toBe('Z');
    expect(colToLetter(27)).toBe('AA');
    expect(colToLetter(52)).toBe('AZ');
    expect(colToLetter(53)).toBe('BA');
    expect(colToLetter(702)).toBe('ZZ');
    expect(colToLetter(703)).toBe('AAA');
    expect(_colToLetter(1)).toBe('A');
  });
});

describe('Date Parser (parseSafeDate)', () => {
  test('parses ISO format correctly', () => {
    const d = parseSafeDate('2024-06-15');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  test('parses DD-MMM-YYYY format with diverse casing', () => {
    const d1 = parseSafeDate('15-Jan-2024');
    expect(d1.getFullYear()).toBe(2024);
    expect(d1.getMonth()).toBe(0);
    expect(d1.getDate()).toBe(15);

    const d2 = parseSafeDate('28-FEB-2024');
    expect(d2.getFullYear()).toBe(2024);
    expect(d2.getMonth()).toBe(1);
    expect(d2.getDate()).toBe(28);
  });

  test('parses 2-digit year DD-MMM-YY correctly (safe 2000s conversion)', () => {
    const d = parseSafeDate('01-MAR-24');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(1);
  });

  test('returns invalid date for empty, null, or N/A inputs', () => {
    expect(isNaN(parseSafeDate(''))).toBe(true);
    expect(isNaN(parseSafeDate(null))).toBe(true);
    expect(isNaN(parseSafeDate('N/A'))).toBe(true);
    expect(isNaN(parseSafeDate('invalid-date'))).toBe(true);
  });
});

describe('GAAP-Compliant Daily Proration (distributeDailyProration)', () => {
  test('anchor mode (cash basis) assigns full amount to start month', () => {
    const intervals = [];
    distributeDailyProration('2024-03-10', '2024-06-10', null, 3000, 'anchor', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({ year: 2024, month: 2, amt: 3000 });
  });

  test('split mode within a single month attributes 100% to that month', () => {
    const intervals = [];
    distributeDailyProration('2024-01-05', '2024-01-25', null, 2100, 'split', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(1);
    expect(intervals[0].year).toBe(2024);
    expect(intervals[0].month).toBe(0);
    expect(intervals[0].amt).toBeCloseTo(2100, 2);
  });

  test('split mode prorates daily amounts across month boundaries', () => {
    const intervals = [];
    // 2024 is leap year: Jan 16 to Jan 31 is 16 days; Feb 1 to Feb 15 is 15 days; Total = 31 days.
    const totalAmt = 3100;
    distributeDailyProration('2024-01-16', '2024-02-15', null, totalAmt, 'split', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(2);
    // Jan (16 days @ 100/day) = 1600
    expect(intervals[0].year).toBe(2024);
    expect(intervals[0].month).toBe(0);
    expect(intervals[0].amt).toBeCloseTo(1600, 2);

    // Feb (15 days @ 100/day) = 1500
    expect(intervals[1].year).toBe(2024);
    expect(intervals[1].month).toBe(1);
    expect(intervals[1].amt).toBeCloseTo(1500, 2);

    // Total distributed matches totalAmt
    const sum = intervals.reduce((acc, cur) => acc + cur.amt, 0);
    expect(sum).toBeCloseTo(totalAmt, 2);
  });

  test('split mode prorates across year boundaries (e.g. Dec to Jan)', () => {
    const intervals = [];
    // Dec 16 to Jan 15: Dec 16-31 is 16 days; Jan 1-15 is 15 days; Total = 31 days.
    const totalAmt = 6200;
    distributeDailyProration('2023-12-16', '2024-01-15', null, totalAmt, 'split', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(2);
    expect(intervals[0].year).toBe(2023);
    expect(intervals[0].month).toBe(11); // December
    expect(intervals[0].amt).toBeCloseTo(3200, 2); // 16 * 200

    expect(intervals[1].year).toBe(2024);
    expect(intervals[1].month).toBe(0); // January
    expect(intervals[1].amt).toBeCloseTo(3000, 2); // 15 * 200
  });

  test('fallback date is used when start date is missing or invalid', () => {
    const intervals = [];
    distributeDailyProration(null, null, '2024-07-20', 1500, 'anchor', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({ year: 2024, month: 6, amt: 1500 });
  });
});

const fs = require('fs');
const path = require('path');

describe('Client Shared Utilities (AppUtils in Global_State.html)', () => {
  let AppUtils;

  beforeAll(() => {
    const htmlContent = fs.readFileSync(path.join(__dirname, '../src/Global_State.html'), 'utf8');
    const match = htmlContent.match(/const AppUtils = ({[\s\S]*?\n  };)/);
    if (match) {
      const fn = new Function(`return ${match[1]};`);
      AppUtils = fn();
    }
  });

  test('formatCurrency correctly formats values as compact INR (e.g. ₹1, ₹1k, ₹1.5k, ₹1M)', () => {
    expect(AppUtils.formatCurrency(0)).toBe('₹0');
    expect(AppUtils.formatCurrency(1)).toBe('₹1');
    expect(AppUtils.formatCurrency(500)).toBe('₹500');
    expect(AppUtils.formatCurrency(1000)).toBe('₹1k');
    expect(AppUtils.formatCurrency(1500)).toBe('₹1.5k');
    expect(AppUtils.formatCurrency(1540)).toBe('₹1.5k');
    expect(AppUtils.formatCurrency(1560)).toBe('₹1.6k');
    expect(AppUtils.formatCurrency(25000)).toBe('₹25k');
    expect(AppUtils.formatCurrency('₹25,400')).toBe('₹25.4k');
    expect(AppUtils.formatCurrency(1000000)).toBe('₹1M');
    expect(AppUtils.formatCurrency(1200000)).toBe('₹1.2M');
    expect(AppUtils.formatCurrency(-5000)).toBe('-₹5k');
    expect(AppUtils.formatCurrency(null)).toBe('₹0');
  });

  test('parseAmount safely cleans formatted amount strings', () => {
    expect(AppUtils.parseAmount('₹1,500')).toBe(1500);
    expect(AppUtils.parseAmount('12,345.50')).toBe(12345.5);
    expect(AppUtils.parseAmount('')).toBe(0);
    expect(AppUtils.parseAmount(null)).toBe(0);
  });

  test('formatDateDDMMMYYYY formats standard, uppercase, and short year', () => {
    expect(AppUtils.formatDateDDMMMYYYY('2024-03-05')).toBe('05-Mar-2024');
    expect(AppUtils.formatDateDDMMMYYYY('2024-03-05', true, true)).toBe('05-MAR-24');
    expect(AppUtils.formatDateDDMMMYYYY('')).toBe('');
  });

  test('parseToISODate parses diverse date string formats to YYYY-MM-DD', () => {
    expect(AppUtils.parseToISODate('05-Mar-2024')).toBe('2024-03-05');
    expect(AppUtils.parseToISODate('05-MAR-24')).toBe('2024-03-05');
    expect(AppUtils.parseToISODate('2024-03-05')).toBe('2024-03-05');
    expect(AppUtils.parseToISODate('')).toBe('');
  });

  test('debounce delays execution and only fires once after wait period', (done) => {
    let callCount = 0;
    const fn = AppUtils.debounce(() => {
      callCount++;
    }, 50);

    fn();
    fn();
    fn();
    expect(callCount).toBe(0);

    setTimeout(() => {
      expect(callCount).toBe(1);
      done();
    }, 100);
  });
});
