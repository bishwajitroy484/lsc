/**
 * API_Calendar.gs
 * Returns the month-based member schedule derived from Member + Payment records.
 */
function api_getCalendarData(month, year) {
  try {
    const gate = requirePermission_('calendar', 'view');
    if (!gate.ok) return gate.response;
    const targetMonth = Number(month);
    const targetYear = Number(year);
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dbData = DB.batchRead(['MEMBERS', 'PAYMENTS']);
    const members = dbData['MEMBERS'] || [];
    const payments = dbData['PAYMENTS'] || [];

    const planOptions = api_getGlobalDropdowns && api_getGlobalDropdowns();
    const plans = planOptions && planOptions.success && planOptions.data && planOptions.data.options && planOptions.data.options.membership ? planOptions.data.options.membership : [];
    const planMap = {};
    plans.forEach(plan => {
      planMap[String(plan.id || plan.value || plan.code || '').trim()] = plan.name || plan.label || plan.id || 'Membership';
    });

    const paymentsByMember = {};
    payments.forEach(payment => {
      const memberId = String(payment.memberId || '').trim();
      if (!memberId) return;
      const status = String(payment.paymentStatus || '').toLowerCase();
      if (status.includes('fail') || status.includes('pending') || status.includes('cancel')) return;
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
      const safe = parseSafeDate(value);
      return isNaN(safe) ? null : safe;
    };

    const frequencyMonthsFromPlan = (planName) => {
      const name = String(planName || '').toLowerCase();
      if (name.includes('year') || name.includes('annual')) return 12;
      if (name.includes('half')) return 6;
      if (name.includes('quarter')) return 3;
      if (name.includes('month')) return 1;
      return 1;
    };

    const isAdHocOrTrial = (planName) => {
      const name = String(planName || '').toLowerCase();
      return name.includes('ad-hoc') || name.includes('adhoc') || name.includes('trial');
    };

    const resolveNextDueDate = (member, planName) => {
      const mPayments = paymentsByMember[String(member.memberId || '')] || [];
      if (isAdHocOrTrial(planName) || !member || (!member.joinDate && mPayments.length === 0)) return null;

      if (mPayments.length > 0) {
        const latest = mPayments[0];
        const endDate = parseDate(latest.endDate);
        if (endDate && !isNaN(endDate)) {
          const due = new Date(endDate);
          due.setDate(due.getDate() + 1);
          return due;
        }

        const paidDate = parseDate(latest.paidDate || latest.date || member.joinDate);
        if (paidDate && !isNaN(paidDate)) {
          const due = new Date(paidDate);
          due.setMonth(due.getMonth() + frequencyMonthsFromPlan(planName));
          return due;
        }
      }

      const joinDate = parseDate(member.joinDate);
      if (joinDate && !isNaN(joinDate)) {
        return new Date(joinDate);
      }

      return null;
    };

    const getUrgency = (daysLeft) => {
      if (daysLeft < 0) return { key: 'overdue', label: 'Overdue', badgeClass: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500' };
      if (daysLeft <= 2) return { key: 'critical', label: 'Due in ≤2 days', badgeClass: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500' };
      if (daysLeft <= 5) return { key: 'warning', label: 'Due in 3-5 days', badgeClass: 'text-amber-600 bg-amber-50 border-amber-200', dot: 'bg-amber-400' };
      if (daysLeft <= 10) return { key: 'soon', label: 'Due in 6-10 days', badgeClass: 'text-emerald-600 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' };
      return { key: 'upcoming', label: 'Upcoming', badgeClass: 'text-slate-600 bg-slate-100 border-slate-200', dot: 'bg-slate-300' };
    };

    const monthItems = [];
    const dateBuckets = {};
    const stats = { dueSoon: 0, due2: 0, due3To5: 0, due6To10: 0, total: 0 };

    members.forEach((member) => {
      const rawPlanName = planMap[String(member.membershipId || '').trim()] || 'Membership';
      if (!member.fullName || !member.memberId) return;

      const nextDue = resolveNextDueDate(member, rawPlanName);
      if (!nextDue) return;

      const diffMs = nextDue.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffMs / 86400000);
      const urgency = getUrgency(daysLeft);

      if (isNaN(daysLeft)) return;

      const isSelectedMonthDue = nextDue >= monthStart && nextDue <= monthEnd;
      const isRelevantForMonth = isSelectedMonthDue || daysLeft <= 10;
      if (!isRelevantForMonth) {
        return;
      }

      const memberAmount = Number(String(member.membershipAmount ?? member.amount ?? 0).replace(/[^0-9.-]+/g, '')) || 0;

      const item = {
        memberId: member.memberId,
        name: member.fullName,
        plan: rawPlanName,
        amount: memberAmount,
        nextDueDate: nextDue.toISOString(),
        dueDateLabel: nextDue.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'),
        daysLeft: daysLeft,
        statusText: urgency.label,
        statusKey: urgency.key,
        badgeClass: urgency.badgeClass,
        dot: urgency.dot,
        currency: Number(String(member.membershipAmount || 0).replace(/[^0-9.-]+/g, '')) || 0,
        dateKey: `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}-${String(nextDue.getDate()).padStart(2, '0')}`
      };

      monthItems.push(item);
      if (!dateBuckets[item.dateKey]) dateBuckets[item.dateKey] = [];
      dateBuckets[item.dateKey].push(item);

      if (daysLeft <= 10 && daysLeft >= 0) {
        stats.dueSoon += 1;
        if (daysLeft <= 2) stats.due2 += 1;
        else if (daysLeft <= 5) stats.due3To5 += 1;
        else stats.due6To10 += 1;
      }
      stats.total += 1;
    });

    monthItems.sort((a, b) => a.nextDueDate - b.nextDueDate);
    Object.keys(dateBuckets).forEach(key => {
      dateBuckets[key].sort((a, b) => a.nextDueDate - b.nextDueDate);
    });

    return {
      success: true,
      data: {
        monthMembers: monthItems,
        dateBuckets: dateBuckets,
        stats: {
          dueSoon: stats.dueSoon,
          due2: stats.due2,
          due3To5: stats.due3To5,
          due6To10: stats.due6To10,
          total: monthItems.length,
          totalMembers: monthItems.length
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}