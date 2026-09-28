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

    test('generates exactly 2 staff members', () => {
      expect(datasets.staff.length).toBe(2);
      expect(datasets.staff[0].fullName).toBe('Rajesh Kumar');
      expect(datasets.staff[0].salary).toBe(35000);
      expect(datasets.staff[1].fullName).toBe('Sneha Kulkarni');
      expect(datasets.staff[1].salary).toBe(25000);

      // Verify monthly payroll for the 2 staff
      expect(datasets.salary.length).toBeGreaterThan(40);
      const bonusRecords = datasets.salary.filter(s => String(s.creditType).toLowerCase().includes('bonus'));
      expect(bonusRecords.length).toBeGreaterThanOrEqual(2);

      // Verify pending cycle exists for action needed
      const pendingSalary = datasets.salary.filter(s => String(s.paymentStatus).toLowerCase().includes('pending'));
      expect(pendingSalary.length).toBeGreaterThan(0);
    });

    test('member fees are 30000 Quarterly for Adults and 15000 Quarterly for Kids', () => {
      const members = datasets.members;

      const adultQuarterly = members.filter(m => m.batchId.toLowerCase().includes('adult') && !m.membershipId.toLowerCase().includes('adhoc') && !m.membershipId.toLowerCase().includes('trial'));
      expect(adultQuarterly.length).toBeGreaterThanOrEqual(8);
      adultQuarterly.forEach(m => {
        expect(m.membershipAmount).toBe(30000);
      });

      const kidsQuarterly = members.filter(m => m.batchId.toLowerCase().includes('kid') && !m.membershipId.toLowerCase().includes('adhoc') && !m.membershipId.toLowerCase().includes('trial'));
      expect(kidsQuarterly.length).toBeGreaterThanOrEqual(4);
      kidsQuarterly.forEach(m => {
        expect(m.membershipAmount).toBe(15000);
      });

      // Check Ad-hoc and Trial
      const adhoc = members.filter(m => m.membershipId.toLowerCase().includes('adhoc') || m.membershipId.toLowerCase().includes('ad-hoc'));
      expect(adhoc.length).toBeGreaterThanOrEqual(1);

      const trial = members.filter(m => m.membershipId.toLowerCase().includes('trial'));
      expect(trial.length).toBeGreaterThanOrEqual(1);
      expect(trial[0].membershipAmount).toBe(1500);
    });

    test('collections exceed expenses ensuring a strong positive Net-In-Hand', () => {
      const totalCollections = datasets.payments
        .filter(p => String(p.paymentStatus).toLowerCase().includes('paid'))
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const totalStaffCost = datasets.salary
        .filter(s => String(s.paymentStatus).toLowerCase().includes('paid'))
        .reduce((sum, s) => sum + Number(s.amount), 0);

      const totalOperatingExp = datasets.expenses
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const totalExpenses = totalStaffCost + totalOperatingExp;
      const netInHand = totalCollections - totalExpenses;

      // Net-In-Hand must be strongly positive!
      expect(netInHand).toBeGreaterThan(500000);
      expect(totalCollections).toBeGreaterThan(totalExpenses);
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

    test('covers Member due in 2 days, 10 days, due today, and overdue scenarios', () => {
      const members = datasets.members;
      const payments = datasets.payments;

      const paymentsByMember = {};
      payments.forEach(p => {
        if (!paymentsByMember[p.memberId]) paymentsByMember[p.memberId] = [];
        paymentsByMember[p.memberId].push(p);
      });

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

    test('covers both Kids batches and Adult batches across morning and evening', () => {
      const members = datasets.members;
      const kidsMembers = members.filter(m => m.batchId.toLowerCase().includes('kid') || m.notes.toLowerCase().includes('kid'));
      const adultMembers = members.filter(m => m.batchId.toLowerCase().includes('adult') || !m.notes.toLowerCase().includes('kid'));

      expect(kidsMembers.length).toBeGreaterThanOrEqual(4);
      expect(adultMembers.length).toBeGreaterThanOrEqual(10);
    });

    test('covers Active members and Inactive (Left) members with exit dates', () => {
      const activeMembers = datasets.members.filter(m => m.status.toLowerCase().includes('active') && !m.status.toLowerCase().includes('inactive'));
      const leftMembers = datasets.members.filter(m => m.exitDate && m.exitDate.trim() !== '');

      expect(activeMembers.length).toBeGreaterThan(10);
      expect(leftMembers.length).toBeGreaterThanOrEqual(3);
      leftMembers.forEach(m => {
        expect(m.status.toLowerCase()).toContain('inactive');
      });
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
      expect(result.stats.STAFF).toBe(2);
      expect(result.stats.SALARY).toBeGreaterThan(40);
      expect(result.stats.EXPENSES).toBeGreaterThan(30);
    });

    test('api_generateMockData returns standard API response object', () => {
      const res = api_generateMockData();
      expect(res.success).toBe(true);
      expect(res.stats).toBeDefined();
    });
  });
});
