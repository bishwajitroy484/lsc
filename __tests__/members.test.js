const fs = require('fs');
const path = require('path');

function loadMembersApi(dbData = {
  MEMBERS: [
    { memberId: 'MEM-1', fullName: 'Alice Johnson', membershipId: 'PLAN-1', joinDate: '2024-01-10', phone: '9876543210', status: 'Active' },
    { memberId: 'MEM-2', fullName: 'Bob Smith', membershipId: 'PLAN-2', joinDate: '2024-02-15', phone: '9123456780', status: 'Active' },
    { memberId: 'MEM-3', fullName: 'Charlie Brown', membershipId: 'PLAN-3', joinDate: '2024-03-10', phone: '9988776655', status: 'Inactive' }
  ],
  PAYMENTS: [
    { memberId: 'MEM-1', paymentStatus: 'Paid', endDate: '2024-08-31', amount: 2500, paidDate: '2024-08-01' },
    { memberId: 'MEM-2', paymentStatus: 'Paid', endDate: '2024-09-30', amount: 6000, paidDate: '2024-09-01' }
  ],
  SETTINGS: [{ key: 'Revenue_Recognition', value: 'anchor' }]
}, dropdownResponse = {
  success: true,
  data: {
    options: {
      membership: [
        { id: 'PLAN-1', name: 'Monthly', frequency: 'MONTHLY' },
        { id: 'PLAN-2', name: 'Quarterly', frequency: 'QUARTERLY' },
        { id: 'PLAN-3', name: 'Trial', frequency: 'TRIAL' }
      ],
      paymentstatus: [
        { id: 'STATUS-PAID', name: 'Paid' },
        { id: 'STATUS-OVERDUE', name: 'Overdue' }
      ]
    }
  }
}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Members.js'), 'utf8');

  return new Function(
    'DB',
    'api_getGlobalDropdowns',
    'Session',
    'generateId',
    'parseSafeDate',
    'distributeDailyProration',
    `
      ${source};
      return { api_getMembers, api_getMemberPayments };
    `
  )(
    {
      batchRead: jest.fn(() => dbData)
    },
    () => dropdownResponse,
    { getActiveUser: () => ({ getEmail: () => 'admin@gym.com' }) },
    (prefix) => `${prefix}-TEST123`,
    (dStr) => new Date(dStr),
    (sDateStr, eDateStr, fallbackDateStr, totalAmt, accrualMode, onInterval) => {
      const start = new Date(sDateStr || fallbackDateStr);
      if (!isNaN(start)) {
        onInterval(start.getFullYear(), start.getMonth(), totalAmt);
      }
    }
  );
}

describe('Members Module', () => {
  test('api_getMembers returns enriched member records with dueDate and accrual mode', () => {
    const membersApi = loadMembersApi();
    const response = membersApi.api_getMembers();

    expect(response.success).toBe(true);
    expect(response.accrualMode).toBe('anchor');
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data.length).toBe(3);
    expect(response.data[0].dueDate).toBeTruthy();
    expect(response.data[0].memberId).toBe('MEM-1');
  });

  test('api_getMembers handles missing dropdown data without breaking member list generation', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/API_Members.js'), 'utf8');
    const membersApi = new Function(
      'DB',
      'api_getGlobalDropdowns',
      'Session',
      'generateId',
      'parseSafeDate',
      'distributeDailyProration',
      `
        ${source};
        return { api_getMembers };
      `
    )(
      {
        batchRead: jest.fn(() => ({
          MEMBERS: [
            { memberId: 'MEM-9', fullName: 'Dana Ross', membershipId: 'PLAN-2', joinDate: '2024-01-01', phone: '1234567890' }
          ],
          PAYMENTS: [],
          SETTINGS: []
        }))
      },
      () => ({ success: false, error: 'No options available' }),
      { getActiveUser: () => ({ getEmail: () => 'admin@gym.com' }) },
      (prefix) => `${prefix}-TEST123`,
      (dStr) => new Date(dStr),
      (sDateStr, eDateStr, fallbackDateStr, totalAmt, accrualMode, onInterval) => {
        const start = new Date(sDateStr || fallbackDateStr);
        if (!isNaN(start)) onInterval(start.getFullYear(), start.getMonth(), totalAmt);
      }
    );

    const response = membersApi.api_getMembers();
    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data[0].fullName).toBe('Dana Ross');
  });

  test('api_getMemberPayments excludes dropdown-ID overdue payments from earned insight metrics', () => {
    const membersApi = loadMembersApi({
      MEMBERS: [],
      PAYMENTS: [
        { memberId: 'MEM-1', paymentStatus: 'STATUS-PAID', startDate: '2026-06-01', endDate: '2026-06-30', paidDate: '2026-06-01', amount: 30000 },
        { memberId: 'MEM-1', paymentStatus: 'STATUS-OVERDUE', startDate: '2026-09-01', endDate: '2026-09-30', paidDate: '2026-09-01', amount: 30000 }
      ],
      SETTINGS: [{ key: 'Revenue_Recognition', value: 'anchor' }]
    });

    const response = membersApi.api_getMemberPayments('MEM-1');

    expect(response.success).toBe(true);
    expect(response.data).toHaveLength(2);
    expect(response.chartMetrics[2026].totalEarned).toBe(30000);
    expect(response.chartMetrics[2026].monthly[5]).toBe(30000);
    expect(response.chartMetrics[2026].monthly[8]).toBe(0);
  });

  test('api_getMembers does not treat a dropdown-ID overdue payment as paid coverage', () => {
    const membersApi = loadMembersApi({
      MEMBERS: [
        { memberId: 'MEM-1', fullName: 'Alice Johnson', membershipId: 'PLAN-1', joinDate: '2024-01-10', phone: '9876543210', status: 'Active' }
      ],
      PAYMENTS: [
        { memberId: 'MEM-1', paymentStatus: 'STATUS-OVERDUE', endDate: '2024-08-31', amount: 2500, paidDate: '2024-08-01' }
      ],
      SETTINGS: []
    });

    const response = membersApi.api_getMembers();

    expect(response.success).toBe(true);
    expect(response.data[0].dueDate).toBe('10-Jan-2024');
  });
});
