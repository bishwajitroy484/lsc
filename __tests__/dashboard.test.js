const fs = require('fs');
const path = require('path');
const { parseSafeDate, distributeDailyProration } = require('../src/Utils_DB');

function loadDashboardApi() {
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
      return { api_getDashboardMetrics };
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
          { categoryId: 'CAT-2', amount: 1300, date: '2024-02-20' }
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
          { key: 'Revenue_Recognition', value: 'anchor' }
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
          expenseCats: [{ id: 'CAT-1', name: 'Rent' }, { id: 'CAT-2', name: 'Utilities' }]
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
});
