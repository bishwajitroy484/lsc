/**
 * Email notification helpers:
 * 1) Payment receipt to member after a paid payment is recorded
 * 2) Weekly admin report of upcoming and overdue renewals
 */

var DEFAULT_NOTIFY_RECEIPT_SUBJECT = '{{gymName}} — Payment confirmation';
var DEFAULT_NOTIFY_RECEIPT_BODY =
  'Hi {{memberName}},\n\n' +
  'Thank you for your payment at {{gymName}}. Your membership has been updated successfully.\n\n' +
  'Plan: {{plan}}\n' +
  'Amount paid: {{amount}}\n' +
  'Payment date: {{paidDate}}\n' +
  'Coverage period: {{startDate}} to {{endDate}}\n' +
  'Member ID: {{memberId}}\n\n' +
  'If you have any questions, please reply to this email or contact the front desk.\n\n' +
  'Warm regards,\n' +
  '{{gymName}} Team';

var DEFAULT_NOTIFY_WEEKLY_SUBJECT = '{{gymName}} — Weekly renewal report ({{rangeLabel}})';
var DEFAULT_NOTIFY_WEEKLY_INTRO =
  'Hi {{ownerName}},\n\n' +
  'Here is your weekly renewal snapshot for {{gymName}} covering {{rangeLabel}}.\n\n' +
  '• Upcoming renewals (next {{reportDays}} days): {{upcomingCount}}\n' +
  '• Already overdue: {{overdueCount}}\n\n' +
  'Member details are listed in the tables below so you can follow up promptly.';

var DEFAULT_NOTIFY_WEEKLY_FIELDS = {
  name: true,
  phone: true,
  email: false,
  due: true,
  days: true,
  memberId: true
};

function readSettingsMap_() {
  const rows = DB.read('SETTINGS') || [];
  const map = {};
  rows.forEach(row => {
    const key = String(row.key || row.Key || row.setting || row.Setting || '').trim().toUpperCase();
    if (!key) return;
    map[key] = String(row.value !== undefined ? row.value : (row.Value || '')).trim();
  });
  return map;
}

function isSettingEnabled_(value) {
  const v = String(value || '').trim().toUpperCase();
  return v === 'YES' || v === 'Y' || v === 'TRUE' || v === '1' || v === 'ENABLED';
}

function parseWeeklyFields_(raw) {
  const defaults = Object.assign({}, DEFAULT_NOTIFY_WEEKLY_FIELDS);
  if (!raw) return defaults;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return defaults;
    return {
      name: parsed.name !== false,
      phone: parsed.phone !== false,
      email: parsed.email === true,
      due: parsed.due !== false,
      days: parsed.days !== false,
      memberId: parsed.memberId !== false
    };
  } catch (error) {
    return defaults;
  }
}

function normalizeEmailList_(raw) {
  return String(raw || '')
    .split(/[;,]+/)
    .map(function(part) { return part.trim(); })
    .filter(function(part) { return part && part.indexOf('@') > 0; })
    .join(', ');
}

function getNotificationConfig_(settingsMap) {
  const settings = settingsMap || readSettingsMap_();
  const reportDays = Math.min(30, Math.max(1, parseInt(settings.NOTIFY_REPORT_DAYS || '7', 10) || 7));
  const ownerName = String(settings.OWNER_NAME || '').trim();
  return {
    masterEnabled: isSettingEnabled_(settings.ENABLE_NOTIFICATION || settings.NOTIFICATION_ENABLED),
    paymentReceiptEnabled: isSettingEnabled_(
      settings.NOTIFY_PAYMENT_RECEIPT !== undefined && settings.NOTIFY_PAYMENT_RECEIPT !== ''
        ? settings.NOTIFY_PAYMENT_RECEIPT
        : 'YES'
    ),
    weeklyReportEnabled: isSettingEnabled_(
      settings.NOTIFY_WEEKLY_REPORT !== undefined && settings.NOTIFY_WEEKLY_REPORT !== ''
        ? settings.NOTIFY_WEEKLY_REPORT
        : 'YES'
    ),
    reportDay: String(settings.NOTIFY_REPORT_DAY || 'Monday').trim(),
    reportHour: Math.min(23, Math.max(0, parseInt(settings.NOTIFY_REPORT_HOUR || '8', 10) || 8)),
    reportDays: reportDays,
    ownerEmail: String(settings.OWNER_EMAIL || '').trim(),
    ownerName: ownerName || 'there',
    weeklyCc: normalizeEmailList_(settings.NOTIFY_WEEKLY_CC),
    gymName: String(settings.GYM_NAME || 'LSC').trim() || 'LSC',
    receiptSubject: String(settings.NOTIFY_RECEIPT_SUBJECT || DEFAULT_NOTIFY_RECEIPT_SUBJECT),
    receiptBody: String(settings.NOTIFY_RECEIPT_BODY || DEFAULT_NOTIFY_RECEIPT_BODY),
    weeklySubject: String(settings.NOTIFY_WEEKLY_SUBJECT || DEFAULT_NOTIFY_WEEKLY_SUBJECT),
    weeklyIntro: String(settings.NOTIFY_WEEKLY_INTRO || DEFAULT_NOTIFY_WEEKLY_INTRO),
    weeklyFields: parseWeeklyFields_(settings.NOTIFY_WEEKLY_FIELDS)
  };
}

function applyTemplate_(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, function(match, key) {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
  });
}

function escapeHtmlEmail_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtmlParagraphs_(text) {
  const escaped = escapeHtmlEmail_(text).replace(/\r\n/g, '\n');
  return escaped
    .split('\n')
    .map(function(line) {
      return line
        ? '<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:#334155">' + line + '</p>'
        : '<p style="margin:0 0 10px">&nbsp;</p>';
    })
    .join('');
}

function wrapEmailHtml_(title, innerHtml) {
  return (
    '<div style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px">' +
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">' +
    '<div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:18px 22px">' +
    '<div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.2px">' +
    escapeHtmlEmail_(title) +
    '</div></div>' +
    '<div style="padding:22px">' + innerHtml + '</div>' +
    '<div style="padding:14px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">' +
    'Sent automatically by LSC Gym Management</div></div></div>'
  );
}

function formatMoneyForEmail_(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount || '0');
  try {
    return '₹' + Math.round(n).toLocaleString('en-IN');
  } catch (error) {
    return '₹' + String(Math.round(n));
  }
}

function formatDateForEmail_(value) {
  const d = typeof parseSafeDate === 'function' ? parseSafeDate(value) : new Date(value);
  if (!d || isNaN(d.getTime())) return String(value || '--');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return d.getDate() + '-' + months[d.getMonth()] + '-' + d.getFullYear();
}

function resolveDropdownName_(options, id) {
  if (!id) return '';
  const match = (options || []).find(item => String(item.id) === String(id));
  return match ? String(match.name || match.label || match.id) : String(id);
}

function buildPaymentReceiptEmail_(member, payment, config, planName) {
  const vars = {
    gymName: config.gymName,
    memberName: String(member.fullName || 'Member').trim(),
    plan: planName || 'membership',
    amount: formatMoneyForEmail_(payment.amount),
    paidDate: formatDateForEmail_(payment.paidDate || payment.date),
    startDate: formatDateForEmail_(payment.startDate),
    endDate: formatDateForEmail_(payment.endDate),
    memberId: String(member.memberId || '')
  };
  const subject = applyTemplate_(config.receiptSubject || DEFAULT_NOTIFY_RECEIPT_SUBJECT, vars);
  const bodyText = applyTemplate_(config.receiptBody || DEFAULT_NOTIFY_RECEIPT_BODY, vars);
  const htmlBody = wrapEmailHtml_('Payment received', textToHtmlParagraphs_(bodyText));
  return { subject: subject, htmlBody: htmlBody, textBody: bodyText };
}

function maybeSendPaymentReceipt_(paymentData) {
  try {
    const config = getNotificationConfig_();
    if (!config.masterEnabled || !config.paymentReceiptEnabled) return { sent: false, reason: 'disabled' };
    if (!paymentData || !paymentData.memberId) return { sent: false, reason: 'missing-payment' };

    const globalData = api_getGlobalDropdowns && api_getGlobalDropdowns();
    const options = (globalData && globalData.success && globalData.data && globalData.data.options)
      ? globalData.data.options
      : {};
    const paymentStatuses = options.paymentstatus || options.status || [];
    if (!isPaidPaymentStatus(paymentData.paymentStatus, paymentStatuses)) {
      return { sent: false, reason: 'not-paid' };
    }

    const members = DB.read('MEMBERS') || [];
    const member = members.find(m => String(m.memberId) === String(paymentData.memberId));
    if (!member) return { sent: false, reason: 'member-missing' };

    const email = String(member.email || '').trim();
    if (!email || email.indexOf('@') < 0) return { sent: false, reason: 'no-email' };

    const planName = resolveDropdownName_(options.membership || [], member.membershipId || paymentData.membershipId);
    const mail = buildPaymentReceiptEmail_(member, paymentData, config, planName);
    MailApp.sendEmail({
      to: email,
      subject: mail.subject,
      htmlBody: mail.htmlBody
    });
    return { sent: true };
  } catch (error) {
    console.error('Payment receipt email failed: ' + (error && error.message ? error.message : error));
    return { sent: false, reason: 'error', error: String(error) };
  }
}

function startOfDay_(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeMemberDueDate_(member, payments, paymentStatuses) {
  const memberPayments = (payments || [])
    .filter(p => String(p.memberId) === String(member.memberId))
    .filter(p => isPaidPaymentStatus(p.paymentStatus, paymentStatuses))
    .sort((a, b) => {
      const aDate = parseSafeDate(a.endDate || a.paidDate || 0);
      const bDate = parseSafeDate(b.endDate || b.paidDate || 0);
      return bDate - aDate;
    });

  if (memberPayments.length) {
    const latest = memberPayments[0];
    const end = parseSafeDate(latest.endDate);
    if (!isNaN(end.getTime())) return startOfDay_(end);
  }

  const fallback = parseSafeDate(member.dueDate || member.exitDate || member.joinDate);
  return isNaN(fallback.getTime()) ? null : startOfDay_(fallback);
}

function classifyMembersForReport_(members, payments, paymentStatuses, asOfDate, reportDays) {
  const today = startOfDay_(asOfDate || new Date());
  const days = Math.min(30, Math.max(1, parseInt(reportDays, 10) || 7));
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);

  const upcoming = [];
  const overdue = [];

  (members || []).forEach(member => {
    const statusName = String(member.status || '').trim().toLowerCase();
    if (statusName === 'inactive' || statusName === 'left' || statusName.indexOf('inactive') >= 0) return;

    const dueDate = computeMemberDueDate_(member, payments, paymentStatuses);
    if (!dueDate) return;

    const row = {
      memberId: member.memberId,
      fullName: member.fullName || '--',
      phone: member.phone || '--',
      email: member.email || '',
      dueDate: dueDate,
      dueLabel: formatDateForEmail_(dueDate),
      daysUntil: Math.round((dueDate - today) / 86400000)
    };

    if (dueDate < today) overdue.push(row);
    else if (dueDate <= horizon) upcoming.push(row);
  });

  upcoming.sort((a, b) => a.dueDate - b.dueDate);
  overdue.sort((a, b) => a.dueDate - b.dueDate);
  return { upcoming: upcoming, overdue: overdue, today: today, horizon: horizon, reportDays: days };
}

function buildWeeklyTableHtml_(rows, fields, emptyText) {
  if (!rows.length) {
    return '<p style="margin:8px 0 0;color:#64748b;font-size:13px">' + escapeHtmlEmail_(emptyText) + '</p>';
  }

  const columns = [];
  if (fields.name) columns.push({ key: 'fullName', label: 'Member' });
  if (fields.memberId) columns.push({ key: 'memberId', label: 'ID' });
  if (fields.phone) columns.push({ key: 'phone', label: 'Phone' });
  if (fields.email) columns.push({ key: 'email', label: 'Email' });
  if (fields.due) columns.push({ key: 'dueLabel', label: 'Due date' });
  if (fields.days) columns.push({ key: 'daysUntil', label: 'Days' });
  if (!columns.length) columns.push({ key: 'fullName', label: 'Member' });

  let html =
    '<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:10px">' +
    '<tr style="background:#f8fafc">';
  columns.forEach(function(col) {
    html +=
      '<th align="left" style="padding:10px 12px;border:1px solid #e2e8f0;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.03em">' +
      escapeHtmlEmail_(col.label) +
      '</th>';
  });
  html += '</tr>';

  rows.forEach(function(row) {
    html += '<tr>';
    columns.forEach(function(col) {
      let value = row[col.key] !== undefined && row[col.key] !== '' ? row[col.key] : '--';
      if (col.key === 'daysUntil' && Number.isFinite(Number(value))) {
        const n = Number(value);
        value = n < 0 ? Math.abs(n) + ' overdue' : n === 0 ? 'Today' : 'In ' + n + 'd';
      }
      html +=
        '<td style="padding:10px 12px;border:1px solid #e2e8f0;color:#0f172a">' +
        escapeHtmlEmail_(value) +
        '</td>';
    });
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildSampleWeeklyReport_(reportDays) {
  const days = Math.min(30, Math.max(1, parseInt(reportDays, 10) || 7));
  const today = startOfDay_(new Date());
  const horizon = startOfDay_(new Date(Date.now() + days * 86400000));
  return {
    upcoming: [
      {
        memberId: 'MEM-1042',
        fullName: 'Ananya Sharma',
        phone: '98765 43210',
        email: 'ananya.sharma@email.com',
        dueLabel: formatDateForEmail_(new Date(Date.now() + 2 * 86400000)),
        daysUntil: 2
      },
      {
        memberId: 'MEM-1088',
        fullName: 'Vikram Patel',
        phone: '98123 45670',
        email: 'vikram.p@email.com',
        dueLabel: formatDateForEmail_(new Date(Date.now() + 5 * 86400000)),
        daysUntil: 5
      }
    ],
    overdue: [
      {
        memberId: 'MEM-0971',
        fullName: 'Neha Reddy',
        phone: '99001 12233',
        email: 'neha.reddy@email.com',
        dueLabel: formatDateForEmail_(new Date(Date.now() - 3 * 86400000)),
        daysUntil: -3
      },
      {
        memberId: 'MEM-0855',
        fullName: 'Arjun Mehta',
        phone: '91234 56780',
        email: 'arjun.m@email.com',
        dueLabel: formatDateForEmail_(new Date(Date.now() - 8 * 86400000)),
        daysUntil: -8
      }
    ],
    today: today,
    horizon: horizon,
    reportDays: days
  };
}

function buildWeeklyReportEmail_(config, report) {
  const rangeLabel = formatDateForEmail_(report.today) + ' → ' + formatDateForEmail_(report.horizon);
  const vars = {
    gymName: config.gymName,
    ownerName: config.ownerName || 'there',
    rangeLabel: rangeLabel,
    reportDays: report.reportDays || config.reportDays || 7,
    upcomingCount: report.upcoming.length,
    overdueCount: report.overdue.length
  };
  const subject = applyTemplate_(config.weeklySubject || DEFAULT_NOTIFY_WEEKLY_SUBJECT, vars);
  const introText = applyTemplate_(config.weeklyIntro || DEFAULT_NOTIFY_WEEKLY_INTRO, vars);
  const fields = config.weeklyFields || DEFAULT_NOTIFY_WEEKLY_FIELDS;

  const inner =
    textToHtmlParagraphs_(introText) +
    '<div style="margin-top:18px;padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px">' +
    '<div style="font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Summary</div>' +
    '<div style="font-size:13px;color:#1e3a8a">Upcoming: <strong>' +
    vars.upcomingCount +
    '</strong> · Overdue: <strong>' +
    vars.overdueCount +
    '</strong> · Window: <strong>' +
    escapeHtmlEmail_(rangeLabel) +
    '</strong></div></div>' +
    '<h3 style="margin:22px 0 0;font-size:15px;color:#0f172a">Upcoming renewals (' +
    vars.upcomingCount +
    ')</h3>' +
    buildWeeklyTableHtml_(
      report.upcoming,
      fields,
      'No upcoming renewals in the selected window.'
    ) +
    '<h3 style="margin:24px 0 0;font-size:15px;color:#b91c1c">Already overdue (' +
    vars.overdueCount +
    ')</h3>' +
    buildWeeklyTableHtml_(report.overdue, fields, 'No overdue members right now.');

  return {
    subject: subject,
    htmlBody: wrapEmailHtml_('Weekly renewal report', inner),
    textBody: introText
  };
}

function runWeeklyMemberDueReport() {
  const config = getNotificationConfig_();
  if (!config.masterEnabled || !config.weeklyReportEnabled) {
    return { success: true, skipped: true, reason: 'disabled' };
  }
  if (!config.ownerEmail || config.ownerEmail.indexOf('@') < 0) {
    return { success: false, error: 'Owner / Admin email is not configured.' };
  }

  const dbData = DB.batchRead(['MEMBERS', 'PAYMENTS']);
  const members = dbData.MEMBERS || [];
  const payments = dbData.PAYMENTS || [];
  const globalData = api_getGlobalDropdowns && api_getGlobalDropdowns();
  const paymentStatuses = (globalData && globalData.success && globalData.data && globalData.data.options)
    ? globalData.data.options.paymentstatus || globalData.data.options.status || []
    : [];

  const report = classifyMembersForReport_(
    members,
    payments,
    paymentStatuses,
    new Date(),
    config.reportDays
  );
  const mail = buildWeeklyReportEmail_(config, report);
  const emailPayload = {
    to: config.ownerEmail,
    subject: mail.subject,
    htmlBody: mail.htmlBody
  };
  if (config.weeklyCc) emailPayload.cc = config.weeklyCc;
  MailApp.sendEmail(emailPayload);

  return {
    success: true,
    upcoming: report.upcoming.length,
    overdue: report.overdue.length
  };
}

function api_previewNotificationEmail(type, draftConfig) {
  try {
    const gate = requirePermission_('settings', 'view');
    if (!gate.ok) return gate.response;
    const saved = getNotificationConfig_();
    const draft = draftConfig || {};
    const config = Object.assign({}, saved, {
      gymName: draft.gymName || saved.gymName,
      ownerName: draft.ownerName || saved.ownerName || 'there',
      ownerEmail: draft.ownerEmail || saved.ownerEmail,
      weeklyCc: normalizeEmailList_(draft.weeklyCc !== undefined ? draft.weeklyCc : saved.weeklyCc),
      reportDays: Math.min(30, Math.max(1, parseInt(draft.reportDays || saved.reportDays, 10) || 7)),
      receiptSubject: draft.receiptSubject || saved.receiptSubject,
      receiptBody: draft.receiptBody || saved.receiptBody,
      weeklySubject: draft.weeklySubject || saved.weeklySubject,
      weeklyIntro: draft.weeklyIntro || saved.weeklyIntro,
      weeklyFields: parseWeeklyFields_(draft.weeklyFields || saved.weeklyFields)
    });

    if (String(type || '').toLowerCase() === 'receipt') {
      const sampleMember = {
        fullName: 'Priya Kapoor',
        memberId: 'MEM-1120',
        email: 'priya.kapoor@email.com'
      };
      const samplePayment = {
        amount: 4500,
        paidDate: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 86400000)
      };
      const mail = buildPaymentReceiptEmail_(sampleMember, samplePayment, config, 'Quarterly Plan');
      return {
        success: true,
        data: {
          to: sampleMember.email,
          cc: '',
          subject: mail.subject,
          htmlBody: mail.htmlBody,
          isSample: true
        }
      };
    }

    // Preview always uses polished sample rows so admins can see exact formatting.
    const report = buildSampleWeeklyReport_(config.reportDays);
    const mail = buildWeeklyReportEmail_(config, report);
    return {
      success: true,
      data: {
        to: config.ownerEmail || 'owner@example.com',
        cc: config.weeklyCc || '',
        subject: mail.subject,
        htmlBody: mail.htmlBody,
        isSample: true
      }
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function weekDayFromSetting_(dayName) {
  const key = String(dayName || 'Monday').trim().toLowerCase();
  if (key === 'sunday') return ScriptApp.WeekDay.SUNDAY;
  return ScriptApp.WeekDay.MONDAY;
}

function syncNotificationTriggers_(settingsMap) {
  const config = getNotificationConfig_(settingsMap);
  const handlerName = 'runWeeklyMemberDueReport';

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  if (!config.masterEnabled || !config.weeklyReportEnabled) {
    return { success: true, scheduled: false };
  }

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .onWeekDay(weekDayFromSetting_(config.reportDay))
    .atHour(config.reportHour)
    .nearMinute(0)
    .create();

  return {
    success: true,
    scheduled: true,
    day: config.reportDay,
    hour: config.reportHour
  };
}
