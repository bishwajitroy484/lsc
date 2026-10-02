/**
 * Google Calendar due reminders for quarterly membership renewals.
 * Opt-in via Settings; creates timed events on the deployer's primary calendar.
 */

var DUE_CALENDAR_EVENT_FIELD_ = 'dueCalendarEventId';

function isSettingYes_(value) {
  const v = String(value || '').trim().toUpperCase();
  return v === 'YES' || v === 'Y' || v === 'TRUE' || v === '1' || v === 'ENABLED';
}

function readDueCalendarSettingsMap_() {
  if (typeof readSettingsMap_ === 'function') return readSettingsMap_();
  try {
    const rows = DB.read('SETTINGS') || [];
    const map = {};
    rows.forEach(function(row) {
      const key = String(row.key || row.Key || row.setting || row.Setting || '').trim().toUpperCase();
      if (!key) return;
      map[key] = String(row.value !== undefined ? row.value : (row.Value || '')).trim();
    });
    return map;
  } catch (error) {
    return {};
  }
}

function getDueCalendarConfig_(settingsMap) {
  const settings = settingsMap || readDueCalendarSettingsMap_();
  const hour = Math.min(23, Math.max(0, parseInt(settings.CALENDAR_DUE_HOUR || '9', 10) || 9));
  const durationMin = Math.min(180, Math.max(15, parseInt(settings.CALENDAR_DUE_DURATION_MIN || '30', 10) || 30));
  return {
    enabled: isSettingYes_(settings.ENABLE_CALENDAR_DUE_EVENTS),
    hour: hour,
    durationMin: durationMin,
    gymName: String(settings.GYM_NAME || 'LSC').trim() || 'LSC'
  };
}

function isQuarterlyPlan_(planMeta) {
  if (!planMeta) return false;
  const freq = String(planMeta.frequency || '').toUpperCase();
  const name = String(planMeta.name || planMeta.label || '').toUpperCase();
  const blob = freq + ' ' + name;
  if (blob.indexOf('AD-HOC') >= 0 || blob.indexOf('ADHOC') >= 0 || blob.indexOf('TRIAL') >= 0) {
    return false;
  }
  return blob.indexOf('QUARTER') >= 0;
}

function resolveNextDueFromPayment_(payment) {
  if (!payment) return null;
  const end = typeof parseSafeDate === 'function'
    ? parseSafeDate(payment.endDate)
    : new Date(payment.endDate);
  if (!end || isNaN(end.getTime())) return null;
  const due = new Date(end.getTime());
  due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + 1);
  return due;
}

function ensureMembersDueCalendarHeader_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('MEMBERS');
  if (!sheet) return false;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  const present = headers.some(function(h) {
    return String(h || '').trim() === DUE_CALENDAR_EVENT_FIELD_;
  });
  if (present) return true;
  const col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col).setValue(DUE_CALENDAR_EVENT_FIELD_);
  return true;
}

function deleteDueCalendarEvent_(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return { deleted: false, reason: 'missing-id' };
  try {
    const cal = CalendarApp.getDefaultCalendar();
    const event = cal.getEventById(id);
    if (event) {
      event.deleteEvent();
      return { deleted: true };
    }
    return { deleted: false, reason: 'not-found' };
  } catch (error) {
    console.error('Due calendar delete failed: ' + (error && error.message ? error.message : error));
    return { deleted: false, reason: 'error', error: String(error) };
  }
}

function createDueCalendarEvent_(member, dueDate, config, planName, payment) {
  const start = new Date(dueDate.getTime());
  start.setHours(config.hour, 0, 0, 0);
  const end = new Date(start.getTime() + config.durationMin * 60 * 1000);

  const fullName = String(member.fullName || 'Member').trim();
  const memberId = String(member.memberId || '').trim();
  const title = 'Due: ' + fullName + (memberId ? ' (' + memberId + ')' : '');

  const lines = [
    'Gym: ' + (config.gymName || 'LSC'),
    'Member: ' + fullName,
    'Member ID: ' + memberId,
    'Plan: ' + (planName || 'Quarterly'),
    'Phone: ' + String(member.phone || '--'),
    'Next due: ' + (typeof formatToDDMMMYYYY === 'function'
      ? formatToDDMMMYYYY(dueDate)
      : dueDate.toDateString())
  ];
  if (payment) {
    if (payment.endDate) {
      lines.push('Coverage ends: ' + String(payment.endDate));
    }
    if (payment.amount !== undefined && payment.amount !== null && payment.amount !== '') {
      lines.push('Last paid amount: ' + String(payment.amount));
    }
  }
  lines.push('', 'Created automatically by LSC Gym Management.');

  const cal = CalendarApp.getDefaultCalendar();
  const event = cal.createEvent(title, start, end, { description: lines.join('\n') });
  return event ? String(event.getId() || '') : '';
}

function findMemberPlanMeta_(member) {
  const globalData = api_getGlobalDropdowns && api_getGlobalDropdowns();
  const plans = (globalData && globalData.success && globalData.data && globalData.data.options)
    ? (globalData.data.options.membership || [])
    : [];
  const membershipId = member && (member.membershipId || member.membership);
  return plans.find(function(p) {
    return String(p.id) === String(membershipId);
  }) || null;
}

function findLatestPaidPaymentForMember_(memberId, paymentHint) {
  const globalData = api_getGlobalDropdowns && api_getGlobalDropdowns();
  const paymentStatuses = (globalData && globalData.success && globalData.data && globalData.data.options)
    ? globalData.data.options.paymentstatus || globalData.data.options.status || []
    : [];

  let payments = DB.read('PAYMENTS') || [];
  payments = payments.filter(function(p) {
    return String(p.memberId) === String(memberId);
  });

  if (paymentHint && paymentHint.paymentId) {
    const idx = payments.findIndex(function(p) {
      return String(p.paymentId) === String(paymentHint.paymentId);
    });
    if (idx >= 0) payments[idx] = Object.assign({}, payments[idx], paymentHint);
    else payments.push(paymentHint);
  }

  payments = payments.filter(function(p) {
    return typeof isPaidPaymentStatus === 'function'
      ? isPaidPaymentStatus(p.paymentStatus, paymentStatuses)
      : true;
  });

  payments.sort(function(a, b) {
    const aDate = typeof parseSafeDate === 'function'
      ? parseSafeDate(a.endDate || a.paidDate || 0)
      : new Date(a.endDate || a.paidDate || 0);
    const bDate = typeof parseSafeDate === 'function'
      ? parseSafeDate(b.endDate || b.paidDate || 0)
      : new Date(b.endDate || b.paidDate || 0);
    return bDate - aDate;
  });

  return payments.length ? payments[0] : null;
}

function persistMemberDueCalendarEventId_(memberId, eventId) {
  ensureMembersDueCalendarHeader_();
  const payload = {};
  payload[DUE_CALENDAR_EVENT_FIELD_] = eventId ? String(eventId) : '';
  DB.update('MEMBERS', memberId, payload);
}

/**
 * Sync Google Calendar due reminder for a member after payment create/update/delete.
 * Never throws to the caller — payment save must succeed even if Calendar fails.
 */
function syncMemberDueCalendarEvent_(memberId, paymentHint) {
  try {
    const id = String(memberId || '').trim();
    if (!id) return { synced: false, reason: 'missing-member' };

    const config = getDueCalendarConfig_();
    const members = DB.read('MEMBERS') || [];
    const member = members.find(function(m) {
      return String(m.memberId) === id;
    });
    if (!member) return { synced: false, reason: 'member-missing' };

    const previousEventId = String(member[DUE_CALENDAR_EVENT_FIELD_] || '').trim();

    if (!config.enabled) {
      return { synced: false, reason: 'disabled' };
    }

    const planMeta = findMemberPlanMeta_(member);
    if (!isQuarterlyPlan_(planMeta)) {
      if (previousEventId) {
        deleteDueCalendarEvent_(previousEventId);
        persistMemberDueCalendarEventId_(id, '');
      }
      return { synced: false, reason: 'not-quarterly' };
    }

    const latestPaid = findLatestPaidPaymentForMember_(id, paymentHint);
    const nextDue = resolveNextDueFromPayment_(latestPaid);

    if (previousEventId) {
      deleteDueCalendarEvent_(previousEventId);
    }

    if (!latestPaid || !nextDue) {
      if (previousEventId) persistMemberDueCalendarEventId_(id, '');
      return { synced: false, reason: 'no-due' };
    }

    const planName = String((planMeta && (planMeta.name || planMeta.label)) || 'Quarterly');
    const newEventId = createDueCalendarEvent_(member, nextDue, config, planName, latestPaid);
    persistMemberDueCalendarEventId_(id, newEventId);
    return { synced: true, eventId: newEventId, dueDate: nextDue };
  } catch (error) {
    console.error('Due calendar sync failed: ' + (error && error.message ? error.message : error));
    return { synced: false, reason: 'error', error: String(error) };
  }
}

/**
 * Best-effort cleanup when a member is removed.
 */
function clearMemberDueCalendarEvent_(memberId) {
  try {
    const id = String(memberId || '').trim();
    if (!id) return;
    const members = DB.read('MEMBERS') || [];
    const member = members.find(function(m) {
      return String(m.memberId) === id;
    });
    const eventId = member ? String(member[DUE_CALENDAR_EVENT_FIELD_] || '').trim() : '';
    if (eventId) deleteDueCalendarEvent_(eventId);
  } catch (error) {
    console.error('Due calendar clear failed: ' + (error && error.message ? error.message : error));
  }
}
