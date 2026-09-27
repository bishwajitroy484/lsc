const fs = require('fs');
const path = require('path');
const { parseSafeDate } = require('../src/Utils_DB');

function loadCalendarApi() {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Calendar.js'), 'utf8');
  const mockGlobalDropdowns = () => ({
    success: true,
    data: {
      options: {
        membership: [
          { id: 'PLAN-1', name: 'Monthly' },
          { id: 'PLAN-2', name: 'Quarterly' }
        ]
      }
    }
  });

  return new Function('DB', 'api_getGlobalDropdowns', 'parseSafeDate', `
    ${source};
    return { api_getCalendarData };
  `)(
    {
      batchRead: () => ({
        MEMBERS: [
          { memberId: 'MEM-1', fullName: 'Alice Johnson', membershipId: 'PLAN-1', joinDate: '2024-01-10', membershipAmount: '2500' },
          { memberId: 'MEM-2', fullName: 'Bob Smith', membershipId: 'PLAN-2', joinDate: '2024-06-01', membershipAmount: '7000' },
          { memberId: 'MEM-3', fullName: 'Charlie Brown', membershipId: 'PLAN-1', joinDate: '2024-03-02', membershipAmount: '3500' }
        ],
        PAYMENTS: [
          { memberId: 'MEM-1', paymentStatus: 'Paid', endDate: '2024-09-05', amount: 2500 },
          { memberId: 'MEM-2', paymentStatus: 'Paid', endDate: '2024-09-10', amount: 7000 },
          { memberId: 'MEM-3', paymentStatus: 'Paid', endDate: '2024-09-15', amount: 3500 }
        ]
      })
    },
    mockGlobalDropdowns,
    parseSafeDate
  );
}

describe('Calendar Module', () => {
  test('api_getCalendarData returns grouped month member data and due buckets for the target month', () => {
    const calendarApi = loadCalendarApi();
    const response = calendarApi.api_getCalendarData(8, 2024);

    expect(response.success).toBe(true);
    expect(Array.isArray(response.data.monthMembers)).toBe(true);
    expect(response.data.monthMembers.length).toBeGreaterThan(0);
    expect(typeof response.data.dateBuckets).toBe('object');
    expect(Object.keys(response.data.dateBuckets).length).toBeGreaterThan(0);
    expect(response.data.monthMembers[0].name).toBeDefined();
    expect(response.data.monthMembers[0].daysLeft).toBeDefined();
  });

  test('CalendarModule initializes without throwing and renders month data from the API response', () => {
    const calendarHtml = fs.readFileSync(path.join(__dirname, '../src/Script_Calendar.html'), 'utf8');
    const match = calendarHtml.match(/var CalendarModule = ({[\s\S]*?\n  };)/);
    expect(match).not.toBeNull();

    const AppUtils = {
      formatCurrency: (value) => `₹${Number(value || 0)}`
    };

    const mockEls = {};
    const getMockElement = (id) => {
      if (!mockEls[id]) {
        mockEls[id] = {
          id,
          innerHTML: '',
          innerText: '',
          value: '',
          classList: { add: jest.fn(), remove: jest.fn() },
          addEventListener: jest.fn(),
          querySelectorAll: jest.fn(() => []),
          onclick: null
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
          api_getCalendarData: jest.fn(function (month, year) {
            const handler = this._success; 
            if (handler) {
              handler({
                success: true,
                data: {
                  monthMembers: [
                    { memberId: 'MEM-1', name: 'Alice Johnson', plan: 'Monthly', amount: 2500, nextDueDate: new Date(2024, 8, 5), dueDateLabel: '05-Sep-2024', daysLeft: 3, statusText: 'Due in 3-5 days', statusKey: 'warning' },
                    { memberId: 'MEM-2', name: 'Bob Smith', plan: 'Quarterly', amount: 7000, nextDueDate: new Date(2024, 8, 10), dueDateLabel: '10-Sep-2024', daysLeft: 8, statusText: 'Due in 6-10 days', statusKey: 'soon' }
                  ],
                  dateBuckets: {
                    '2024-09-05': [{ memberId: 'MEM-1', name: 'Alice Johnson', plan: 'Monthly', amount: 2500, nextDueDate: new Date(2024, 8, 5), dueDateLabel: '05-Sep-2024', daysLeft: 3, statusText: 'Due in 3-5 days', statusKey: 'warning' }],
                    '2024-09-10': [{ memberId: 'MEM-2', name: 'Bob Smith', plan: 'Quarterly', amount: 7000, nextDueDate: new Date(2024, 8, 10), dueDateLabel: '10-Sep-2024', daysLeft: 8, statusText: 'Due in 6-10 days', statusKey: 'soon' }]
                  }
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
    CalendarModule.selectedDate = 5;
    CalendarModule.lowercaseSearchTerm = '';

    expect(() => CalendarModule.loadCalendarData()).not.toThrow();
    expect(Number(document.getElementById('cal-member-count').innerText)).toBe(2);
  });
});
