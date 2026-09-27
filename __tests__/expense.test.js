const fs = require('fs');
const path = require('path');
const { distributeDailyProration, parseSafeDate } = require('../src/Utils_DB');
const { api_getExpenses } = require('../src/API_Expense');

describe('Expense Module - Staff Cost Integration & Calculations', () => {
  let ExpensesApp;
  let AppUtils;

  beforeAll(() => {
    // 1. Load AppUtils
    const globalStateHtml = fs.readFileSync(path.join(__dirname, '../src/Global_State.html'), 'utf8');
    const appUtilsMatch = globalStateHtml.match(/const AppUtils = ({[\s\S]*?\n  };)/);
    if (!appUtilsMatch) throw new Error("Could not extract AppUtils from Global_State.html");
    AppUtils = new Function(`return ${appUtilsMatch[1]};`)();
    global.AppUtils = AppUtils;

    // 2. Load ExpensesApp
    const expensesHtml = fs.readFileSync(path.join(__dirname, '../src/Script_Expenses.html'), 'utf8');
    const expensesAppMatch = expensesHtml.match(/var ExpensesApp = ({[\s\S]*?\n  };)/);
    if (!expensesAppMatch) throw new Error("Could not extract ExpensesApp from Script_Expenses.html");

    // Provide mock DOM environment
    const mockElements = {};
    const getMockElement = (id) => {
      if (!mockElements[id]) {
        mockElements[id] = {
          innerHTML: '',
          innerText: '',
          value: '',
          classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
          options: [],
          selectedIndex: 0
        };
      }
      return mockElements[id];
    };

    global.document = {
      getElementById: jest.fn((id) => getMockElement(id)),
      querySelector: jest.fn(() => ({})),
      addEventListener: jest.fn()
    };

    global.ApexCharts = jest.fn(() => ({
      render: jest.fn(),
      destroy: jest.fn()
    }));

    global.Toast = {
      error: jest.fn(),
      success: jest.fn()
    };

    global.flatpickr = jest.fn();

    const createExpensesApp = new Function('AppUtils', `return ${expensesAppMatch[1]};`);
    ExpensesApp = createExpensesApp(AppUtils);
    ExpensesApp.dropdowns = {
      expenseCats: [
        { id: 'CAT-1', name: 'Rent' },
        { id: 'CAT-2', name: 'Utilities' }
      ]
    };
  });

  describe('Backend api_getExpenses', () => {
    beforeEach(() => {
      global.distributeDailyProration = distributeDailyProration;
      global.parseSafeDate = parseSafeDate;
    });

    it('should batchRead EXPENSES, SALARY, and SETTINGS and compute staffMetrics correctly', () => {
      global.DB = {
        batchRead: jest.fn(() => ({
          EXPENSES: [
            { expenseId: 'EXP-1', categoryId: 'CAT-1', amount: 10000, date: '15-Jan-2026' }
          ],
          SALARY: [
            { paymentId: 'SAL-1', staffId: 'STF-1', amount: 30000, paidDate: '31-Jan-2026', startDate: '01-Jan-2026', endDate: '31-Jan-2026', paymentStatus: 'Paid' },
            { paymentId: 'SAL-2', staffId: 'STF-2', amount: 20000, paidDate: '28-Feb-2026', startDate: '01-Feb-2026', endDate: '28-Feb-2026', paymentStatus: 'Paid' },
            { paymentId: 'SAL-3', staffId: 'STF-3', amount: 15000, paidDate: '31-Mar-2026', startDate: '01-Mar-2026', endDate: '31-Mar-2026', paymentStatus: 'Pending' } // ignored
          ],
          SETTINGS: [{ key: 'revenue_recognition', value: 'split' }]
        }))
      };

      const res = api_getExpenses();
      expect(res.success).toBe(true);
      expect(res.data.length).toBe(1);
      expect(res.salaries.length).toBe(3);
      expect(res.staffMetrics[2026]).toBeDefined();
      expect(res.staffMetrics[2026].monthly[0]).toBeCloseTo(30000);
      expect(res.staffMetrics[2026].monthly[1]).toBeCloseTo(20000);
      expect(res.staffMetrics[2026].monthly[2]).toBe(0); // Pending is excluded
      expect(res.staffMetrics[2026].totalCost).toBeCloseTo(50000);
      expect(res.staffMetrics[2026].quarterly[0]).toBeCloseTo(50000);
    });
  });

  describe('Frontend ExpensesApp Calculations', () => {
    it('should accurately calculate Staff Cost KPI and Grand Total Expenses', () => {
      ExpensesApp.allData = [
        { expenseId: 'EXP-1', categoryId: 'CAT-1', amount: 10000, date: '15-Jan-2026' }
      ];
      ExpensesApp.staffMetrics = {
        2026: {
          monthly: [25000, 25000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          quarterly: [50000, 0, 0, 0],
          totalCost: 50000
        }
      };

      // Set filter to Year 2026, Monthly, Jan selected
      document.getElementById('exp-filter-year').value = '2026';
      document.getElementById('exp-filter-mode').value = 'Monthly';
      ExpensesApp.selectedPeriods = ['Jan'];
      ExpensesApp.filteredData = ExpensesApp.allData;

      ExpensesApp.calculateKPIs();

      // Check Staff Cost KPI
      const staffKpi = document.getElementById('kpi-staff-exp').innerText;
      expect(staffKpi).toBe(AppUtils.formatCurrency(25000));

      // Check Total Expenses KPI (10,000 direct + 25,000 staff = 35,000)
      const totalKpi = document.getElementById('kpi-total-exp').innerText;
      expect(totalKpi).toBe(AppUtils.formatCurrency(35000));

      // Check Monthly Avg (35,000 / 1 period = 35,000)
      const avgKpi = document.getElementById('kpi-avg-exp').innerText;
      expect(avgKpi).toBe(AppUtils.formatCurrency(35000));

      // Check Most Spent (Staff Cost is 25,000, Rent is 10,000 -> Top is Staff Cost)
      const topCat = document.getElementById('kpi-top-cat').innerText;
      expect(topCat).toBe('Staff Cost');
    });

    it('should calculate quarterly staff costs when in Quarterly mode', () => {
      document.getElementById('exp-filter-year').value = '2026';
      document.getElementById('exp-filter-mode').value = 'Quarterly';
      ExpensesApp.selectedPeriods = ['Q1'];
      ExpensesApp.filteredData = ExpensesApp.allData;

      ExpensesApp.calculateKPIs();

      // Q1 staff cost is 50,000
      const staffKpi = document.getElementById('kpi-staff-exp').innerText;
      expect(staffKpi).toBe(AppUtils.formatCurrency(50000));

      // Total Expenses is 10,000 + 50,000 = 60,000
      const totalKpi = document.getElementById('kpi-total-exp').innerText;
      expect(totalKpi).toBe(AppUtils.formatCurrency(60000));
    });
  });
});
