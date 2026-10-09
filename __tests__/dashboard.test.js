const fs = require('fs');
const path = require('path');
const { parseSafeDate, distributeDailyProration } = require('../src/Utils_DB');

function loadDashboardApi(accrualMode = 'anchor', additionalExpenses = []) {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Dashboard.js'), 'utf8');

  return new Function(
    'DB',
    'Session',
    'api_getGlobalDropdowns',
    'parseSafeDate',
    'parseAmt',
    'isSuccess',
    'distributeDailyProration',
    `
      ${source};
      return {
        api_getDashboardMetrics,
        calculateMonthlyExpenseAverages,
        processOperations,
        formatTimePeriods
      };
    `
  )(
    {
      batchRead: jest.fn(() => ({
        MEMBERS: [
          { memberId: 'MEM-1', fullName: 'Alice Johnson', membershipId: 'PLAN-1', joinDate: '2024-01-05', status: 'Active' },
          { memberId: 'MEM-2', fullName: 'Bob Smith', membershipId: 'PLAN-2', joinDate: '2023-11-15', status: 'Active' },
          { memberId: 'MEM-3', fullName: 'Charlie Brown', membershipId: 'PLAN-3', joinDate: '2024-02-10', status: 'Inactive' }
        ],
        PAYMENTS: [
          { memberId: 'MEM-1', paymentStatus: 'Paid', startDate: '2024-01-05', endDate: '2024-01-31', amount: 2500 },
          { memberId: 'MEM-1', paymentStatus: 'STATUS-OVERDUE', startDate: '2024-01-05', endDate: '2024-01-31', amount: 1500 },
          { memberId: 'MEM-2', paymentStatus: 'Paid', startDate: '2024-02-10', endDate: '2024-02-28', amount: 4000 },
          { memberId: 'MEM-2', paymentStatus: 'Unpaid', startDate: '2024-03-01', endDate: '2024-03-31', amount: 4000 }
        ],
        EXPENSES: [
          { categoryId: 'CAT-1', amount: 2500, date: '2024-01-15' },
          { categoryId: 'CAT-2', amount: 1300, date: '2024-02-20' },
          { categoryId: 'CAT-1', amount: 900, date: '2024-03-15' },
          { categoryId: 'CAT-3', amount: 200, date: '2024-03-20', whatMisc: 'Cleaning' },
          ...additionalExpenses
        ],
        STAFF: [
          { staffId: 'STF-1', fullName: 'Coach A', status: 'Active', salary: 30000 },
          { staffId: 'STF-2', fullName: 'Coach B', status: 'Active', salary: 22000 }
        ],
        SALARY: [
          { staffId: 'STF-1', paymentStatus: 'Paid', amount: 30000, startDate: '2024-01-01', endDate: '2024-01-31' },
          { staffId: 'STF-2', paymentStatus: 'Paid', amount: 22000, startDate: '2024-01-01', endDate: '2024-01-31' }
        ],
        DROP_DOWN: [
          { key: 'membership', value: 'Monthly' },
          { key: 'batch', value: 'Morning' }
        ],
        SETTINGS: [
          { key: 'Revenue_Recognition', value: accrualMode }
        ]
      }))
    },
    { getActiveUser: () => ({ getEmail: () => 'alex@example.com' }) },
    () => ({
      success: true,
      data: {
        options: {
          membership: [{ id: 'PLAN-1', name: 'Monthly' }, { id: 'PLAN-2', name: 'Quarterly' }, { id: 'PLAN-3', name: 'Trial' }],
          paymentstatus: [{ id: 'STATUS-OVERDUE', name: 'Overdue' }],
          batch: [{ id: 'B-1', name: 'Morning' }],
          status: [{ id: 'ACT', name: 'Active' }],
          expenseCats: [{ id: 'CAT-1', name: 'Rent' }, { id: 'CAT-2', name: 'Utilities' }, { id: 'CAT-3', name: 'Misc' }]
        }
      }
    }),
    parseSafeDate,
    (value) => {
      const clean = String(value ?? '').replace(/[^0-9.-]+/g, '');
      const num = Number(clean);
      return Number.isFinite(num) ? num : 0;
    },
    (status) => String(status || '').toLowerCase() === 'paid',
    distributeDailyProration
  );
}

describe('Dashboard Module', () => {
  test('api_getDashboardMetrics returns KPI and chart payloads for the selected year', () => {
    const dashboardApi = loadDashboardApi();
    const response = dashboardApi.api_getDashboardMetrics('2024', 'Monthly', ['Jan', 'Feb']);

    expect(response.success).toBe(true);
    expect(response.data.userGreetingName).toBe('Alex');
    expect(response.data.kpis).toHaveProperty('activeMembers');
    expect(response.data.kpis).toHaveProperty('totalOperatingExpenses');
    expect(response.data.charts).toHaveProperty('categories');
    expect(response.data.charts).toHaveProperty('revenue');
    expect(response.data.charts).toHaveProperty('expenses');
    expect(response.data.kpis.membersCollected).toBe(6500);
    expect(response.data.charts.revenue).toEqual([2500, 4000]);
    expect(response.data.charts.collectionTrend.collected).toEqual([2500, 4000]);
    expect(response.data.charts.expenseBreakdown.labels).toEqual(['Rent', 'Utilities', 'Staff Cost']);
    expect(response.data.charts.expenseBreakdown.series).toEqual([2500, 1300, 52000]);
  });

  test('expense breakdown follows selected months and quarters', () => {
    const dashboardApi = loadDashboardApi();
    const march = dashboardApi.api_getDashboardMetrics('2024', 'Monthly', ['Mar']);
    const firstQuarter = dashboardApi.api_getDashboardMetrics('2024', 'Quarterly', ['Q1 (JFM)']);
    const secondQuarter = dashboardApi.api_getDashboardMetrics('2024', 'Quarterly', ['Q2 (AMJ)']);

    expect(march.data.charts.expenseBreakdown.labels).toEqual(['Rent', 'Misc']);
    expect(march.data.charts.expenseBreakdown.series).toEqual([900, 200]);
    expect(march.data.charts.expenseBreakdown.miscLabels).toEqual(['Cleaning']);
    expect(march.data.charts.expenseBreakdown.miscSeries).toEqual([200]);
    expect(firstQuarter.data.charts.expenseBreakdown.labels).toEqual(['Rent', 'Utilities', 'Misc', 'Staff Cost']);
    expect(firstQuarter.data.charts.expenseBreakdown.series).toEqual([3400, 1300, 200, 52000]);
    expect(secondQuarter.data.charts.expenseBreakdown.labels).toEqual([]);
    expect(secondQuarter.data.charts.expenseBreakdown.series).toEqual([]);
  });

  test('expense breakdown allocates split-recognized costs across selected months', () => {
    const dashboardApi = loadDashboardApi('split', [{
      categoryId: 'CAT-4',
      amount: 310,
      startDate: '2024-01-31',
      endDate: '2024-03-01'
    }]);
    const february = dashboardApi.api_getDashboardMetrics('2024', 'Monthly', ['Feb']);

    expect(february.data.charts.expenseBreakdown.labels).toEqual(['Utilities', 'CAT-4']);
    expect(february.data.charts.expenseBreakdown.series).toEqual([1300, 290]);
  });

  test('api_getAvailableYears includes years present in application data and sorts them newest first', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/API_Dashboard.js'), 'utf8');
    const dashboardApi = new Function(
      'DB',
      'parseSafeDate',
      `
        ${source};
        return { api_getAvailableYears };
      `
    )(
      {
        batchRead: jest.fn(() => ({
          MEMBERS: [{ joinDate: '15-Jan-2026' }],
          PAYMENTS: [{ startDate: '2027-02-01', endDate: '2027-02-28' }],
          EXPENSES: [{ date: '2024-03-05' }],
          STAFF: [{ joinDate: 'invalid-date' }],
          SALARY: []
        }))
      },
      parseSafeDate
    );

    const response = dashboardApi.api_getAvailableYears();

    expect(response.success).toBe(true);
    expect(response.data).toContain('2026');
    expect(response.data).toContain('2027');
    expect(response.data.indexOf('2027')).toBeLessThan(response.data.indexOf('2026'));
  });

  test('api_getDashboardMetrics safely handles empty or failed dropdown data without crashing', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/API_Dashboard.js'), 'utf8');
    const dashboardApi = new Function(
      'DB',
      'Session',
      'api_getGlobalDropdowns',
      'parseSafeDate',
      'parseAmt',
      'isSuccess',
      'distributeDailyProration',
      `
        ${source};
        return { api_getDashboardMetrics };
      `
    )(
      { batchRead: jest.fn(() => ({ MEMBERS: [], PAYMENTS: [], EXPENSES: [], STAFF: [], SALARY: [], DROP_DOWN: [], SETTINGS: [] })) },
      { getActiveUser: () => ({ getEmail: () => 'no-user@example.com' }) },
      () => ({ success: false, error: 'No dropdowns found' }),
      parseSafeDate,
      (value) => Number(String(value ?? '').replace(/[^0-9.-]+/g, '')) || 0,
      (status) => String(status || '').toLowerCase() === 'paid',
      distributeDailyProration
    );

    const response = dashboardApi.api_getDashboardMetrics('2024', 'Monthly', ['Jan']);
    expect(response.success).toBe(true);
    expect(Array.isArray(response.data.charts.categories)).toBe(true);
    expect(response.data.kpis.activeMembers).toBeGreaterThanOrEqual(0);
  });

  test('forecasts quarterly collections from each active member next due date and expected amount', () => {
    const dashboardApi = loadDashboardApi();
    const members = [{
      memberId: 'MEM-Q',
      fullName: 'Quarterly Member',
      membershipId: 'PLAN-Q',
      membershipAmount: 3000,
      joinDate: '2023-11-01',
      status: 'Active'
    }];
    const payments = [{
      memberId: 'MEM-Q',
      paymentStatus: 'Paid',
      amount: 3000,
      endDate: '2024-01-31',
      paidDate: '2024-01-01'
    }];
    const resolveName = (tab, field, value) => field === 'membershipId' ? 'Quarterly' : String(value || '');
    const dropDowns = { membership: [{ id: 'PLAN-Q', name: 'Quarterly', frequency: 'Quarterly' }] };

    const forecast = dashboardApi.processOperations(
      members, [], payments, 2024, new Date(2024, 0, 15), resolveName, dropDowns, 'anchor'
    );

    expect(forecast.expectedCollectionArr[0]).toBe(0);
    expect(forecast.expectedCollectionArr[1]).toBe(3000);
    expect(forecast.expectedCollectionArr[2]).toBe(0);
    expect(forecast.expectedCollectionArr[4]).toBe(3000);
  });

  test('split recognition prorates expected quarterly payments across their coverage months', () => {
    const dashboardApi = loadDashboardApi();
    const members = [{
      memberId: 'MEM-Q',
      membershipId: 'PLAN-Q',
      membershipAmount: 3000,
      joinDate: '2023-11-01',
      status: 'Active'
    }];
    const payments = [{
      memberId: 'MEM-Q',
      paymentStatus: 'Paid',
      amount: 3000,
      endDate: '2024-01-31',
      paidDate: '2024-01-01'
    }];
    const resolveName = (tab, field, value) => field === 'membershipId' ? 'Quarterly' : String(value || '');
    const dropDowns = { membership: [{ id: 'PLAN-Q', name: 'Quarterly', frequency: 'Quarterly' }] };

    const forecast = dashboardApi.processOperations(
      members, [], payments, 2024, new Date(2024, 0, 15), resolveName, dropDowns, 'split'
    );

    expect(forecast.expectedCollectionArr[1]).toBeCloseTo(3000 * 29 / 90, 2);
    expect(forecast.expectedCollectionArr[2]).toBeCloseTo(3000 * 31 / 90, 2);
    expect(forecast.expectedCollectionArr[3]).toBeCloseTo(3000 * 30 / 90, 2);
  });

  test('does not forecast overdue or ad-hoc members as upcoming collections', () => {
    const dashboardApi = loadDashboardApi();
    const members = [
      { memberId: 'MEM-LATE', membershipId: 'PLAN-Q', membershipAmount: 3000, joinDate: '2023-11-01', status: 'Active' },
      { memberId: 'MEM-TRIAL', membershipId: 'PLAN-TRIAL', membershipAmount: 500, joinDate: '2024-01-01', status: 'Active' }
    ];
    const payments = [
      { memberId: 'MEM-LATE', paymentStatus: 'Paid', amount: 3000, endDate: '2023-12-31' }
    ];
    const resolveName = (tab, field, value) => ({
      'PLAN-Q': 'Quarterly',
      'PLAN-TRIAL': 'Trial'
    }[value] || String(value || ''));
    const dropDowns = {
      membership: [
        { id: 'PLAN-Q', name: 'Quarterly', frequency: 'Quarterly' },
        { id: 'PLAN-TRIAL', name: 'Trial', frequency: 'Ad-hoc' }
      ]
    };

    const forecast = dashboardApi.processOperations(
      members, [], payments, 2024, new Date(2024, 0, 15), resolveName, dropDowns, 'anchor'
    );

    expect(forecast.expectedCollectionArr.every(amount => amount === 0)).toBe(true);
  });

  test('uses the trailing twelve recognized months of operating and salary expenses', () => {
    const dashboardApi = loadDashboardApi();
    const averages = dashboardApi.calculateMonthlyExpenseAverages(
      [{ amount: 1200, date: '2023-06-15', categoryId: 'CAT-1' }],
      [
        { amount: 24000, paymentStatus: 'Paid', startDate: '2023-01-01', endDate: '2023-12-31' },
        { amount: 12000, paymentStatus: 'Pending', startDate: '2023-01-01', endDate: '2023-12-31' }
      ],
      (tab, field, value) => field === 'paymentStatus' ? value : 'Paid',
      'anchor',
      new Date(2024, 0, 15)
    );

    expect(averages.operating).toBe(100);
    expect(averages.staff).toBe(2000);
  });

  test('keeps actual net values unchanged and forecasts expected net for future periods', () => {
    const dashboardApi = loadDashboardApi();
    const metrics = dashboardApi.formatTimePeriods(
      { revArr: [10000, 0, 0, ...new Array(9).fill(0)], expArr: [2000, 0, 0, ...new Array(9).fill(0)], staffArr: new Array(12).fill(0) },
      { overdueArr: new Array(12).fill(0), expectedCollectionArr: [0, 900, 0, ...new Array(9).fill(0)] },
      'Monthly',
      ['Jan', 'Feb', 'Mar'],
      2024,
      new Date(2024, 0, 15),
      { operating: 200, staff: 100 },
      null
    );

    expect(metrics.predictionLabels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(metrics.actualNetArr).toEqual([8000, null, null]);
    expect(metrics.expectedNetArr).toEqual([8000, 600, -300]);
    expect(metrics.transitionIndex).toBe(0);
  });

  test('keeps the Net-In-Hand chart fixed as an area chart without a chart type selector', () => {
    const view = fs.readFileSync(path.join(__dirname, '../src/View_Dashboard.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '../src/Script_Dashboard.html'), 'utf8');
    const predictionConfig = script.slice(script.indexOf('// 3. Net-In-Hand'), script.indexOf('// 4. Collection Trend'));

    expect(view).not.toContain('toggle-pred');
    expect(predictionConfig).toContain("type: 'area'");
    expect(predictionConfig).toContain("fill: { opacity: [0.12, 0] }");
  });

  test('keeps dashboard metric and chart tooltips readable and unclipped', () => {
    const view = fs.readFileSync(path.join(__dirname, '../src/View_Dashboard.html'), 'utf8');
    const styles = fs.readFileSync(path.join(__dirname, '../src/Global_Styles.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '../src/Script_Dashboard.html'), 'utf8');

    expect(view).toContain('metric-tip-bubble');
    expect(view).toMatch(/justify-between min-w-0 overflow-visible/);
    expect(view).toMatch(/h-full min-w-0 overflow-visible/);
    expect(styles).toContain('.metric-tip-bubble');
    expect(styles).toContain('position: fixed');
    expect(styles).toContain('.metric-tip-bubble.is-open');
    expect(styles).toContain('.metric-tip-bubble.tip-above::after');
    expect(styles).toContain('font-size: 12px');
    expect(styles).toContain('.apexcharts-tooltip');
    expect(styles).toContain('background: #0f172a !important');
    expect(styles).toContain('z-index: 10050 !important');
    expect(script).toContain("theme: 'dark'");
    expect(script).toContain('commonTooltip');
  });

  test('applies the October client feedback on dashboard, expenses, and settings', () => {
    const dash = fs.readFileSync(path.join(__dirname, '../src/View_Dashboard.html'), 'utf8');
    const dashScript = fs.readFileSync(path.join(__dirname, '../src/Script_Dashboard.html'), 'utf8');
    const expenses = fs.readFileSync(path.join(__dirname, '../src/View_Expenses.html'), 'utf8');
    const members = fs.readFileSync(path.join(__dirname, '../src/View_Members.html'), 'utf8');
    const staff = fs.readFileSync(path.join(__dirname, '../src/View_Staff.html'), 'utf8');
    const settings = fs.readFileSync(path.join(__dirname, '../src/View_Settings.html'), 'utf8');
    const state = fs.readFileSync(path.join(__dirname, '../src/Global_State.html'), 'utf8');
    const access = fs.readFileSync(path.join(__dirname, '../src/API_Access.js'), 'utf8');

    expect(dash).toContain('Net-In-Hand Forecast');
    expect(dash).not.toContain('Net-In-Hand Prediction');
    expect(dash).not.toContain('id="chart-staff-trend"');
    expect(dash).toContain('id="dash-birthdays"');
    expect(dashScript).toContain('renderDashboardBirthdays');
    expect(expenses).toContain('leading-tight">Expenses</h1>');
    expect(members).toContain('Date of Joining');
    expect(staff).toContain('Date of Joining');
    expect(settings).toContain('gen-NOTIFY_WA_OVERDUE');
    expect(settings).toContain('gen-NOTIFY_WA_UPCOMING');
    expect(state).toContain('api_saveMyTableColumns');
    expect(access).toContain("'tableColumns'");
  });

  test('reflects recognized future revenue from split payments in Net-In-Hand Prediction', () => {
    const dashboardApi = loadDashboardApi();
    const revArr = [0, 0, 0, 0, 0, 5200, 10000, 10000, 9700, 10100, 9800, 5200];
    const expArr = new Array(12).fill(0);
    const expectedCollectionArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000];

    const metrics = dashboardApi.formatTimePeriods(
      { revArr, expArr, staffArr: new Array(12).fill(0) },
      { overdueArr: new Array(12).fill(0), expectedCollectionArr },
      'Monthly',
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      2026,
      new Date(2026, 8, 28), // 28-Sep-2026 (Month 8 = Sep)
      { operating: 0, staff: 0 },
      null
    );

    // Sep (index 8) is current month (transitionIndex)
    expect(metrics.transitionIndex).toBe(8);
    expect(metrics.actualNetArr[8]).toBe(9700);
    expect(metrics.actualNetArr[9]).toBeNull(); // Oct
    expect(metrics.actualNetArr[10]).toBeNull(); // Nov
    expect(metrics.actualNetArr[11]).toBeNull(); // Dec

    // Future periods Oct and Nov must reflect recognized revenue and NOT drop to 0
    expect(metrics.expectedNetArr[8]).toBe(9700);
    expect(metrics.expectedNetArr[9]).toBe(10100);
    expect(metrics.expectedNetArr[10]).toBe(9800);
    // Dec combines recognized revenue from active payment (5200) + future expected renewal (5000)
    expect(metrics.expectedNetArr[11]).toBe(10200);
  });

  test('calculateMonthlyExpenseAverages uses nominal monthly run rate of active staff members', () => {
    const dashboardApi = loadDashboardApi();
    const staff = [
      { staffId: 'STF-1', fullName: 'Coach 1', status: 'Active', salary: 11500 },
      { staffId: 'STF-2', fullName: 'Coach 2', status: 'Inactive', salary: 25000 },
      { staffId: 'STF-3', fullName: 'Coach 3', status: 'Active', salary: '₹8,500' }
    ];
    const salaries = [
      { amount: 50000, paymentStatus: 'Paid', startDate: '2023-01-01', endDate: '2023-12-31' }
    ];
    const averages = dashboardApi.calculateMonthlyExpenseAverages(
      [],
      salaries,
      (tab, field, val) => val,
      'anchor',
      new Date(2024, 0, 15),
      staff
    );

    // Active staff are Coach 1 (11500) and Coach 3 (8500) = 20000 run rate.
    // Inactive Coach 2 (25000) is excluded.
    expect(averages.staff).toBe(20000);
  });

  test('calculateMonthlyExpenseAverages falls back to trailing salary average when no active staff salaries are set', () => {
    const dashboardApi = loadDashboardApi();
    const staff = [
      { staffId: 'STF-1', fullName: 'Volunteer Coach', status: 'Active', salary: 0 }
    ];
    const salaries = [
      { amount: 24000, paymentStatus: 'Paid', startDate: '2023-01-01', endDate: '2023-12-31' }
    ];
    const averages = dashboardApi.calculateMonthlyExpenseAverages(
      [],
      salaries,
      (tab, field, val) => val,
      'anchor',
      new Date(2024, 0, 15),
      staff
    );

    expect(averages.staff).toBe(2000);
  });

  test('forecasts Net-In-Hand using nominal staff run rate in future periods', () => {
    const dashboardApi = loadDashboardApi();
    // 1 staff member at 11,500/month nominal run rate, no operating expenses
    // 2 quarterly members paying 30,000 renewals in Nov and Dec, 0 in Oct
    const metrics = dashboardApi.formatTimePeriods(
      { revArr: new Array(12).fill(0), expArr: new Array(12).fill(0), staffArr: new Array(12).fill(0) },
      { overdueArr: new Array(12).fill(0), expectedCollectionArr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30000, 30000] },
      'Monthly',
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      2026,
      new Date(2026, 8, 28), // 28-Sep-2026 (Month 8 = Sep)
      { operating: 0, staff: 11500 },
      null
    );

    // Oct (index 9): 0 collection - 11,500 staff = -11,500
    expect(metrics.expectedNetArr[9]).toBe(-11500);
    // Nov (index 10): 30,000 collection - 11,500 staff = 18,500
    expect(metrics.expectedNetArr[10]).toBe(18500);
    // Dec (index 11): 30,000 collection - 11,500 staff = 18,500
    expect(metrics.expectedNetArr[11]).toBe(18500);
  });

  test('calculates actualNet, remainingForecastNet, and projectedNet correctly in formatTimePeriods', () => {
    const dashboardApi = loadDashboardApi();
    // 9 elapsed months with 10k net each = 90k actual
    // 3 future months: Oct (-11.5k), Nov (+18.5k), Dec (+18.5k) = +25.5k remaining forecast
    const revArr = [...new Array(9).fill(20000), 0, 0, 0];
    const expArr = [...new Array(9).fill(10000), 0, 0, 0];
    const expectedCollectionArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30000, 30000];

    const metrics = dashboardApi.formatTimePeriods(
      { revArr, expArr, staffArr: new Array(12).fill(0) },
      { overdueArr: new Array(12).fill(0), expectedCollectionArr },
      'Monthly',
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      2026,
      new Date(2026, 8, 28), // 28-Sep-2026
      { operating: 0, staff: 11500 },
      null
    );

    expect(metrics.actualNet).toBe(90000);
    expect(metrics.remainingForecastNet).toBe(25500);
    expect(metrics.projectedNet).toBe(115500);
  });

  test('keeps Remaining Net-In-Hand consistent between Monthly and Quarterly mid-year', () => {
    const dashboardApi = loadDashboardApi();
    const revArr = [...new Array(9).fill(20000), 0, 0, 0];
    const expArr = [...new Array(9).fill(10000), 0, 0, 0];
    const expectedCollectionArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30000, 30000];
    const financial = { revArr, expArr, staffArr: new Array(12).fill(0) };
    const operational = { overdueArr: new Array(12).fill(0), expectedCollectionArr };
    const averages = { operating: 0, staff: 11500 };
    const today = new Date(2026, 8, 28); // 28-Sep-2026 — still inside Q3

    const monthly = dashboardApi.formatTimePeriods(
      financial, operational, 'Monthly',
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      2026, today, averages, null
    );
    const quarterly = dashboardApi.formatTimePeriods(
      financial, operational, 'Quarterly',
      ['Q1 (JFM)', 'Q2 (AMJ)', 'Q3 (JAS)', 'Q4 (OND)'],
      2026, today, averages, null
    );

    expect(quarterly.remainingForecastNet).toBe(monthly.remainingForecastNet);
    expect(quarterly.actualNet).toBe(monthly.actualNet);
    expect(quarterly.projectedNet).toBe(monthly.projectedNet);
    expect(quarterly.remainingForecastNet).toBe(25500);
  });

  test('keeps Remaining Net-In-Hand non-zero in Quarterly during Q4', () => {
    const dashboardApi = loadDashboardApi();
    // Through Sep: 10k net/month. Oct booked 5k net. Nov/Dec expected renewals.
    const revArr = [...new Array(9).fill(20000), 15000, 0, 0];
    const expArr = [...new Array(9).fill(10000), 10000, 0, 0];
    const expectedCollectionArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30000, 30000];
    const financial = { revArr, expArr, staffArr: new Array(12).fill(0) };
    const operational = { overdueArr: new Array(12).fill(0), expectedCollectionArr };
    const averages = { operating: 0, staff: 11500 };
    const today = new Date(2026, 9, 7); // 07-Oct-2026 — inside Q4

    const monthly = dashboardApi.formatTimePeriods(
      financial, operational, 'Monthly',
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      2026, today, averages, null
    );
    const quarterly = dashboardApi.formatTimePeriods(
      financial, operational, 'Quarterly',
      ['Q1 (JFM)', 'Q2 (AMJ)', 'Q3 (JAS)', 'Q4 (OND)'],
      2026, today, averages, null
    );

    // Nov + Dec forecast only (Oct is current/elapsed): 18500 + 18500 = 37000
    expect(monthly.remainingForecastNet).toBe(37000);
    expect(quarterly.remainingForecastNet).toBe(monthly.remainingForecastNet);
    expect(quarterly.actualNet).toBe(monthly.actualNet);
    expect(quarterly.actualNet).toBe(95000);
    // Q4 chart point must still expose forecast uplift (not treat whole quarter as elapsed)
    expect(quarterly.transitionIndex).toBe(3);
    expect(quarterly.actualNetArr[3]).toBe(5000);
    expect(quarterly.expectedNetArr[3]).toBe(5000 + 37000);
  });

  test('counts unpaid renewals due later this month in Remaining, not only next months', () => {
    const dashboardApi = loadDashboardApi();
    // Recognized net through October = 83,000. Two renewals still due 10 Oct and 15 Oct.
    const revArr = [...new Array(9).fill(0), 83000, 0, 0];
    const expArr = new Array(12).fill(0);
    const expectedCollectionArr = new Array(12).fill(0);
    expectedCollectionArr[9] = 50000; // October, current month

    const metrics = dashboardApi.formatTimePeriods(
      { revArr, expArr, staffArr: new Array(12).fill(0) },
      { overdueArr: new Array(12).fill(0), expectedCollectionArr },
      'Monthly',
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      2026,
      new Date(2026, 9, 8), // 08-Oct-2026
      { operating: 0, staff: 0 },
      null
    );

    expect(metrics.actualNet).toBe(83000);
    expect(metrics.remainingForecastNet).toBe(50000);
    expect(metrics.projectedNet).toBe(133000);
    expect(metrics.actualNetArr[9]).toBe(83000);
    expect(metrics.expectedNetArr[9]).toBe(133000);
  });

  test('kpis.netInHand matches charts.prediction.actualNet for elapsed periods', () => {
    const dashboardApi = loadDashboardApi();
    const res = dashboardApi.api_getDashboardMetrics('2024', 'Monthly', ['Jan', 'Feb']);
    expect(res.success).toBe(true);
    expect(res.data.kpis.netInHand).toBe(res.data.charts.prediction.actualNet);
  });
});
