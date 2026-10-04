const fs = require('fs');
const path = require('path');
const { parseSafeDate } = require('../src/Utils_DB');

function loadCalendarApi(overrides) {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Calendar.js'), 'utf8');
  const opts = overrides || {};

  const mockGlobalDropdowns = () => ({
    success: true,
    data: {
      options: {
        membership: [
          { id: 'PLAN-1', name: 'Monthly', frequency: 'Monthly' },
          { id: 'PLAN-2', name: 'Quarterly', frequency: 'Quarterly' },
          { id: 'PLAN-T', name: 'Trial Week', frequency: 'Trial' },
          { id: 'PLAN-A', name: 'Ad-hoc Day', frequency: 'Ad-hoc' }
        ],
        paymentstatus: [{ id: 'Paid', name: 'Paid' }, { id: 'Pending', name: 'Pending' }],
        status: [
          { id: 'Active', name: 'Active' },
          { id: 'Inactive', name: 'In-Active' }
        ]
      }
    }
  });

  return new Function('DB', 'api_getGlobalDropdowns', 'parseSafeDate', 'isPaidPaymentStatus', 'requirePermission_', `
    ${source};
    return { api_getCalendarData };
  `)(
    {
      batchRead: () => ({
        MEMBERS: opts.members || [
          { memberId: 'MEM-1', fullName: 'Alice Johnson', membershipId: 'PLAN-1', joinDate: '2024-01-10', membershipAmount: '2500', status: 'Active', phone: '9876543210' },
          { memberId: 'MEM-2', fullName: 'Bob Smith', membershipId: 'PLAN-2', joinDate: '2024-06-01', membershipAmount: '7000', status: 'Active' },
          { memberId: 'MEM-3', fullName: 'Charlie Brown', membershipId: 'PLAN-1', joinDate: '2024-03-02', membershipAmount: '3500', status: 'Active' },
          { memberId: 'MEM-4', fullName: 'Dana White', membershipId: 'PLAN-1', joinDate: '2024-01-15', membershipAmount: '2800', status: 'Active' },
          { memberId: 'MEM-5', fullName: 'Inactive Person', membershipId: 'PLAN-1', joinDate: '2024-01-01', membershipAmount: '2000', status: 'Inactive' },
          { memberId: 'MEM-6', fullName: 'Trial User', membershipId: 'PLAN-T', joinDate: '2024-09-01', membershipAmount: '500', status: 'Active', exitDate: '2024-09-12' }
        ],
        PAYMENTS: opts.payments || [
          { memberId: 'MEM-1', paymentStatus: 'Paid', endDate: '2024-09-05', amount: 2500 },
          { memberId: 'MEM-2', paymentStatus: 'Paid', endDate: '2024-09-10', amount: 7000 },
          { memberId: 'MEM-3', paymentStatus: 'Paid', endDate: '2024-09-15', amount: 3500 },
          { memberId: 'MEM-4', paymentStatus: 'Paid', endDate: '2024-08-20', amount: 2800 },
          { memberId: 'MEM-5', paymentStatus: 'Paid', endDate: '2024-09-08', amount: 2000 }
        ]
      })
    },
    mockGlobalDropdowns,
    parseSafeDate,
    (status) => String(status || '').toLowerCase() === 'paid',
    () => ({ ok: true })
  );
}

describe('Calendar Module', () => {
  test('api_getCalendarData returns events and date buckets for the target month', () => {
    const calendarApi = loadCalendarApi();
    const response = calendarApi.api_getCalendarData(8, 2024);

    expect(response.success).toBe(true);
    expect(Array.isArray(response.data.events)).toBe(true);
    expect(response.data.events.length).toBeGreaterThan(0);
    expect(typeof response.data.dateBuckets).toBe('object');
    expect(Object.keys(response.data.dateBuckets).length).toBeGreaterThan(0);
    expect(response.data.events[0].name).toBeDefined();
    expect(response.data.events[0].daysLeft).toBeDefined();
    expect(response.data.stats.overdue).toBeDefined();
    expect(response.data.stats.due2).toBeDefined();
    expect(response.data.stats.due3To7).toBeDefined();
    expect(response.data.stats.thisMonth).toBeDefined();
  });

  test('renewal due uses payment endDate (not endDate + 1)', () => {
    const calendarApi = loadCalendarApi();
    const response = calendarApi.api_getCalendarData(8, 2024);
    const alice = response.data.events.find((e) => e.memberId === 'MEM-1');
    expect(alice).toBeDefined();
    expect(alice.dateKey).toBe('2024-09-05');
    expect(alice.type).toMatch(/renewal|overdue/);
  });

  test('includes overdue members and excludes inactive members', () => {
    const calendarApi = loadCalendarApi();
    const response = calendarApi.api_getCalendarData(8, 2024);

    expect(response.success).toBe(true);
    const overdueEntries = response.data.events.filter((member) => member.type === 'overdue' || member.daysLeft < 0);
    expect(overdueEntries.some((member) => member.memberId === 'MEM-4')).toBe(true);
    expect(response.data.events.some((member) => member.memberId === 'MEM-5')).toBe(false);
  });

  test('trial/ad-hoc members appear as exit events only', () => {
    const calendarApi = loadCalendarApi();
    const response = calendarApi.api_getCalendarData(8, 2024);
    const trial = response.data.events.filter((e) => e.memberId === 'MEM-6');
    expect(trial.length).toBe(1);
    expect(trial[0].type).toBe('exit');
    expect(trial[0].dateKey).toBe('2024-09-12');
  });

  test('CalendarModule initializes without throwing and renders month data from the API response', () => {
    const calendarHtml = fs.readFileSync(path.join(__dirname, '../src/Script_Calendar.html'), 'utf8');
    const match = calendarHtml.match(/var CalendarModule = ({[\s\S]*?\n  };)/);
    expect(match).not.toBeNull();

    const AppUtils = {
      formatCurrency: (value) => `₹${Number(value || 0)}`,
      populateYearSelect: jest.fn(),
      loadAvailableYears: jest.fn((cb) => cb && cb())
    };

    const mockEls = {};
    const getMockElement = (id) => {
      if (!mockEls[id]) {
        mockEls[id] = {
          id,
          innerHTML: '',
          innerText: '',
          value: '',
          classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
          addEventListener: jest.fn(),
          querySelectorAll: jest.fn(() => []),
          onclick: null,
          getAttribute: jest.fn()
        };
      }
      return mockEls[id];
    };

    global.document = {
      getElementById: jest.fn((id) => getMockElement(id)),
      querySelectorAll: jest.fn(() => [])
    };

    global.AppUtils = AppUtils;
    global.google = {
      script: {
        run: {
          withSuccessHandler: jest.fn(function (handler) {
            this._success = handler;
            return this;
          }),
          withFailureHandler: jest.fn(function (handler) {
            this._failure = handler;
            return this;
          }),
          api_getCalendarData: jest.fn(function () {
            const handler = this._success;
            if (handler) {
              handler({
                success: true,
                data: {
                  events: [
                    { memberId: 'MEM-1', name: 'Alice Johnson', plan: 'Monthly', amount: 2500, type: 'renewal', eventDate: new Date(2024, 8, 5).toISOString(), nextDueDate: new Date(2024, 8, 5).toISOString(), dueDateLabel: '05-Sep-2024', daysLeft: 3, statusText: 'Due in 3-7 days', statusKey: 'warning', badgeClass: 'text-amber-600 bg-amber-50 border-amber-200', dateKey: '2024-09-05', colorKey: 'renewal' },
                    { memberId: 'MEM-2', name: 'Bob Smith', plan: 'Quarterly', amount: 7000, type: 'renewal', eventDate: new Date(2024, 8, 10).toISOString(), nextDueDate: new Date(2024, 8, 10).toISOString(), dueDateLabel: '10-Sep-2024', daysLeft: 8, statusText: 'Renewal', statusKey: 'upcoming', badgeClass: 'text-slate-600 bg-slate-100 border-slate-200', dateKey: '2024-09-10', colorKey: 'renewal' }
                  ],
                  dateBuckets: {
                    '2024-09-05': [{ memberId: 'MEM-1', name: 'Alice Johnson', plan: 'Monthly', amount: 2500, type: 'renewal', eventDate: new Date(2024, 8, 5).toISOString(), dueDateLabel: '05-Sep-2024', daysLeft: 3, statusText: 'Due in 3-7 days', dateKey: '2024-09-05', colorKey: 'renewal' }],
                    '2024-09-10': [{ memberId: 'MEM-2', name: 'Bob Smith', plan: 'Quarterly', amount: 7000, type: 'renewal', eventDate: new Date(2024, 8, 10).toISOString(), dueDateLabel: '10-Sep-2024', daysLeft: 8, statusText: 'Renewal', dateKey: '2024-09-10', colorKey: 'renewal' }]
                  },
                  stats: { overdue: 0, due2: 0, due3To7: 1, thisMonth: 2, exits: 0 }
                }
              });
            }
          })
        }
      }
    };

    const createCalendarModule = new Function('AppUtils', `return ${match[1]};`);
    const CalendarModule = createCalendarModule(AppUtils);

    CalendarModule.today = new Date(2024, 8, 5);
    CalendarModule.currentDate = new Date(2024, 8, 1);
    CalendarModule.selectedDateKey = '2024-09-05';
    CalendarModule.lowercaseSearchTerm = '';
    CalendarModule.activeFilters = { renewal: true, overdue: true, exit: true };

    expect(() => CalendarModule.loadCalendarData()).not.toThrow();
    expect(Number(document.getElementById('cal-member-count').innerText)).toBe(2);
  });
});
