const {
  generateAllMockDatasets,
  mockFormatDDMMMYYYY,
  mockAddDays,
  mockAddMonths,
  mockColToLetter,
  mapRecordsToSheetRows,
  DEFAULT_SHEET_HEADERS,
  generateMockData,
  api_generateMockData
} = require('../src/MockDataGenerator.gs');

describe('Mock Data Generator', () => {
  const fixedToday = new Date(2026, 8, 28); // 28-Sep-2026

  describe('Helper Utilities', () => {
    test('mockFormatDDMMMYYYY formats date correctly', () => {
      expect(mockFormatDDMMMYYYY(new Date(2025, 0, 15))).toBe('15-Jan-2025');
      expect(mockFormatDDMMMYYYY(new Date(2026, 11, 31))).toBe('31-Dec-2026');
      expect(mockFormatDDMMMYYYY(null)).toBe('');
    });

    test('mockAddDays adds and subtracts days safely', () => {
      const base = new Date(2025, 0, 10);
      expect(mockFormatDDMMMYYYY(mockAddDays(base, 5))).toBe('15-Jan-2025');
      expect(mockFormatDDMMMYYYY(mockAddDays(base, -5))).toBe('05-Jan-2025');
    });

    test('mockAddMonths handles calendar months correctly', () => {
      const base = new Date(2025, 0, 15);
      expect(mockFormatDDMMMYYYY(mockAddMonths(base, 1))).toBe('15-Feb-2025');
      expect(mockFormatDDMMMYYYY(mockAddMonths(base, 3))).toBe('15-Apr-2025');
    });

    test('mockColToLetter converts indices to letters', () => {
      expect(mockColToLetter(1)).toBe('A');
      expect(mockColToLetter(26)).toBe('Z');
      expect(mockColToLetter(27)).toBe('AA');
    });
  });

  describe('Dataset Generation (generateAllMockDatasets)', () => {
    let datasets;

    beforeAll(() => {
      datasets = generateAllMockDatasets(fixedToday);
    });

    test('generates non-empty arrays for all 5 core entities', () => {
      expect(datasets.members.length).toBeGreaterThan(15);
      expect(datasets.payments.length).toBeGreaterThan(50);
      expect(datasets.staff.length).toBeGreaterThanOrEqual(6);
      expect(datasets.salary.length).toBeGreaterThan(50);
      expect(datasets.expenses.length).toBeGreaterThan(30);
    });

    test('all dates start on or after 01-Jan-2025', () => {
      const allDates = [];
      datasets.members.forEach(m => {
        allDates.push(m.joinDate);
        if (m.exitDate) allDates.push(m.exitDate);
      });
      datasets.payments.forEach(p => {
        allDates.push(p.paidDate);
        allDates.push(p.startDate);
        allDates.push(p.endDate);
      });
      datasets.staff.forEach(s => {
        allDates.push(s.joinDate);
        if (s.exitDate) allDates.push(s.exitDate);
      });
      datasets.salary.forEach(sal => {
        allDates.push(sal.paidDate);
        allDates.push(sal.startDate);
        allDates.push(sal.endDate);
      });
      datasets.expenses.forEach(e => {
        allDates.push(e.date);
      });

      const dateRegex = /^\d{2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/;
      allDates.forEach(dStr => {
        if (!dStr) return;
        expect(dStr).toMatch(dateRegex);
        const year = parseInt(dStr.split('-')[2], 10);
        expect(year).toBeGreaterThanOrEqual(2025);
      });
    });

    test('covers Member due, overdue, 2 days left, and 10 days left renewal scenarios', () => {
      const members = datasets.members;
      const payments = datasets.payments;

      const paymentsByMember = {};
      payments.forEach(p => {
        if (!paymentsByMember[p.memberId]) paymentsByMember[p.memberId] = [];
        paymentsByMember[p.memberId].push(p);
      });

      // Calculate next due date for each member matching API_Members logic
      const dueInfo = members.map(m => {
        const mPay = (paymentsByMember[m.memberId] || [])
          .filter(p => String(p.paymentStatus).toLowerCase().includes('paid'))
          .sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
        const latest = mPay[0];
        if (!latest) return { member: m, diffDays: null };

        const endD = new Date(latest.endDate);
        const nextDue = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate() + 1);
        const diffDays = Math.ceil((nextDue - fixedToday) / (1000 * 60 * 60 * 24));
        return { member: m, diffDays };
      });

      // Case 1: 2 days left
      const dueIn2Days = dueInfo.find(d => d.diffDays === 2);
      expect(dueIn2Days).toBeDefined();

      // Case 2: 10 days left
      const dueIn10Days = dueInfo.find(d => d.diffDays === 10);
      expect(dueIn10Days).toBeDefined();

      // Case 3: Due today (diffDays === 0)
      const dueToday = dueInfo.find(d => d.diffDays === 0);
      expect(dueToday).toBeDefined();

      // Case 4: Overdue (diffDays < 0)
      const overdueList = dueInfo.filter(d => d.diffDays !== null && d.diffDays < 0);
      expect(overdueList.length).toBeGreaterThan(0);
    });

    test('covers both Kids batches and Adult batches', () => {
      const members = datasets.members;
      const kidsMembers = members.filter(m => m.batchId.toLowerCase().includes('kid') || m.notes.toLowerCase().includes('kid'));
      const adultMembers = members.filter(m => m.batchId.toLowerCase().includes('adult') || !m.notes.toLowerCase().includes('kid'));

      expect(kidsMembers.length).toBeGreaterThanOrEqual(4);
      expect(adultMembers.length).toBeGreaterThanOrEqual(10);
    });

    test('covers diverse membership plans: Monthly, Quarterly, Annual, Ad-Hoc, Trial', () => {
      const planIds = datasets.members.map(m => m.membershipId.toLowerCase());
      expect(planIds.some(p => p.includes('month'))).toBe(true);
      expect(planIds.some(p => p.includes('quarter'))).toBe(true);
      expect(planIds.some(p => p.includes('annual') || p.includes('year'))).toBe(true);
      expect(planIds.some(p => p.includes('adhoc') || p.includes('ad-hoc'))).toBe(true);
      expect(planIds.some(p => p.includes('trial'))).toBe(true);
    });

    test('covers Active members and Inactive (Left) members with exit dates', () => {
      const activeMembers = datasets.members.filter(m => m.status === 'SAT-1' || m.status.toLowerCase().includes('active'));
      const leftMembers = datasets.members.filter(m => m.exitDate && m.exitDate.trim() !== '');

      expect(activeMembers.length).toBeGreaterThan(10);
      expect(leftMembers.length).toBeGreaterThanOrEqual(3);
    });

    test('covers Staff diverse roles, Inactive staff, and monthly payroll', () => {
      const staff = datasets.staff;
      const salary = datasets.salary;

      expect(staff.length).toBeGreaterThanOrEqual(6);

      // Check roles
      const roles = staff.map(s => s.role.toLowerCase());
      expect(roles.some(r => r.includes('head'))).toBe(true);
      expect(roles.some(r => r.includes('trainer'))).toBe(true);
      expect(roles.some(r => r.includes('kid'))).toBe(true);
      expect(roles.some(r => r.includes('nutrition'))).toBe(true);
      expect(roles.some(r => r.includes('desk'))).toBe(true);
      expect(roles.some(r => r.includes('clean') || r.includes('house'))).toBe(true);

      // Check Ex-staff (left)
      const leftStaff = staff.find(s => s.exitDate && s.exitDate.trim() !== '');
      expect(leftStaff).toBeDefined();

      // Check Bonus records in Salary
      const bonusRecords = salary.filter(s => String(s.creditType).toLowerCase().includes('bonus'));
      expect(bonusRecords.length).toBeGreaterThanOrEqual(5);

      // Check Pending salary records for Action Needed
      const pendingSalary = salary.filter(s => String(s.paymentStatus).toLowerCase().includes('pending'));
      expect(pendingSalary.length).toBeGreaterThan(0);
    });

    test('covers diverse chronological expenses including Rent, Utilities, and Misc with whatMisc', () => {
      const expenses = datasets.expenses;
      expect(expenses.length).toBeGreaterThan(30);

      const rentExpenses = expenses.filter(e => e.description.toLowerCase().includes('rent') || e.categoryId.toLowerCase().includes('rent'));
      expect(rentExpenses.length).toBeGreaterThanOrEqual(12);

      const miscExpenses = expenses.filter(e => e.whatMisc && e.whatMisc.trim() !== '');
      expect(miscExpenses.length).toBeGreaterThan(5);
    });
  });

  describe('Header Mapping & Formula Protection', () => {
    test('mapRecordsToSheetRows preserves and skips formula headers marked with *', () => {
      const records = [
        { memberId: 'MEM-1', fullName: 'Alice Johnson', year: '2025', formulaCol: 'ignored' }
      ];
      const headers = ['memberId', 'fullName', 'year*', 'status'];

      const rows = mapRecordsToSheetRows(records, headers);
      expect(rows).toEqual([
        ['MEM-1', 'Alice Johnson', '', '']
      ]);
    });
  });

  describe('Sheet Cleaning & Batch Writing (generateMockData)', () => {
    beforeEach(() => {
      global.Sheets = {
        Spreadsheets: {
          Values: {
            clear: jest.fn(),
            get: jest.fn((id, range) => {
              const sheetName = range.replace(/['!1:1]/g, '').trim();
              return { values: [DEFAULT_SHEET_HEADERS[sheetName] || []] };
            }),
            update: jest.fn()
          }
        }
      };
      global.Session = {
        getActiveUser: () => ({ getEmail: () => 'test-admin@gym.com' })
      };
    });

    afterEach(() => {
      delete global.Sheets;
      delete global.Session;
    });

    test('generateMockData cleans target sheets and writes all 5 tables in batch', () => {
      const result = generateMockData();

      expect(result.success).toBe(true);
      expect(global.Sheets.Spreadsheets.Values.clear).toHaveBeenCalledTimes(5);
      expect(global.Sheets.Spreadsheets.Values.update).toHaveBeenCalledTimes(5);
      expect(result.stats.MEMBERS).toBeGreaterThan(15);
      expect(result.stats.PAYMENTS).toBeGreaterThan(50);
      expect(result.stats.STAFF).toBeGreaterThanOrEqual(6);
      expect(result.stats.SALARY).toBeGreaterThan(50);
      expect(result.stats.EXPENSES).toBeGreaterThan(30);
    });

    test('api_generateMockData returns standard API response object', () => {
      const res = api_generateMockData();
      expect(res.success).toBe(true);
      expect(res.stats).toBeDefined();
    });
  });
});
