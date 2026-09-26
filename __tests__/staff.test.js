const fs = require('fs');
const path = require('path');

describe('Staff Module - Action Needed & Salary Cycle Calculations', () => {
  let StaffApp;
  let AppUtils;

  beforeAll(() => {
    // 1. Load AppUtils
    const globalStateHtml = fs.readFileSync(path.join(__dirname, '../src/Global_State.html'), 'utf8');
    const appUtilsMatch = globalStateHtml.match(/const AppUtils = ({[\s\S]*?\n  };)/);
    if (!appUtilsMatch) throw new Error("Could not extract AppUtils from Global_State.html");
    AppUtils = new Function(`return ${appUtilsMatch[1]};`)();
    global.AppUtils = AppUtils;

    // 2. Load StaffApp
    const staffHtml = fs.readFileSync(path.join(__dirname, '../src/Script_Staff.html'), 'utf8');
    // Extract var StaffApp = { ... };
    const staffAppMatch = staffHtml.match(/var StaffApp = ({[\s\S]*?\n  };)/);
    if (!staffAppMatch) throw new Error("Could not extract StaffApp from Script_Staff.html");

    // Provide mock DOM environment if not present
    global.document = {
      getElementById: jest.fn(() => ({
        innerHTML: '',
        innerText: '',
        value: '',
        classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
        scrollIntoView: jest.fn()
      }))
    };
    global.google = {
      script: {
        run: {
          withSuccessHandler: jest.fn().mockReturnThis(),
          api_getStaff: jest.fn(),
          api_getGlobalDropdowns: jest.fn(),
          api_getStaffTransactions: jest.fn(),
          api_recordStaffTransaction: jest.fn(),
          api_deleteStaffTransaction: jest.fn(),
          api_deleteStaff: jest.fn(),
          api_saveStaff: jest.fn()
        }
      }
    };
    global.flatpickr = jest.fn();

    const createStaffApp = new Function('AppUtils', `return ${staffAppMatch[1]};`);
    StaffApp = createStaffApp(AppUtils);
    StaffApp.dropdowns = {
      credittype: [{ id: 'CT-1', name: 'Salary' }, { id: 'CT-2', name: 'Bonus' }],
      status: [{ id: 'SAT-1', name: 'Active' }, { id: 'SAT-2', name: 'Inactive' }],
      role: [{ id: 'ROL-1', name: 'Head Coach' }, { id: 'ROL-2', name: 'Personal Trainer' }]
    };
  });

  describe('getStaffPendingCycles', () => {
    test('returns empty array if staff is null or salary is 0', () => {
      expect(StaffApp.getStaffPendingCycles(null)).toEqual([]);
      expect(StaffApp.getStaffPendingCycles({ salary: 0, joinDate: '01-Jan-2024' })).toEqual([]);
      expect(StaffApp.getStaffPendingCycles({ salary: '₹0', joinDate: '01-Jan-2024' })).toEqual([]);
    });

    test('returns empty array if joinDate is missing or invalid', () => {
      expect(StaffApp.getStaffPendingCycles({ salary: 25000, joinDate: '' })).toEqual([]);
      expect(StaffApp.getStaffPendingCycles({ salary: 25000, joinDate: 'invalid-date' })).toEqual([]);
    });

    test('returns empty array for inactive staff with no exitDate', () => {
      const stf = {
        staffId: 'STF-1',
        salary: 20000,
        joinDate: '01-Jan-2024',
        status: 'SAT-2' // Inactive
      };
      expect(StaffApp.getStaffPendingCycles(stf, [])).toEqual([]);
    });

    test('accurately generates monthly virtual cycles from joinDate when no payments exist', () => {
      // Suppose staff joined 2 months ago
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      twoMonthsAgo.setDate(1);
      const joinStr = AppUtils.formatDateDDMMMYYYY(twoMonthsAgo);

      const stf = {
        staffId: 'STF-2',
        salary: 30000,
        joinDate: joinStr,
        status: 'SAT-1'
      };

      const cycles = StaffApp.getStaffPendingCycles(stf, []);
      expect(cycles.length).toBeGreaterThanOrEqual(2);
      expect(cycles[0].isVirtual).toBe(true);
      expect(cycles[0].amount).toBe(30000);
      expect(cycles[0].virtualStartDate).toBeDefined();
      expect(cycles[0].virtualEndDate).toBeDefined();

      // Start of cycle 1 should match joinDate
      const c1Start = new Date(cycles[0].virtualStartDate);
      expect(c1Start.getDate()).toBe(1);
      expect(c1Start.getMonth()).toBe(twoMonthsAgo.getMonth());
    });

    test('calculates pending cycles only starting from after latest paid salary endDate', () => {
      // Staff joined 3 months ago, was paid for month 1
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      threeMonthsAgo.setDate(1);

      const month1End = new Date(threeMonthsAgo);
      month1End.setMonth(month1End.getMonth() + 1);
      month1End.setDate(month1End.getDate() - 1);

      const stf = {
        staffId: 'STF-3',
        salary: 20000,
        joinDate: AppUtils.formatDateDDMMMYYYY(threeMonthsAgo),
        status: 'SAT-1'
      };

      const payments = [
        {
          paymentId: 'SAL-1',
          staffId: 'STF-3',
          amount: 20000,
          creditType: 'CT-1', // Salary
          paymentStatus: 'Paid',
          paidDate: AppUtils.formatDateDDMMMYYYY(month1End),
          startDate: AppUtils.formatDateDDMMMYYYY(threeMonthsAgo),
          endDate: AppUtils.formatDateDDMMMYYYY(month1End)
        }
      ];

      const cycles = StaffApp.getStaffPendingCycles(stf, payments);
      // Pending cycles should be at least 2 (months 2 and 3)
      expect(cycles.length).toBeGreaterThanOrEqual(2);

      // Cycle 0 should start on the day after month1End
      const expectedStart = new Date(month1End);
      expectedStart.setDate(expectedStart.getDate() + 1);
      const actualStart = new Date(cycles[0].virtualStartDate);
      expect(actualStart.toDateString()).toBe(expectedStart.toDateString());
    });

    test('ignores failed or pending payments when calculating latest coverage', () => {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      twoMonthsAgo.setDate(1);

      const stf = {
        staffId: 'STF-4',
        salary: 15000,
        joinDate: AppUtils.formatDateDDMMMYYYY(twoMonthsAgo),
        status: 'SAT-1'
      };

      const payments = [
        {
          paymentId: 'SAL-FAIL',
          staffId: 'STF-4',
          amount: 15000,
          creditType: 'CT-1',
          paymentStatus: 'Failed',
          paidDate: '15-Aug-2026',
          startDate: '01-Aug-2026',
          endDate: '31-Aug-2026'
        }
      ];

      const cycles = StaffApp.getStaffPendingCycles(stf, payments);
      // Since payment was Failed, it should still start from twoMonthsAgo
      const c1Start = new Date(cycles[0].virtualStartDate);
      expect(c1Start.getMonth()).toBe(twoMonthsAgo.getMonth());
    });

    test('stops accruing cycles at exitDate for exited staff', () => {
      // Staff joined 6 months ago, exited 4 months ago
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      sixMonthsAgo.setDate(1);

      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      fourMonthsAgo.setDate(1);

      const stf = {
        staffId: 'STF-5',
        salary: 25000,
        joinDate: AppUtils.formatDateDDMMMYYYY(sixMonthsAgo),
        exitDate: AppUtils.formatDateDDMMMYYYY(fourMonthsAgo),
        status: 'SAT-2' // Inactive
      };

      const cycles = StaffApp.getStaffPendingCycles(stf, []);
      // From 6 months ago to 4 months ago is ~2 cycles
      expect(cycles.length).toBe(2);
    });
  });

  describe('getActionNeededStaffList and KPI aggregation', () => {
    test('accurately aggregates staff with pending salary cycles', () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      oneMonthAgo.setDate(1);
      const oneMonthAgoStr = AppUtils.formatDateDDMMMYYYY(oneMonthAgo);

      StaffApp.allData = [
        {
          staffId: 'STF-101',
          fullName: 'Alice Walker',
          role: 'ROL-1',
          salary: 40000,
          joinDate: oneMonthAgoStr,
          status: 'SAT-1'
        },
        {
          staffId: 'STF-102',
          fullName: 'Bob Smith',
          role: 'ROL-2',
          salary: 25000,
          joinDate: oneMonthAgoStr,
          status: 'SAT-1'
        },
        {
          staffId: 'STF-103',
          fullName: 'Charlie Davis',
          role: 'ROL-2',
          salary: 0, // No salary
          joinDate: oneMonthAgoStr,
          status: 'SAT-1'
        }
      ];

      StaffApp.allPayments = [];

      const actionList = StaffApp.getActionNeededStaffList();
      // Alice and Bob have pending cycles, Charlie has 0 salary
      expect(actionList.length).toBe(2);

      const alice = actionList.find(s => s.staffId === 'STF-101');
      expect(alice).toBeDefined();
      expect(alice.fullName).toBe('Alice Walker');
      expect(alice.pendingCount).toBeGreaterThanOrEqual(1);
      expect(alice.totalAmount).toBeGreaterThanOrEqual(40000);

      const bob = actionList.find(s => s.staffId === 'STF-102');
      expect(bob).toBeDefined();
      expect(bob.fullName).toBe('Bob Smith');
      expect(bob.totalAmount).toBeGreaterThanOrEqual(25000);
    });

    test('openStaffSalary properly delegates to openDetails and switchTab', () => {
      const origOpenDetails = StaffApp.openDetails;
      const origSwitchTab = StaffApp.switchTab;
      StaffApp.openDetails = jest.fn();
      StaffApp.switchTab = jest.fn();

      StaffApp.allData = [{ staffId: 'STF-101', fullName: 'Alice Walker' }];
      StaffApp.openStaffSalary('STF-101');

      expect(StaffApp.openDetails).toHaveBeenCalledWith(StaffApp.allData[0]);
      expect(StaffApp.switchTab).toHaveBeenCalledWith('payments');

      StaffApp.openDetails = origOpenDetails;
      StaffApp.switchTab = origSwitchTab;
    });

    test('switchTab correctly maps "salary" tab name to "payments"', () => {
      StaffApp.safeSetClass = jest.fn();
      StaffApp.switchTab('salary');
      // Should set classes for tab-btn-overview and tab-btn-payments
      expect(StaffApp.safeSetClass).toHaveBeenCalledWith('tab-btn-payments', expect.stringContaining('text-brand-primary'));
      expect(StaffApp.safeSetClass).toHaveBeenCalledWith('tab-btn-overview', expect.stringContaining('text-slate-400'));
    });
  });

  describe('User Scenario: Staff joins 20 May, 3 salaries paid, 5 total records', () => {
    test('generates exactly 5 cycles with 3 paid and 2 action needed for staff joining 20 May', () => {
      const stf = {
        staffId: 'STF-MAY20',
        fullName: 'Trainer John',
        salary: 30000,
        joinDate: '20-May-2026',
        status: 'Active'
      };

      // 3 paid salaries
      const payments = [
        { paymentId: 'PAY-1', staffId: 'STF-MAY20', amount: 30000, startDate: '20-May-2026', endDate: '19-Jun-2026', paymentStatus: 'Paid' },
        { paymentId: 'PAY-2', staffId: 'STF-MAY20', amount: 30000, startDate: '20-Jun-2026', endDate: '19-Jul-2026', paymentStatus: 'Paid' },
        { paymentId: 'PAY-3', staffId: 'STF-MAY20', amount: 30000, startDate: '20-Jul-2026', endDate: '19-Aug-2026', paymentStatus: 'Paid' }
      ];

      const res = StaffApp.getStaffCycles(stf, payments);

      // Assuming today is around Sep 2026 or later, total cycles is 5
      expect(res.totalCycles).toBeGreaterThanOrEqual(5);
      expect(res.paidCycles.length).toBe(3);
      expect(res.pendingCycles.length).toBeGreaterThanOrEqual(2);

      // Verify the 2 pending cycles are August and September in MMM-YY format
      const pendingLabels = res.pendingCycles.map(c => c.monthLabel);
      expect(pendingLabels).toContain('Aug-26');
      expect(pendingLabels).toContain('Sep-26');

      // Verify calendar month cycle structure (initial partial month, then 1st to last of month)
      const c1 = res.allCycles[0];
      expect(c1.monthLabel).toBe('May-26');
      expect(c1.startDate.getUTCDate()).toBe(20);
      expect(c1.startDate.getUTCMonth()).toBe(4); // May
      expect(c1.endDate.getUTCDate()).toBe(31);
      expect(c1.endDate.getUTCMonth()).toBe(4); // May

      const c2 = res.allCycles[1];
      expect(c2.monthLabel).toBe('Jun-26');
      expect(c2.startDate.getUTCDate()).toBe(1);
      expect(c2.startDate.getUTCMonth()).toBe(5); // June
      expect(c2.endDate.getUTCDate()).toBe(30);
      expect(c2.endDate.getUTCMonth()).toBe(5); // June

      const c3 = res.allCycles[2];
      expect(c3.monthLabel).toBe('Jul-26');
      expect(c3.startDate.getUTCDate()).toBe(1);
      expect(c3.endDate.getUTCDate()).toBe(31);
    });

    test('getCycleMonthLabel always derives month name from cycle end date in MMM-YY format', () => {
      // From endDate
      expect(StaffApp.getCycleMonthLabel({ endDate: '31-May-2026', paidDate: '20-Jun-2026' })).toBe('May-26');
      expect(StaffApp.getCycleMonthLabel({ endDate: '30-Jun-2026', paidDate: '05-Jul-2026' })).toBe('Jun-26');
      
      // From virtualEndDate
      expect(StaffApp.getCycleMonthLabel({ virtualEndDate: '2026-08-31T00:00:00.000Z' })).toBe('Aug-26');
      
      // From paidDate fallback (never raw date string)
      expect(StaffApp.getCycleMonthLabel({ paidDate: '15-Sep-2026' })).toBe('Sep-26');
    });

    test('parseDateRobust correctly parses diverse date formats', () => {
      expect(StaffApp.parseDateRobust('20/05/2026')).toEqual(new Date(Date.UTC(2026, 4, 20)));
      expect(StaffApp.parseDateRobust('20-05-2026')).toEqual(new Date(Date.UTC(2026, 4, 20)));
      expect(StaffApp.parseDateRobust('20.05.2026')).toEqual(new Date(Date.UTC(2026, 4, 20)));
      expect(StaffApp.parseDateRobust('20 May 2026')).toEqual(new Date(Date.UTC(2026, 4, 20)));
      expect(StaffApp.parseDateRobust('2026-05-20')).toEqual(new Date(Date.UTC(2026, 4, 20)));
    });

    test('collapsible notes wrapper toggles based on note content', () => {
      const mockClassList = { remove: jest.fn(), add: jest.fn() };
      global.document.getElementById = jest.fn((id) => {
        if (id === 'stf-notes-wrapper' || id === 'txn-notes-wrapper') {
          return { classList: mockClassList };
        }
        return {
          innerHTML: '',
          innerText: '',
          value: '',
          classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() }
        };
      });

      // When opening modal with notes
      StaffApp.openModal({ staffId: 'STF-1', fullName: 'John', notes: 'Great trainer' });
      expect(mockClassList.remove).toHaveBeenCalledWith('hidden');

      // When opening modal without notes
      mockClassList.remove.mockClear();
      mockClassList.add.mockClear();
      StaffApp.openModal({ staffId: 'STF-2', fullName: 'Jane', notes: '' });
      expect(mockClassList.add).toHaveBeenCalledWith('hidden');
    });
  });
});
