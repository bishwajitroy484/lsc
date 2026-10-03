const fs = require('fs');
const path = require('path');

function loadDueCalendarApi(overrides) {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_DueCalendar.js'), 'utf8');
  const opts = overrides || {};

  const createdEvents = [];
  const deletedIds = [];
  const memberUpdates = [];

  const mockEvent = {
    getId: () => 'evt-new-1',
    deleteEvent: jest.fn()
  };

  const calendarApp = {
    getDefaultCalendar: () => ({
      getName: () => 'Primary',
      getEventById: (id) => {
        if (String(id) === 'evt-old-1') {
          return {
            deleteEvent: () => { deletedIds.push(id); }
          };
        }
        return null;
      },
      createEvent: (title, start, end, options) => {
        createdEvents.push({ title, start, end, options });
        return mockEvent;
      }
    })
  };

  const members = opts.members || [
    {
      memberId: 'MEM-1',
      fullName: 'Priya Kapoor',
      phone: '98765',
      membershipId: 'PLN-Q',
      dueCalendarEventId: opts.previousEventId || ''
    }
  ];

  const payments = opts.payments || [
    {
      paymentId: 'PAY-1',
      memberId: 'MEM-1',
      paymentStatus: 'Paid',
      amount: 4500,
      endDate: '2026-12-31',
      paidDate: '2026-10-01'
    }
  ];

  const settingsRows = opts.settingsRows || [
    { key: 'ENABLE_CALENDAR_DUE_EVENTS', value: opts.enabled === false ? 'NO' : 'YES' },
    { key: 'CALENDAR_DUE_HOUR', value: '9' },
    { key: 'CALENDAR_DUE_DURATION_MIN', value: '30' },
    { key: 'GYM_NAME', value: 'Lakeside' }
  ];

  const spreadsheetApp = {
    openById: () => ({
      getSheetByName: () => ({
        getLastColumn: () => 5,
        getRange: () => ({
          getValues: () => [['memberId', 'fullName', 'phone', 'membershipId', 'dueCalendarEventId']],
          setValue: jest.fn()
        })
      })
    })
  };

  const api = new Function(
    'DB',
    'CalendarApp',
    'SpreadsheetApp',
    'SPREADSHEET_ID',
    'api_getGlobalDropdowns',
    'isPaidPaymentStatus',
    'parseSafeDate',
    'formatToDDMMMYYYY',
    'console',
    `
      ${source};
      return {
        isQuarterlyPlan_,
        resolveNextDueFromPayment_,
        getDueCalendarConfig_,
        syncMemberDueCalendarEvent_
      };
    `
  )(
    {
      read: (sheet) => {
        if (sheet === 'MEMBERS') return members;
        if (sheet === 'PAYMENTS') return payments;
        if (sheet === 'SETTINGS') return settingsRows;
        return [];
      },
      update: (sheet, id, payload) => {
        memberUpdates.push({ sheet, id, payload });
        return true;
      }
    },
    calendarApp,
    spreadsheetApp,
    'sheet-id',
    () => ({
      success: true,
      data: {
        options: {
          membership: [
            { id: 'PLN-Q', name: 'Adult Quarterly', frequency: 'Quarterly' },
            { id: 'PLN-T', name: 'Trial Week', frequency: 'Trial' },
            { id: 'PLN-M', name: 'Monthly', frequency: 'Monthly' }
          ],
          paymentstatus: [{ id: 'Paid', name: 'Paid' }]
        }
      }
    }),
    (status) => String(status || '').toLowerCase() === 'paid',
    (value) => {
      if (!value) return new Date(NaN);
      if (value instanceof Date) return new Date(value.getTime());
      return new Date(value);
    },
    (d) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return d.getDate() + '-' + months[d.getMonth()] + '-' + d.getFullYear();
    },
    console
  );

  return { api, createdEvents, deletedIds, memberUpdates };
}

describe('due calendar helpers', () => {
  test('isQuarterlyPlan_ accepts quarterly and rejects trial/monthly', () => {
    const { api } = loadDueCalendarApi();
    expect(api.isQuarterlyPlan_({ name: 'Adult', frequency: 'Quarterly' })).toBe(true);
    expect(api.isQuarterlyPlan_({ name: 'Quarterly Plan', frequency: '' })).toBe(true);
    expect(api.isQuarterlyPlan_({ name: 'Trial', frequency: 'Trial' })).toBe(false);
    expect(api.isQuarterlyPlan_({ name: 'Monthly', frequency: 'Monthly' })).toBe(false);
    expect(api.isQuarterlyPlan_({ name: 'Ad-hoc', frequency: 'Ad-hoc' })).toBe(false);
  });

  test('resolveNextDueFromPayment_ is endDate + 1 day', () => {
    const { api } = loadDueCalendarApi();
    const due = api.resolveNextDueFromPayment_({ endDate: '2026-12-31' });
    expect(due.getFullYear()).toBe(2027);
    expect(due.getMonth()).toBe(0);
    expect(due.getDate()).toBe(1);
  });

  test('sync clears leftover events when feature is disabled', () => {
    const { api, createdEvents, deletedIds, memberUpdates } = loadDueCalendarApi({
      enabled: false,
      previousEventId: 'evt-old-1'
    });
    const res = api.syncMemberDueCalendarEvent_('MEM-1');
    expect(res.synced).toBe(false);
    expect(res.reason).toBe('disabled');
    expect(createdEvents).toHaveLength(0);
    expect(deletedIds).toContain('evt-old-1');
    expect(memberUpdates.some(u => u.payload.dueCalendarEventId === '')).toBe(true);
  });

  test('sync deletes previous event and creates a timed replacement', () => {
    const { api, createdEvents, deletedIds, memberUpdates } = loadDueCalendarApi({
      enabled: true,
      previousEventId: 'evt-old-1'
    });
    const res = api.syncMemberDueCalendarEvent_('MEM-1');
    expect(res.synced).toBe(true);
    expect(deletedIds).toContain('evt-old-1');
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].title).toContain('Priya Kapoor');
    expect(createdEvents[0].title).toContain('MEM-1');
    const durationMs = createdEvents[0].end - createdEvents[0].start;
    expect(durationMs).toBe(30 * 60 * 1000);
    expect(createdEvents[0].start.getHours()).toBe(9);
    expect(memberUpdates.some(u => u.payload.dueCalendarEventId === 'evt-new-1')).toBe(true);
  });

  test('renewal cycle: second paid payment replaces prior due event with next quarter due', () => {
    const { api, createdEvents, deletedIds, memberUpdates } = loadDueCalendarApi({
      enabled: true,
      previousEventId: 'evt-old-1',
      payments: [
        {
          paymentId: 'PAY-Q1',
          memberId: 'MEM-1',
          paymentStatus: 'Paid',
          amount: 4500,
          endDate: '2026-09-30',
          paidDate: '2026-07-01'
        },
        {
          paymentId: 'PAY-Q2',
          memberId: 'MEM-1',
          paymentStatus: 'Paid',
          amount: 4500,
          endDate: '2026-12-31',
          paidDate: '2026-10-01'
        }
      ]
    });
    const res = api.syncMemberDueCalendarEvent_('MEM-1', {
      paymentId: 'PAY-Q2',
      memberId: 'MEM-1',
      paymentStatus: 'Paid',
      amount: 4500,
      endDate: '2026-12-31',
      paidDate: '2026-10-01'
    });
    expect(res.synced).toBe(true);
    expect(res.replaced).toBe('evt-old-1');
    expect(deletedIds).toContain('evt-old-1');
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].start.getFullYear()).toBe(2027);
    expect(createdEvents[0].start.getMonth()).toBe(0);
    expect(createdEvents[0].start.getDate()).toBe(1);
    expect(memberUpdates.some(u => u.payload.dueCalendarEventId === 'evt-new-1')).toBe(true);
  });

  test('paymentHint wins as latest paid when sheet still has older payment only', () => {
    const { api, createdEvents } = loadDueCalendarApi({
      enabled: true,
      previousEventId: '',
      payments: [
        {
          paymentId: 'PAY-OLD',
          memberId: 'MEM-1',
          paymentStatus: 'Paid',
          amount: 4500,
          endDate: '2026-06-30',
          paidDate: '2026-04-01'
        }
      ]
    });
    const res = api.syncMemberDueCalendarEvent_('MEM-1', {
      paymentId: 'PAY-NEW',
      memberId: 'MEM-1',
      paymentStatus: 'Paid',
      amount: 4500,
      endDate: '2026-12-16',
      paidDate: '2026-09-17'
    });
    expect(res.synced).toBe(true);
    expect(createdEvents[0].start.getFullYear()).toBe(2026);
    expect(createdEvents[0].start.getMonth()).toBe(11);
    expect(createdEvents[0].start.getDate()).toBe(17);
  });

  test('sync skips non-quarterly plans', () => {
    const { api, createdEvents } = loadDueCalendarApi({
      enabled: true,
      members: [{
        memberId: 'MEM-2',
        fullName: 'Trial User',
        membershipId: 'PLN-T',
        dueCalendarEventId: ''
      }]
    });
    const res = api.syncMemberDueCalendarEvent_('MEM-2');
    expect(res.synced).toBe(false);
    expect(res.reason).toBe('not-quarterly');
    expect(createdEvents).toHaveLength(0);
  });
});
