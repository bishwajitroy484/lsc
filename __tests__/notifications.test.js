const fs = require('fs');
const path = require('path');

function loadNotificationsApi() {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Notifications.js'), 'utf8');
  const parseSafeDate = (value) => {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return new Date(value.getTime());
    const raw = String(value).trim();
    const iso = Date.parse(raw);
    if (!Number.isNaN(iso)) return new Date(iso);
    const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!m) return new Date(NaN);
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    return new Date(Number(m[3]), months[m[2]], Number(m[1]));
  };

  const mailApp = { sendEmail: jest.fn() };
  const api = new Function(
    'parseSafeDate',
    'isPaidPaymentStatus',
    'DB',
    'MailApp',
    'ScriptApp',
    'api_getGlobalDropdowns',
    'requirePermission_',
    'console',
    `
      ${source};
      return {
        classifyMembersForReport_,
        buildPaymentReceiptEmail_,
        getNotificationConfig_,
        api_sendTestNotificationEmail,
        api_previewNotificationEmail,
        _mailApp: MailApp
      };
    `
  )(
    parseSafeDate,
    () => true,
    {
      read: () => ([
        { key: 'GYM_NAME', value: 'Lakeside' },
        { key: 'OWNER_EMAIL', value: 'owner@gym.com' },
        { key: 'OWNER_NAME', value: 'Owner' },
        { key: 'ENABLE_NOTIFICATION', value: 'YES' }
      ]),
      batchRead: () => ({})
    },
    mailApp,
    {
      WeekDay: { SUNDAY: 'SUNDAY', MONDAY: 'MONDAY' },
      getProjectTriggers: () => [],
      newTrigger: () => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ nearMinute: () => ({ create: () => {} }) }) }) }) }),
      deleteTrigger: jest.fn()
    },
    () => ({ success: true, data: { options: {} } }),
    () => ({ ok: true, context: { email: 'admin@gym.com', allowed: true } }),
    console
  );

  api._mailApp = mailApp;
  return api;
}

describe('notification report helpers', () => {
  test('classifies upcoming and overdue members for the next 7 days', () => {
    const api = loadNotificationsApi();
    const asOf = new Date(2026, 9, 1); // 1 Oct 2026
    const members = [
      { memberId: 'M1', fullName: 'Upcoming', phone: '111', status: 'Active', dueDate: '2026-10-05' },
      { memberId: 'M2', fullName: 'Overdue', phone: '222', status: 'Active', dueDate: '2026-09-20' },
      { memberId: 'M3', fullName: 'Later', phone: '333', status: 'Active', dueDate: '2026-10-20' },
      { memberId: 'M4', fullName: 'Inactive', phone: '444', status: 'Inactive', dueDate: '2026-10-03' }
    ];
    const payments = [];
    const report = api.classifyMembersForReport_(members, payments, [], asOf);

    expect(report.upcoming.map(r => r.memberId)).toEqual(['M1']);
    expect(report.overdue.map(r => r.memberId)).toEqual(['M2']);
  });

  test('builds a payment receipt with coverage details', () => {
    const api = loadNotificationsApi();
    const mail = api.buildPaymentReceiptEmail_(
      { fullName: 'Bishwajit Roy', memberId: 'MEM1' },
      { amount: 4500, paidDate: '2026-10-01', startDate: '2026-10-01', endDate: '2026-12-31' },
      { gymName: 'Lakeside' },
      'Quarterly'
    );
    expect(mail.subject).toContain('Payment confirmation');
    expect(mail.htmlBody).toContain('Bishwajit Roy');
    expect(mail.htmlBody).toContain('Quarterly');
    expect(mail.htmlBody).toContain('Lakeside');
  });

  test('api_sendTestNotificationEmail sends sample receipt to signed-in admin', () => {
    const api = loadNotificationsApi();
    const res = api.api_sendTestNotificationEmail('receipt', {});
    expect(res.success).toBe(true);
    expect(res.data.to).toBe('admin@gym.com');
    expect(res.data.subject).toMatch(/^\[TEST\]/);
    expect(api._mailApp.sendEmail).toHaveBeenCalledTimes(1);
    const payload = api._mailApp.sendEmail.mock.calls[0][0];
    expect(payload.to).toBe('admin@gym.com');
    expect(payload.htmlBody).toContain('This is a test email');
    expect(payload.cc).toBeUndefined();
  });

  test('api_sendTestNotificationEmail sends sample weekly report to signed-in admin', () => {
    const api = loadNotificationsApi();
    const res = api.api_sendTestNotificationEmail('weekly', {
      weeklyCc: 'manager@gym.com',
      reportDays: '7'
    });
    expect(res.success).toBe(true);
    expect(res.data.type).toBe('weekly');
    expect(res.data.to).toBe('admin@gym.com');
    const payload = api._mailApp.sendEmail.mock.calls[0][0];
    expect(payload.to).toBe('admin@gym.com');
    expect(payload.subject).toContain('[TEST]');
    expect(payload.cc).toBeUndefined();
  });

  test('api_sendTestNotificationEmail sends a sample overdue WhatsApp message to the signed-in admin', () => {
    const api = loadNotificationsApi();
    const res = api.api_sendTestNotificationEmail('waOverdue', {
      gymName: 'LSC',
      waOverdueBody: 'Hi {{name}}, {{amount}} was due on {{dueDate}}.'
    });
    expect(res.success).toBe(true);
    expect(res.data.type).toBe('waoverdue');
    expect(res.data.to).toBe('admin@gym.com');
    const payload = api._mailApp.sendEmail.mock.calls[0][0];
    expect(payload.subject).toContain('[TEST] Overdue WhatsApp');
    expect(payload.htmlBody).toContain('Supreet Kaur');
    expect(payload.htmlBody).toContain('10-Oct-2026');
    expect(payload.htmlBody).toContain('This is a test email');
  });
});
