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
  const db = {
    batchRead: jest.fn(() => dbData),
    read: jest.fn((sheet) => dbData[sheet] || []),
    create: jest.fn(record => record),
    update: jest.fn((sheet, id, payload) => payload)
  };
  const trigger = {
    timeBased: jest.fn(() => trigger),
    everyDays: jest.fn(() => trigger),
    atHour: jest.fn(() => trigger),
    create: jest.fn()
  };
  const scriptApp = {
    getProjectTriggers: jest.fn(() => []),
    newTrigger: jest.fn(() => trigger),
    trigger
  };

  return new Function(
    'DB',
    'api_getGlobalDropdowns',
    'Session',
    'generateId',
    'parseSafeDate',
    'distributeDailyProration',
    'ScriptApp',
    `
      ${source};
      return { api_getMembers, api_getMemberPayments, api_saveMember, mergeMemberUpdatePayload_, setupMemberExitDateTrigger, db: DB, scriptApp: ScriptApp, trigger: ScriptApp.trigger };
    `
  )(
    db,
    () => dropdownResponse,
    { getActiveUser: () => ({ getEmail: () => 'admin@gym.com' }) },
    (prefix) => `${prefix}-TEST123`,
    (dStr) => new Date(dStr),
    (sDateStr, eDateStr, fallbackDateStr, totalAmt, accrualMode, onInterval) => {
      const start = new Date(sDateStr || fallbackDateStr);
      if (!isNaN(start)) {
        onInterval(start.getFullYear(), start.getMonth(), totalAmt);
      }
    },
    scriptApp
  );
}

describe('Members Module', () => {
  test('generateNextMemberId_ returns sequential LSC-MEM-N ids', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/Utils_DB.js'), 'utf8');
    const start = source.indexOf('function generateNextMemberId_');
    const end = source.indexOf('\nfunction api_uploadImageToDrive', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);
    const make = (rows) => new Function('DB', `${fnSource}; return generateNextMemberId_;`)({
      read: jest.fn(() => rows)
    });

    expect(make([])()).toBe('LSC-MEM-1');
    expect(make([{ memberId: 'LSC-MEM-1' }, { memberId: 'LSC-MEM-3' }])()).toBe('LSC-MEM-4');
    expect(make([{ memberId: 'MEM-7' }, { memberId: 'LSC-MEM-2' }])()).toBe('LSC-MEM-8');
  });

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

  test('api_getMembers sets No Due Date (N/A) for trial and ad-hoc even with paid coverage', () => {
    const membersApi = loadMembersApi({
      MEMBERS: [
        { memberId: 'MEM-T', fullName: 'Trial User', membershipId: 'PLAN-3', joinDate: '2026-09-28', phone: '9111111111', status: 'Active', exitDate: '2026-10-05' },
        { memberId: 'MEM-A', fullName: 'Adhoc User', membershipId: 'PLAN-ADHOC', joinDate: '2026-09-30', phone: '9222222222', status: 'Active', exitDate: '2026-10-02' }
      ],
      PAYMENTS: [
        { memberId: 'MEM-T', paymentStatus: 'Paid', endDate: '2026-10-05', amount: 500, paidDate: '2026-09-28' },
        { memberId: 'MEM-A', paymentStatus: 'Paid', endDate: '2026-10-02', amount: 300, paidDate: '2026-09-30' }
      ],
      SETTINGS: []
    }, {
      success: true,
      data: {
        options: {
          membership: [
            { id: 'PLAN-3', name: 'Trial', frequency: 'TRIAL' },
            { id: 'PLAN-ADHOC', name: 'Ad-hoc', frequency: 'Ad-hoc' },
            { id: 'PLAN-1', name: 'Monthly', frequency: 'MONTHLY' }
          ],
          paymentstatus: [
            { id: 'Paid', name: 'Paid' }
          ],
          status: [
            { id: 'Active', name: 'Active' },
            { id: 'Inactive', name: 'Inactive' }
          ]
        }
      }
    });

    const response = membersApi.api_getMembers();
    expect(response.success).toBe(true);
    const trial = response.data.find(m => m.memberId === 'MEM-T');
    const adhoc = response.data.find(m => m.memberId === 'MEM-A');
    expect(trial.dueDate).toBe('N/A');
    expect(adhoc.dueDate).toBe('N/A');
  });

  test('api_getMembers sets N/A for unpaid trial/ad-hoc (no join-date due)', () => {
    const membersApi = loadMembersApi({
      MEMBERS: [
        { memberId: 'MEM-T2', fullName: 'New Trial', membershipId: 'PLAN-3', joinDate: '2026-10-01', phone: '9333333333', status: 'Active' }
      ],
      PAYMENTS: [],
      SETTINGS: []
    }, {
      success: true,
      data: {
        options: {
          membership: [
            { id: 'PLAN-3', name: 'Trial Week', frequency: 'Trial' }
          ],
          paymentstatus: [{ id: 'Paid', name: 'Paid' }],
          status: [{ id: 'Active', name: 'Active' }]
        }
      }
    });

    const response = membersApi.api_getMembers();
    expect(response.success).toBe(true);
    expect(response.data[0].dueDate).toBe('N/A');
  });

  test('api_getMembers persists inactive status for expired ad-hoc and trial memberships', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'));
    try {
      const membersApi = loadMembersApi({
        MEMBERS: [
          { memberId: 'MEM-PAST-TRIAL', membershipId: 'PLAN-TRIAL', status: 'STATUS-ACTIVE', exitDate: '30-Sep-2026' },
          { memberId: 'MEM-TODAY-ADHOC', membershipId: 'PLAN-ADHOC', status: 'STATUS-ACTIVE', exitDate: '01-Oct-2026' },
          { memberId: 'MEM-FUTURE-TRIAL', membershipId: 'PLAN-TRIAL', status: 'STATUS-ACTIVE', exitDate: '02-Oct-2026' },
          { memberId: 'MEM-PAST-QUARTERLY', membershipId: 'PLAN-QUARTERLY', status: 'STATUS-ACTIVE', exitDate: '30-Sep-2026' }
        ],
        PAYMENTS: [],
        SETTINGS: []
      }, {
        success: true,
        data: {
          options: {
            membership: [
              { id: 'PLAN-TRIAL', name: 'Trial', frequency: 'Trial' },
              { id: 'PLAN-ADHOC', name: 'Ad Hoc', frequency: 'Ad Hoc' },
              { id: 'PLAN-QUARTERLY', name: 'Quarterly', frequency: 'Quarterly' }
            ],
            status: [
              { id: 'STATUS-ACTIVE', name: 'Active' },
              { id: 'STATUS-INACTIVE', name: 'Inactive' }
            ]
          }
        }
      });

      const response = membersApi.api_getMembers();

      expect(response.success).toBe(true);
      expect(response.data.map(member => member.status)).toEqual([
        'STATUS-INACTIVE',
        'STATUS-INACTIVE',
        'STATUS-ACTIVE',
        'STATUS-ACTIVE'
      ]);
      expect(membersApi.db.update).toHaveBeenCalledTimes(2);
      expect(membersApi.db.update).toHaveBeenNthCalledWith(1, 'MEMBERS', 'MEM-PAST-TRIAL', { status: 'STATUS-INACTIVE' });
      expect(membersApi.db.update).toHaveBeenNthCalledWith(2, 'MEMBERS', 'MEM-TODAY-ADHOC', { status: 'STATUS-INACTIVE' });
    } finally {
      jest.useRealTimers();
    }
  });

  test('api_getMembers heals legacy inactive labels to the dropdown key', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'));
    try {
      const membersApi = loadMembersApi({
        MEMBERS: [
          { memberId: 'MEM-LABEL', membershipId: 'PLAN-TRIAL', status: 'Inactive', exitDate: '02-Oct-2026' }
        ],
        PAYMENTS: [],
        SETTINGS: []
      }, {
        success: true,
        data: {
          options: {
            membership: [
              { id: 'PLAN-TRIAL', name: 'Trial', frequency: 'Trial' }
            ],
            status: [
              { id: 'STA-INACTIVE', name: 'In-Active' },
              { id: 'STA-ACTIVE', name: 'Active' }
            ]
          }
        }
      });

      const response = membersApi.api_getMembers();
      expect(response.success).toBe(true);
      expect(response.data[0].status).toBe('STA-INACTIVE');
      expect(membersApi.db.update).toHaveBeenCalledWith('MEMBERS', 'MEM-LABEL', { status: 'STA-INACTIVE' });
    } finally {
      jest.useRealTimers();
    }
  });

  test('api_saveMember rejects phone numbers that are not exactly 10 digits', () => {
    const membersApi = loadMembersApi();

    expect(membersApi.api_saveMember({ fullName: 'Dana Ross', phone: '123456789' })).toEqual({
      success: false,
      error: 'Error: Phone number must contain exactly 10 digits.'
    });
    expect(membersApi.db.create).not.toHaveBeenCalled();
    expect(membersApi.db.update).not.toHaveBeenCalled();
  });

  test('mergeMemberUpdatePayload_ keeps existing optional fields when incoming blanks them', () => {
    const membersApi = loadMembersApi();
    const existing = {
      memberId: 'MEM-1',
      fullName: 'Alice Johnson',
      phone: '9876543210',
      email: 'alice@example.com',
      dob: '01-Jan-1990',
      exitDate: '31-Dec-2026',
      profileImage: 'drive-file-1',
      membershipAmount: 4500,
      batchId: 'BATCH-1',
      status: 'Active',
      joinDate: '10-Jan-2024'
    };
    const merged = membersApi.mergeMemberUpdatePayload_(existing, {
      memberId: 'MEM-1',
      fullName: 'Alice Johnson',
      phone: '9876543210',
      email: '',
      dob: '',
      exitDate: '',
      profileImage: '',
      membershipAmount: 0,
      batchId: '',
      status: 'Active',
      joinDate: '10-Jan-2024'
    });
    expect(merged.email).toBe('alice@example.com');
    expect(merged.dob).toBe('01-Jan-1990');
    expect(merged.exitDate).toBe('31-Dec-2026');
    expect(merged.profileImage).toBe('drive-file-1');
    expect(merged.membershipAmount).toBe(4500);
    expect(merged.batchId).toBe('BATCH-1');
  });

  test('api_saveMember edit preserves blanked optionals and applies intentional changes', () => {
    const membersApi = loadMembersApi({
      MEMBERS: [
        {
          memberId: 'MEM-1',
          fullName: 'Alice Johnson',
          phone: '9876543210',
          email: 'alice@example.com',
          dob: '01-Jan-1990',
          exitDate: '31-Dec-2026',
          profileImage: 'drive-file-1',
          membershipAmount: 4500,
          batchId: 'BATCH-1',
          membershipId: 'PLAN-1',
          status: 'Active',
          joinDate: '10-Jan-2024',
          gender: 'Female'
        }
      ],
      PAYMENTS: [],
      SETTINGS: []
    });

    const result = membersApi.api_saveMember({
      memberId: 'MEM-1',
      fullName: 'Alice J.',
      phone: '9876543210',
      email: '',
      dob: '',
      exitDate: '',
      profileImage: '',
      membershipAmount: 0,
      batchId: '',
      membershipId: 'PLAN-2',
      status: 'Active',
      joinDate: '10-Jan-2024',
      gender: ''
    });

    expect(result.success).toBe(true);
    expect(membersApi.db.update).toHaveBeenCalled();
    const payload = membersApi.db.update.mock.calls[0][2];
    expect(payload.fullName).toBe('Alice J.');
    expect(payload.membershipId).toBe('PLAN-2');
    expect(payload.email).toBe('alice@example.com');
    expect(payload.dob).toBe('01-Jan-1990');
    expect(payload.exitDate).toBe('31-Dec-2026');
    expect(payload.profileImage).toBe('drive-file-1');
    expect(payload.membershipAmount).toBe(4500);
    expect(payload.batchId).toBe('BATCH-1');
    expect(payload.gender).toBe('Female');
  });

  test('api_saveMember create still allows optional blanks', () => {
    const membersApi = loadMembersApi({ MEMBERS: [], PAYMENTS: [], SETTINGS: [] });
    const result = membersApi.api_saveMember({
      fullName: 'New Member',
      phone: '9123456789',
      email: '',
      dob: '',
      membershipAmount: 0
    });
    expect(result.success).toBe(true);
    expect(membersApi.db.create).toHaveBeenCalled();
    const record = membersApi.db.create.mock.calls[0][1];
    expect(record.fullName).toBe('New Member');
    expect(record.email).toBe('');
    expect(record.phone).toBe('9123456789');
  });

  test('setupMemberExitDateTrigger creates a daily trigger once and remains idempotent', () => {
    const membersApi = loadMembersApi();

    expect(membersApi.setupMemberExitDateTrigger()).toEqual({
      success: true,
      message: 'Daily member exit-date check scheduled.'
    });
    expect(membersApi.scriptApp.newTrigger).toHaveBeenCalledWith('runDailyMemberExitDateCheck');
    expect(membersApi.trigger.timeBased).toHaveBeenCalledTimes(1);
    expect(membersApi.trigger.everyDays).toHaveBeenCalledWith(1);
    expect(membersApi.trigger.atHour).toHaveBeenCalledWith(1);
    expect(membersApi.trigger.create).toHaveBeenCalledTimes(1);

    membersApi.scriptApp.getProjectTriggers.mockReturnValue([
      { getHandlerFunction: () => 'runDailyMemberExitDateCheck' }
    ]);
    expect(membersApi.setupMemberExitDateTrigger()).toEqual({
      success: true,
      message: 'Daily member exit-date check is already scheduled.'
    });
    expect(membersApi.scriptApp.newTrigger).toHaveBeenCalledTimes(1);
  });

  describe('MembersApp Frontend Lazy Loading', () => {
    let MembersApp;
    let AppUtils;

    beforeAll(() => {
      const globalStateHtml = fs.readFileSync(path.join(__dirname, '../src/Global_State.html'), 'utf8');
      const appUtilsMatch = globalStateHtml.match(/const AppUtils = ({[\s\S]*?\n  };)/);
      AppUtils = new Function(`return ${appUtilsMatch[1]};`)();
      global.AppUtils = AppUtils;

      const membersHtml = fs.readFileSync(path.join(__dirname, '../src/Script_Members.html'), 'utf8');
      const membersAppMatch = membersHtml.match(/var MembersApp = ({[\s\S]*?\n  };)/);
      if (!membersAppMatch) throw new Error("Could not extract MembersApp from Script_Members.html");

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

      const createMembersApp = new Function('AppUtils', `return ${membersAppMatch[1]};`);
      MembersApp = createMembersApp(AppUtils);
      MembersApp.dropdowns = {
        membership: [{ id: 'PLAN-1', name: 'Quarterly', frequency: 'QUARTERLY' }],
        batch: [{ id: 'BATCH-1', name: 'Morning', groups: 'Adult' }],
        status: [{ id: 'Active', name: 'Active' }]
      };
    });

    it('should paginate filteredData in chunks of 50 and load remainder on loadMore', () => {
      jest.useFakeTimers();
      const records = [];
      for (let i = 1; i <= 140; i++) {
        records.push({
          memberId: 'MEM-' + i,
          fullName: 'Member ' + i,
          membershipId: 'PLAN-1',
          batchId: 'BATCH-1',
          joinDate: '2026-01-10',
          dueDate: '2026-04-10',
          status: 'Active',
          notes: ''
        });
      }
      MembersApp.filteredData = records;
      MembersApp.render();

      expect(MembersApp.pageSize).toBe(50);
      expect(MembersApp.renderedCount).toBe(50);

      MembersApp.loadMore();
      jest.advanceTimersByTime(200);

      expect(MembersApp.renderedCount).toBe(100);

      MembersApp.loadMore();
      jest.advanceTimersByTime(200);

      expect(MembersApp.renderedCount).toBe(140);
      jest.useRealTimers();
    });

    it('populates initial payment dropdowns and preserves selected batch filters', () => {
      const originalDropdowns = MembersApp.dropdowns;
      const batchFilter = document.getElementById('filter-batch');
      const planFilter = document.getElementById('filter-plan');
      batchFilter.value = 'BATCH-1';
      batchFilter.options = [{ value: 'All' }, { value: 'BATCH-1' }];
      planFilter.value = 'PLAN-1';
      planFilter.options = [{ value: 'All' }, { value: 'PLAN-1' }];

      MembersApp.onDropdownsLoaded({
        success: true,
        data: {
          options: {
            membership: [{ id: 'PLAN-1', name: 'Quarterly' }],
            batch: [{ id: 'BATCH-1', name: 'Morning', groups: 'Adult' }],
            status: [{ id: 'STATUS-ACTIVE', name: 'Active' }],
            paymentmode: [{ id: 'MODE-CASH', name: 'Cash' }],
            paymentstatus: [{ id: 'PAY-PAID', name: 'Paid' }]
          },
          schemas: {}
        }
      });

      expect(batchFilter.innerHTML).toContain('All Batches');
      expect(batchFilter.innerHTML).toContain('Morning');
      expect(batchFilter.value).toBe('BATCH-1');
      expect(planFilter.innerHTML).toContain('All Memberships');
      expect(planFilter.value).toBe('PLAN-1');
      expect(document.getElementById('mem-pay-cash')).toBeTruthy();
      expect(document.getElementById('mem-pay-upi')).toBeTruthy();
      expect(MembersApp.paidStatusId()).toBe('PAY-PAID');
      expect(MembersApp.activeStatusId()).toBe('STATUS-ACTIVE');

      const payFields = document.getElementById('mem-pay-fields');
      MembersApp.toggleInitialPaymentFields();
      expect(payFields.classList.toggle).toHaveBeenCalledWith('hidden', true);

      document.getElementById('mem-record-pay').checked = true;
      MembersApp.toggleInitialPaymentFields();
      expect(payFields.classList.toggle).toHaveBeenCalledWith('hidden', false);
      MembersApp.dropdowns = originalDropdowns;
    });

    it('recalculates trial member fees per day when plan or trial dates change', () => {
      const originalDropdowns = MembersApp.dropdowns;
      MembersApp.dropdowns = {
        membership: [
          { id: 'PLAN-QUARTERLY', name: 'Quarterly', frequency: 'Quarterly' },
          { id: 'PLAN-TRIAL', name: 'Trial', frequency: 'Trial' },
          { id: 'PLAN-ADHOC', name: 'Ad-hoc', frequency: 'Ad-hoc' }
        ],
        batch: [
          { id: 'BATCH-ADULT', name: 'Morning', groups: 'Adult' },
          { id: 'BATCH-KID', name: 'Kids', groups: 'Kid' }
        ],
        price: [
          { name: 'Quarterly', group: 'Adult', base_price: 30000 },
          { name: 'Quarterly', group: 'Kid', base_price: 25000 },
          { name: 'Trial', group: 'All Groups', base_price: 1000 }
        ],
        status: [{ id: 'STATUS-ACTIVE', name: 'Active' }]
      };
      document.getElementById('mem-batch').value = 'BATCH-ADULT';
      document.getElementById('mem-join').value = '01-Oct-2026';
      document.getElementById('mem-exit-date').value = '03-Oct-2026';

      document.getElementById('mem-plan').value = 'PLAN-QUARTERLY';
      MembersApp.onPlanOrBatchChange();
      expect(document.getElementById('mem-amount').value).toBe('30000');

      document.getElementById('mem-plan').value = 'PLAN-TRIAL';
      MembersApp.onPlanOrBatchChange();
      expect(document.getElementById('mem-amount').value).toBe('3000');
      expect(document.getElementById('mem-exit-container').classList.remove).toHaveBeenCalledWith('hidden');
      expect(document.getElementById('mem-exit-date').required).toBe(true);

      document.getElementById('mem-plan').value = 'PLAN-ADHOC';
      MembersApp.onPlanOrBatchChange();
      expect(document.getElementById('mem-exit-date').required).toBe(true);

      document.getElementById('mem-plan').value = 'PLAN-TRIAL';
      document.getElementById('mem-join').value = '01-Oct-2026';
      document.getElementById('mem-exit-date').value = '04-Oct-2026';
      MembersApp.onPlanOrBatchChange();
      expect(document.getElementById('mem-amount').value).toBe('4000');

      document.getElementById('mem-batch').value = 'BATCH-KID';
      MembersApp.onPlanOrBatchChange();
      expect(document.getElementById('mem-amount').value).toBe('4000');

      document.getElementById('mem-plan').value = 'PLAN-QUARTERLY';
      MembersApp.onPlanOrBatchChange();
      expect(document.getElementById('mem-amount').value).toBe('25000');
      MembersApp.dropdowns = originalDropdowns;
    });
  });
});
