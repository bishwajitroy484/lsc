/**
 * Email notification helpers:
 * 1) Payment receipt to member after a paid payment is recorded
 * 2) Weekly admin report of upcoming (7 days) and overdue renewals
 */

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

function getNotificationConfig_(settingsMap) {
  const settings = settingsMap || readSettingsMap_();
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
    ownerEmail: String(settings.OWNER_EMAIL || '').trim(),
    gymName: String(settings.GYM_NAME || 'LSC').trim() || 'LSC',
    reminderBuffer: Math.max(0, parseInt(settings.REMINDER_BUFFER || '7', 10) || 7)
  };
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
  const memberName = String(member.fullName || 'Member').trim();
  const gymName = config.gymName;
  const amount = formatMoneyForEmail_(payment.amount);
  const paidDate = formatDateForEmail_(payment.paidDate || payment.date);
  const startDate = formatDateForEmail_(payment.startDate);
  const endDate = formatDateForEmail_(payment.endDate);
  const planLabel = planName || 'membership';

  const subject = gymName + ' — Thank you for your payment';
  const htmlBody =
    '<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;max-width:560px">' +
    '<h2 style="margin:0 0 12px;color:#1d4ed8">Payment received</h2>' +
    '<p style="margin:0 0 12px">Hi ' + memberName + ',</p>' +
    '<p style="margin:0 0 12px">Thank you for your payment towards <strong>' + planLabel +
    '</strong> at <strong>' + gymName + '</strong>. Your payment has been recorded successfully.</p>' +
    '<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">' +
    '<tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>Amount</strong></td>' +
    '<td style="padding:8px;border:1px solid #e2e8f0">' + amount + '</td></tr>' +
    '<tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>Paid on</strong></td>' +
    '<td style="padding:8px;border:1px solid #e2e8f0">' + paidDate + '</td></tr>' +
    '<tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>Coverage</strong></td>' +
    '<td style="padding:8px;border:1px solid #e2e8f0">' + startDate + ' → ' + endDate + '</td></tr>' +
    '<tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc"><strong>Member ID</strong></td>' +
    '<td style="padding:8px;border:1px solid #e2e8f0">' + String(member.memberId || '') + '</td></tr>' +
    '</table>' +
    '<p style="margin:0;color:#64748b;font-size:13px">We appreciate your continued membership with ' +
    gymName + '.</p>' +
    '</div>';

  return { subject: subject, htmlBody: htmlBody };
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

function classifyMembersForReport_(members, payments, paymentStatuses, asOfDate) {
  const today = startOfDay_(asOfDate || new Date());
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 7);

  const upcoming = [];
  const overdue = [];

  (members || []).forEach(member => {
    const statusName = String(member.status || '').trim().toLowerCase();
    if (statusName === 'inactive' || statusName === 'left') return;

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
  return { upcoming: upcoming, overdue: overdue, today: today, horizon: horizon };
}

function buildWeeklyReportEmail_(config, report) {
  const gymName = config.gymName;
  const rangeLabel = formatDateForEmail_(report.today) + ' → ' + formatDateForEmail_(report.horizon);
  const subject = gymName + ' — Weekly renewal report (' + rangeLabel + ')';

  const renderRows = (rows, emptyText) => {
    if (!rows.length) {
      return '<p style="margin:8px 0;color:#64748b;font-size:13px">' + emptyText + '</p>';
    }
    let html = '<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">' +
      '<tr style="background:#f8fafc">' +
      '<th align="left" style="padding:8px;border:1px solid #e2e8f0">Member</th>' +
      '<th align="left" style="padding:8px;border:1px solid #e2e8f0">Phone</th>' +
      '<th align="left" style="padding:8px;border:1px solid #e2e8f0">Due</th>' +
      '<th align="left" style="padding:8px;border:1px solid #e2e8f0">Days</th>' +
      '</tr>';
    rows.forEach(row => {
      html += '<tr>' +
        '<td style="padding:8px;border:1px solid #e2e8f0">' + row.fullName +
        '<div style="color:#94a3b8;font-size:11px">' + row.memberId + '</div></td>' +
        '<td style="padding:8px;border:1px solid #e2e8f0">' + row.phone + '</td>' +
        '<td style="padding:8px;border:1px solid #e2e8f0">' + row.dueLabel + '</td>' +
        '<td style="padding:8px;border:1px solid #e2e8f0">' + row.daysUntil + '</td>' +
        '</tr>';
    });
    html += '</table>';
    return html;
  };

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;max-width:720px">' +
    '<h2 style="margin:0 0 8px;color:#1d4ed8">Weekly member renewal report</h2>' +
    '<p style="margin:0 0 16px;color:#475569">Window: <strong>' + rangeLabel + '</strong> · Gym: <strong>' +
    gymName + '</strong></p>' +
    '<h3 style="margin:20px 0 0;font-size:15px">Upcoming in next 7 days (' + report.upcoming.length + ')</h3>' +
    renderRows(report.upcoming, 'No upcoming renewals in the next 7 days.') +
    '<h3 style="margin:24px 0 0;font-size:15px;color:#b91c1c">Already overdue (' + report.overdue.length + ')</h3>' +
    renderRows(report.overdue, 'No overdue members right now.') +
    '<p style="margin:20px 0 0;color:#94a3b8;font-size:12px">Generated automatically by LSC notifications.</p>' +
    '</div>';

  return { subject: subject, htmlBody: htmlBody };
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

  const report = classifyMembersForReport_(members, payments, paymentStatuses, new Date());
  const mail = buildWeeklyReportEmail_(config, report);
  MailApp.sendEmail({
    to: config.ownerEmail,
    subject: mail.subject,
    htmlBody: mail.htmlBody
  });

  return {
    success: true,
    upcoming: report.upcoming.length,
    overdue: report.overdue.length
  };
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
