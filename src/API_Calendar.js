/**
 * API_Calendar.gs
 * Operations month planner: renewals, overdue, and exits for Active members.
 * Renewal due = payment endDate (same contract as Members / Dashboard / GCal).
 */
function api_getCalendarData(month, year) {
  try {
    const gate = requirePermission_('calendar', 'view');
    if (!gate.ok) return gate.response;

    const targetMonth = Number(month);
    const targetYear = Number(year);
    const monthStart = new Date(targetYear, targetMonth, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dbData = DB.batchRead(['MEMBERS', 'PAYMENTS']);
    const members = dbData['MEMBERS'] || [];
    const payments = dbData['PAYMENTS'] || [];

    const planOptions = api_getGlobalDropdowns && api_getGlobalDropdowns();
    const options = planOptions && planOptions.success && planOptions.data && planOptions.data.options
      ? planOptions.data.options
      : {};
    const plans = options.membership || [];
    const paymentStatuses = options.paymentstatus || [];
    const memberStatuses = options.status || [];

    const planMap = {};
    plans.forEach(plan => {
      const id = String(plan.id || plan.value || plan.code || '').trim();
      planMap[id] = {
        name: plan.name || plan.label || plan.id || 'Membership',
        frequency: String(plan.frequency || '').toUpperCase()
      };
    });

    const statusLabel = (statusValue) => {
      const raw = String(statusValue || '').trim();
      if (!raw) return '';
      const match = memberStatuses.find(item =>
        String(item.id || item.value || '').trim() === raw ||
        String(item.name || item.label || '').trim().toLowerCase() === raw.toLowerCase()
      );
      return String(match ? (match.name || match.label || match.id) : raw).trim();
    };

    const isActiveMember = (member) => {
      const label = statusLabel(member.status).toLowerCase().replace(/[_-]+/g, ' ');
      if (!label) return true;
      if (label.includes('inactive') || label.includes('in active') || label.includes('exit') || label.includes('left')) {
        return false;
      }
      return true;
    };

    const isAdHocOrTrial = (planMeta, planName) => {
      const freq = String((planMeta && planMeta.frequency) || '').toUpperCase();
      const name = String(planName || (planMeta && planMeta.name) || '').toUpperCase();
      const blob = freq + ' ' + name;
      return blob.indexOf('AD-HOC') >= 0 || blob.indexOf('ADHOC') >= 0 || blob.indexOf('TRIAL') >= 0;
    };

    const paymentsByMember = {};
    payments.forEach(payment => {
      const memberId = String(payment.memberId || '').trim();
      if (!memberId) return;
      const paid = typeof isPaidPaymentStatus === 'function'
        ? isPaidPaymentStatus(payment.paymentStatus, paymentStatuses)
        : true;
      if (!paid) return;
      if (!paymentsByMember[memberId]) paymentsByMember[memberId] = [];
      paymentsByMember[memberId].push(payment);
    });

    Object.keys(paymentsByMember).forEach(memberId => {
      paymentsByMember[memberId].sort((a, b) => {
        const aDate = new Date(a.endDate || a.paidDate || a.date || 0).getTime();
        const bDate = new Date(b.endDate || b.paidDate || b.date || 0).getTime();
        return bDate - aDate;
      });
    });

    const parseDate = (value) => {
      const safe = typeof parseSafeDate === 'function' ? parseSafeDate(value) : new Date(value);
      if (!safe || isNaN(safe.getTime())) return null;
      const d = new Date(safe.getTime());
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const frequencyMonthsFromPlan = (planMeta, planName) => {
      const blob = String(((planMeta && planMeta.frequency) || '') + ' ' + (planName || '')).toLowerCase();
      if (blob.includes('year') || blob.includes('annual')) return 12;
      if (blob.includes('half')) return 6;
      if (blob.includes('quarter')) return 3;
      if (blob.includes('month')) return 1;
      return 1;
    };

    const formatDueLabel = (dateObj) => {
      return dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    };

    const dateKeyOf = (dateObj) => {
      return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    };

    const resolveNextDueDate = (member, planMeta, planName) => {
      const mPayments = paymentsByMember[String(member.memberId || '')] || [];
      if (!member || (!member.joinDate && mPayments.length === 0)) return null;

      if (mPayments.length > 0) {
        const latest = mPayments[0];
        const endDate = parseDate(latest.endDate);
        if (endDate) return endDate;

        const paidDate = parseDate(latest.paidDate || latest.date || member.joinDate);
        if (paidDate) {
          const due = new Date(paidDate.getTime());
          due.setMonth(due.getMonth() + frequencyMonthsFromPlan(planMeta, planName));
          return due;
        }
      }

      return parseDate(member.joinDate);
    };

    const typeMeta = (type, daysLeft) => {
      if (type === 'exit') {
        return {
          statusKey: 'exit',
          statusText: daysLeft < 0 ? 'Exited' : (daysLeft === 0 ? 'Exit today' : 'Exit soon'),
          badgeClass: 'text-violet-700 bg-violet-50 border-violet-200',
          dot: 'bg-violet-500',
          colorKey: 'exit'
        };
      }
      if (type === 'overdue' || daysLeft < 0) {
        return {
          statusKey: 'overdue',
          statusText: 'Overdue',
          badgeClass: 'text-red-600 bg-red-50 border-red-200',
          dot: 'bg-red-500',
          colorKey: 'overdue'
        };
      }
      if (daysLeft <= 2) {
        return {
          statusKey: 'critical',
          statusText: 'Due ≤2d',
          badgeClass: 'text-red-600 bg-red-50 border-red-200',
          dot: 'bg-sky-500',
          colorKey: 'renewal'
        };
      }
      if (daysLeft <= 7) {
        return {
          statusKey: 'warning',
          statusText: 'Due 3–7d',
          badgeClass: 'text-amber-600 bg-amber-50 border-amber-200',
          dot: 'bg-sky-500',
          colorKey: 'renewal'
        };
      }
      return {
        statusKey: 'upcoming',
        statusText: 'Renewal',
        badgeClass: 'text-slate-600 bg-slate-100 border-slate-200',
        dot: 'bg-sky-500',
        colorKey: 'renewal'
      };
    };

    const events = [];
    const dateBuckets = {};
    const stats = { overdue: 0, due2: 0, due3To7: 0, thisMonth: 0, exits: 0 };

    const pushEvent = (item) => {
      events.push(item);
      if (!dateBuckets[item.dateKey]) dateBuckets[item.dateKey] = [];
      dateBuckets[item.dateKey].push(item);
    };

    members.forEach((member) => {
      if (!member.fullName || !member.memberId) return;
      if (!isActiveMember(member)) return;

      const planMeta = planMap[String(member.membershipId || '').trim()] || null;
      const planName = (planMeta && planMeta.name) || 'Membership';
      const adHocOrTrial = isAdHocOrTrial(planMeta, planName);
      const memberAmount = Number(String(member.membershipAmount ?? member.amount ?? 0).replace(/[^0-9.-]+/g, '')) || 0;
      const phone = String(member.phone || '').trim();
      const gcalSynced = Boolean(String(member.dueCalendarEventId || '').trim());

      // Trial / Ad-hoc: exit date only (no renewal)
      if (adHocOrTrial) {
        const exitDate = parseDate(member.exitDate);
        if (!exitDate) return;
        const inMonth = exitDate >= monthStart && exitDate <= monthEnd;
        if (!inMonth) return;

        const daysLeft = Math.round((exitDate.getTime() - today.getTime()) / 86400000);
        const meta = typeMeta('exit', daysLeft);
        pushEvent({
          id: 'exit-' + member.memberId,
          type: 'exit',
          memberId: member.memberId,
          name: member.fullName,
          phone: phone,
          plan: planName,
          amount: memberAmount,
          eventDate: exitDate.toISOString(),
          nextDueDate: exitDate.toISOString(),
          dueDateLabel: formatDueLabel(exitDate),
          daysLeft: daysLeft,
          statusText: meta.statusText,
          statusKey: meta.statusKey,
          badgeClass: meta.badgeClass,
          dot: meta.dot,
          colorKey: meta.colorKey,
          gcalSynced: false,
          dateKey: dateKeyOf(exitDate)
        });
        stats.exits += 1;
        stats.thisMonth += 1;
        return;
      }

      const nextDue = resolveNextDueDate(member, planMeta, planName);
      if (!nextDue) return;

      const daysLeft = Math.round((nextDue.getTime() - today.getTime()) / 86400000);
      if (isNaN(daysLeft)) return;

      const isSelectedMonthDue = nextDue >= monthStart && nextDue <= monthEnd;
      // Urgency window ≤7 days (Dashboard parity); month grid still shows full month
      const isUrgencyRelevant = daysLeft <= 7;
      if (!isSelectedMonthDue && !isUrgencyRelevant) return;

      const type = daysLeft < 0 ? 'overdue' : 'renewal';
      const meta = typeMeta(type, daysLeft);
      pushEvent({
        id: type + '-' + member.memberId,
        type: type,
        memberId: member.memberId,
        name: member.fullName,
        phone: phone,
        plan: planName,
        amount: memberAmount,
        eventDate: nextDue.toISOString(),
        nextDueDate: nextDue.toISOString(),
        dueDateLabel: formatDueLabel(nextDue),
        daysLeft: daysLeft,
        statusText: meta.statusText,
        statusKey: meta.statusKey,
        badgeClass: meta.badgeClass,
        dot: meta.dot,
        colorKey: meta.colorKey,
        gcalSynced: gcalSynced,
        dateKey: dateKeyOf(nextDue)
      });

      if (daysLeft < 0) stats.overdue += 1;
      else if (daysLeft <= 2) stats.due2 += 1;
      else if (daysLeft <= 7) stats.due3To7 += 1;
      if (isSelectedMonthDue) stats.thisMonth += 1;
    });

    events.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate) || String(a.name).localeCompare(String(b.name)));
    Object.keys(dateBuckets).forEach(key => {
      dateBuckets[key].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate) || String(a.name).localeCompare(String(b.name)));
    });

    return {
      success: true,
      data: {
        events: events,
        monthMembers: events,
        dateBuckets: dateBuckets,
        stats: {
          overdue: stats.overdue,
          due2: stats.due2,
          due3To7: stats.due3To7,
          thisMonth: stats.thisMonth,
          exits: stats.exits,
          total: events.length,
          // legacy keys kept for older UI caches
          dueSoon: stats.due2 + stats.due3To7,
          due3To5: stats.due3To7,
          due6To10: 0,
          totalMembers: events.length
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
