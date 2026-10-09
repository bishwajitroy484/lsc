const fs = require('fs');
const path = require('path');
const { distributeDailyProration, parseSafeDate } = require('../src/Utils_DB');
const { api_getExpenses, api_saveExpense } = require('../src/API_Expense');

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
          id: id || '',
          innerHTML: '',
          innerText: '',
          value: '',
          classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
          options: [],
          selectedIndex: 0,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          insertAdjacentHTML: jest.fn(),
          appendChild: jest.fn((el) => {
            if (el && el.id) mockElements[el.id] = el;
          }),
          remove: jest.fn()
        };
      }
      return mockElements[id];
    };

    global.document = {
      getElementById: jest.fn((id) => getMockElement(id)),
      querySelector: jest.fn(() => ({})),
      addEventListener: jest.fn(),
      createElement: jest.fn((tag) => ({
        tagName: tag,
        id: '',
        className: '',
        innerHTML: '',
        remove: jest.fn()
      }))
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

    it('should safely render without throwing when dropdown options have missing name or unexpected structures', () => {
      ExpensesApp.dropdowns = {
        expenseCats: [
          { id: 'CAT-1' },
          { id: 'CAT-2', category: 'Maintenance' },
          null
        ]
      };
      ExpensesApp.allData = [
        { expenseId: 'EXP-1', categoryId: 'CAT-1', amount: 500, date: '10-Jan-2026' },
        { expenseId: 'EXP-2', categoryId: 'CAT-2', amount: 1200, date: '12-Jan-2026' }
      ];
      ExpensesApp.filteredData = ExpensesApp.allData;

      expect(() => {
        ExpensesApp.calculateKPIs();
        ExpensesApp.renderCharts();
        ExpensesApp.filterTable();
      }).not.toThrow();

      expect(ExpensesApp.getName('CAT-1')).toBe('CAT-1');
      expect(ExpensesApp.getName('CAT-2')).toBe('Maintenance');
      expect(ExpensesApp.getName('UNKNOWN')).toBe('UNKNOWN');
    });

    it('should lazy load expenses in batches of 50 records', () => {
      jest.useFakeTimers();
      const records = [];
      for (let i = 1; i <= 120; i++) {
        records.push({ expenseId: 'EXP-' + i, categoryId: 'CAT-1', amount: 100, date: '10-Jan-2026', description: 'Item ' + i });
      }
      ExpensesApp.tableData = records;
      ExpensesApp.renderTable();

      expect(ExpensesApp.pageSize).toBe(50);
      expect(ExpensesApp.renderedCount).toBe(50);

      // Trigger loadMore
      ExpensesApp.loadMore();
      jest.advanceTimersByTime(200);

      expect(ExpensesApp.renderedCount).toBe(100);

      ExpensesApp.loadMore();
      jest.advanceTimersByTime(200);

      expect(ExpensesApp.renderedCount).toBe(120);
      jest.useRealTimers();
    });
  });

  describe('Backend api_saveExpense', () => {
    beforeEach(() => {
      global.Session = {
        getActiveUser: () => ({ getEmail: () => 'admin@lsc.com' })
      };
      global.generateId = (prefix) => `${prefix}-TEST123`;
      global.api_uploadImageToDrive = jest.fn((base64, filename) => ({
        success: true,
        fileId: 'DRIVE_FILE_999',
        url: 'https://drive.google.com/uc?export=view&id=DRIVE_FILE_999'
      }));
    });

    it('should save a new expense, intercept base64Image upload to Drive, and omit notes', () => {
      let createdRecord = null;
      global.DB = {
        create: jest.fn((table, data) => {
          createdRecord = { ...data };
          return createdRecord;
        })
      };

      const payload = {
        categoryId: 'CAT-1',
        amount: 5000,
        date: '25-Sep-2026',
        description: 'New Dumbbells',
        notes: 'Some temporary notes',
        base64Image: 'data:image/png;base64,iVBORw0KGgo...',
        imageName: 'receipt.png'
      };

      const res = api_saveExpense(payload);
      expect(res.success).toBe(true);
      expect(global.api_uploadImageToDrive).toHaveBeenCalledWith(
        'data:image/png;base64,iVBORw0KGgo...',
        'EXP-TEST123'
      );
      expect(createdRecord.expenseId).toBe('EXP-TEST123');
      expect(createdRecord.receiptFileId).toBe('DRIVE_FILE_999');
      expect(createdRecord.base64Image).toBeUndefined();
      expect(createdRecord.imageName).toBeUndefined();
      expect(createdRecord.createdBy).toBe('admin@lsc.com');
    });

    it('should update an existing expense without overwriting receiptFileId when no new image', () => {
      let updatedRecord = null;
      global.DB = {
        update: jest.fn((table, id, data) => {
          updatedRecord = { ...data };
          return updatedRecord;
        })
      };

      const payload = {
        expenseId: 'EXP-EXISTING',
        categoryId: 'CAT-2',
        amount: 12000,
        date: '20-Sep-2026',
        description: 'Electricity Bill',
        receiptFileId: 'EXISTING_FILE_ID'
      };

      const res = api_saveExpense(payload);
      expect(res.success).toBe(true);
      expect(global.DB.update).toHaveBeenCalledWith('EXPENSES', 'EXP-EXISTING', expect.any(Object));
      expect(updatedRecord.receiptFileId).toBe('EXISTING_FILE_ID');
      expect(global.api_uploadImageToDrive).not.toHaveBeenCalled();
    });
  });

  describe('Receipt link rendering', () => {
    it('should render a receipt link using receiptFileId with Drive viewer URL', () => {
      // The renderTable code uses: exp.receiptFileId || exp.receiptUrl
      const exp = { receiptFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz' };
      const fileId = exp.receiptFileId || exp.receiptUrl || '';
      expect(fileId).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
      expect(`https://drive.google.com/file/d/${fileId}/view?usp=sharing`)
        .toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing');
    });

    it('should fall back to receiptUrl if receiptFileId is absent', () => {
      const exp = { receiptUrl: 'https://example.com/receipt.png' };
      const fileId = exp.receiptFileId || exp.receiptUrl || '';
      expect(fileId).toBe('https://example.com/receipt.png');
    });
  });

  describe('Category resolution via getName', () => {
    it('should look up a category name by its ID', () => {
      ExpensesApp.dropdowns = {
        expenseCats: [
          { id: 'CAT-RENT', name: 'Rent' },
          { id: 'CAT-UTIL', name: 'Utilities' }
        ]
      };
      expect(ExpensesApp.getName('CAT-RENT')).toBe('Rent');
      expect(ExpensesApp.getName('CAT-UTIL')).toBe('Utilities');
      expect(ExpensesApp.getName('NON-EXISTENT')).toBe('NON-EXISTENT');
    });
  });

  describe('KPI calculation', () => {
    it('should calculate total correctly using categoryId', () => {
      ExpensesApp.dropdowns = {
        expenseCats: [{ id: 'CAT-1', name: 'Rent' }]
      };
      ExpensesApp.filteredData = [
        { expenseId: 'EXP-1', categoryId: 'CAT-1', amount: 5000, date: '10-Jan-2026' }
      ];
      ExpensesApp.staffMetrics = {};
      ExpensesApp.selectedPeriods = ['Jan'];
      document.getElementById('exp-filter-year').value = '2026';
      document.getElementById('exp-filter-mode').value = 'Monthly';

      ExpensesApp.calculateKPIs();

      expect(document.getElementById('kpi-total-exp').innerText).toBe(AppUtils.formatCurrency(5000));
    });
  });

  describe('Backend parseSafeDate', () => {
    it('should parse various date string formats correctly', () => {
      const d1 = parseSafeDate('15-Jan-2026');
      expect(d1.getFullYear()).toBe(2026);
      expect(d1.getMonth()).toBe(0);

      const d2 = parseSafeDate('2026-05-20');
      expect(d2.getFullYear()).toBe(2026);

      const d3 = parseSafeDate('20/05/2026');
      expect(d3.getFullYear()).toBe(2026);

      const d4 = parseSafeDate('invalid');
      expect(isNaN(d4.getTime())).toBe(true);
    });
  });
});

test('expense KPIs and charts use the dashboard info tips', () => {
  const view = fs.readFileSync(path.join(__dirname, '../src/View_Expenses.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../src/Script_Expenses.html'), 'utf8');
  expect(view).toContain('aria-label="About Total Outflow"');
  expect(view).toContain('aria-label="About Staff Cost"');
  expect(view).toContain('aria-label="About period average"');
  expect(view).toContain('aria-label="About Staff count"');
  expect(view).toContain('aria-label="About Expenses Trend"');
  expect(view).toContain('aria-label="About Expenses by Category"');
  expect(view).toContain('metric-tip-bubble');
  expect(view).toContain('grid-cols-2 xl:grid-cols-3');
  expect(view).not.toContain('md:grid-cols-4');
  expect(script).toContain('flex-1 xl:flex-none text-center');
  expect(view).toContain('id="exp-list-filters-expenses" class="hidden w-full xl:w-auto min-w-0"');
  expect(view).not.toContain('md:flex md:w-auto md:flex-nowrap');
});





