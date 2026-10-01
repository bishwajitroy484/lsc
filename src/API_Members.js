/**
 * API_Members.gs
 * Handles server-side operations for the Members module.
 * No mock data. Strictly relies on the DB utility.
 */

function deactivateExpiredMemberStatuses(members, plans, memberStatuses, asOfDate) {
  const statusName = (status) => {
    const option = memberStatuses.find(item => String(item.id) === String(status));
    return String(option ? (option.name || option.label || option.id) : status || '').trim().toLowerCase();
  };
  const inactiveStatus = memberStatuses.find(item =>
    String(item.name || item.label || item.id || '').trim().toLowerCase() === 'inactive'
  );
  const today = new Date(asOfDate || new Date());
  today.setHours(0, 0, 0, 0);

  members.forEach(member => {
    const plan = plans.find(item => String(item.id) === String(member.membershipId));
    const planName = String(plan && plan.name || '').toUpperCase();
    const frequency = String(plan && plan.frequency || '').toUpperCase();
    const isAdHocOrTrial = /AD[\s-]?HOC|TRIAL/.test(`${frequency} ${planName}`);
    if (!isAdHocOrTrial || !member.exitDate || statusName(member.status) !== 'active') return;

    const exitDate = parseSafeDate(member.exitDate);
    if (isNaN(exitDate)) return;
    exitDate.setHours(0, 0, 0, 0);
    if (exitDate <= today) {
      member.status = inactiveStatus ? inactiveStatus.id : 'Inactive';
      DB.update('MEMBERS', member.memberId, { status: member.status });
    }
  });
}

function runDailyMemberExitDateCheck() {
  const members = DB.read('MEMBERS');
  const globalData = api_getGlobalDropdowns();
  if (!globalData || !globalData.success || !globalData.data || !globalData.data.options) {
    throw new Error(globalData && globalData.error ? globalData.error : 'Failed to load member dropdown options.');
  }

  const options = globalData.data.options;
  deactivateExpiredMemberStatuses(members, options.membership || [], options.status || []);
}

function setupMemberExitDateTrigger() {
  const handlerName = 'runDailyMemberExitDateCheck';
  const alreadyScheduled = ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === handlerName
  );
  if (alreadyScheduled) return { success: true, message: 'Daily member exit-date check is already scheduled.' };

  ScriptApp.newTrigger(handlerName).timeBased().everyDays(1).atHour(1).create();
  return { success: true, message: 'Daily member exit-date check scheduled.' };
}

function api_getMembers() {
  try {
    // 1. Batch read for performance, including SETTINGS
    const dbData = DB.batchRead(['MEMBERS', 'PAYMENTS', 'SETTINGS']);
    const members = dbData['MEMBERS'] || [];
    const payments = dbData['PAYMENTS'] || [];
    const settingsRows = dbData['SETTINGS'] || [];

    // 2. Extract Accrual Mode and Currency Format
    let accrualMode = 'anchor';
    const accSetting = settingsRows.find(s => {
      const k = String(s.key || s.Key || s.setting || s.Setting || s.Name || '').toLowerCase();
      return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    if (accSetting) {
      accrualMode = String(accSetting.value !== undefined ? accSetting.value : (accSetting.Value || '')).toLowerCase();
    }

    let currencyFormat = 'Indian';
    const currSetting = settingsRows.find(s => {
      const k = String(s.key || s.Key || s.setting || s.Setting || s.Name || '').toLowerCase();
      return k === 'currency_format' || k === 'currency format' || k === 'currency_style';
    });
    if (currSetting) {
      const rawVal = currSetting.value !== undefined ? currSetting.value : currSetting.Value;
      if (rawVal) currencyFormat = String(rawVal).trim();
    }

    const globalData = api_getGlobalDropdowns && api_getGlobalDropdowns();
    const plans = (globalData && globalData.success && globalData.data && globalData.data.options && globalData.data.options.membership)
      ? globalData.data.options.membership
      : [];
    const memberStatuses = (globalData && globalData.success && globalData.data && globalData.data.options)
      ? globalData.data.options.status || []
      : [];
    const paymentStatuses = (globalData && globalData.success && globalData.data && globalData.data.options)
      ? globalData.data.options.paymentstatus || globalData.data.options.status || []
      : [];

    deactivateExpiredMemberStatuses(members, plans, memberStatuses);

    const paymentsByMember = {};
    payments.forEach(p => {
      if (!paymentsByMember[p.memberId]) paymentsByMember[p.memberId] = [];
      paymentsByMember[p.memberId].push(p);
    });

    const formatToDDMMMYYYY = (dateObj) => {
      if (isNaN(dateObj)) return '';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${String(dateObj.getDate()).padStart(2, '0')}-${months[dateObj.getMonth()]}-${dateObj.getFullYear()}`;
    };

    const enrichedMembers = members.map(m => {
      let mPayments = paymentsByMember[m.memberId] || [];

      mPayments = mPayments.filter(p => isPaidPaymentStatus(p.paymentStatus, paymentStatuses));

      mPayments.sort((a, b) => new Date(b.endDate || b.paidDate || 0) - new Date(a.endDate || a.paidDate || 0));
      const latestPayment = mPayments.length > 0 ? mPayments[0] : null;

      const planMatch = plans.find(p => p.id === m.membershipId);
      const freq = planMatch && planMatch.frequency ? planMatch.frequency.toUpperCase() : '';
      const pName = planMatch && planMatch.name ? planMatch.name.toUpperCase() : '';

      const isAdHocOrTrial = freq.includes('AD-HOC') || freq.includes('ADHOC') || freq.includes('TRIAL') ||
        pName.includes('AD-HOC') || pName.includes('ADHOC') || pName.includes('TRIAL');

      let nextDue = '';

      if (latestPayment) {
        if (isAdHocOrTrial) {
          nextDue = 'N/A';
        } else {
          if (latestPayment.endDate) {
            let d = new Date(latestPayment.endDate);
            if (!isNaN(d)) {
              d.setDate(d.getDate() + 1);
              nextDue = formatToDDMMMYYYY(d);
            }
          } else {
            let baseDateStr = latestPayment.paidDate || latestPayment.date || m.joinDate;
            if (baseDateStr) {
              let d = new Date(baseDateStr);
              if (!isNaN(d)) {
                if (freq.includes('MONTH')) d.setMonth(d.getMonth() + 1);
                else if (freq.includes('QUARTER')) d.setMonth(d.getMonth() + 3);
                else if (freq.includes('HALF')) d.setMonth(d.getMonth() + 6);
                else if (freq.includes('YEAR') || freq.includes('ANNUAL')) d.setFullYear(d.getFullYear() + 1);
                nextDue = formatToDDMMMYYYY(d);
              }
            }
          }
        }
      } else {
        if (m.joinDate) {
          let d = new Date(m.joinDate);
          if (!isNaN(d)) {
            nextDue = formatToDDMMMYYYY(d);
          }
        }
      }

      m.dueDate = nextDue || m.dueDate || '';
      return m;
    });

    // 3. Return accrualMode and currencyFormat at the root level to avoid breaking the frontend data array
    return { success: true, data: enrichedMembers, accrualMode: accrualMode, currencyFormat: currencyFormat };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_saveMember(memberData) {
  try {
    if (!memberData.fullName || !memberData.phone) throw new Error("Name and Phone are required.");
    if (!/^\d{10}$/.test(String(memberData.phone))) throw new Error("Phone number must contain exactly 10 digits.");
    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail();

    memberData.updatedAt = now;
    memberData.updatedBy = userEmail;

    const initialPayment = memberData.initialPayment;
    delete memberData.initialPayment;

    let isNew = !memberData.memberId;
    
    // 1. Generate Member ID FIRST so we can use it as the image name
    if (isNew) {
      memberData.memberId = generateId('MEM');
      memberData.createdAt = now;
      memberData.createdBy = userEmail;
    }

    // 2. Handle Image Upload intercept
    if (memberData.base64Image) {
        // Upload with Member ID as the filename
        const uploadRes = api_uploadImageToDrive(memberData.base64Image, memberData.memberId);
        if (uploadRes.success) {
            memberData.profileImage = uploadRes.fileId; 
        } else {
            throw new Error("Image Upload Failed: " + uploadRes.error);
        }
    }
    // Clean payload before DB save
    delete memberData.base64Image;
    delete memberData.imageName;

    // 3. Save Member to DB
    let savedData;
    if (!isNew) {
      savedData = DB.update('MEMBERS', memberData.memberId, memberData);
    } else {
      savedData = DB.create('MEMBERS', memberData);
      
      // 4. Instantly process upfront payment if checked in UI
      if (initialPayment && initialPayment.amount > 0) {
          initialPayment.paymentId = generateId('PAY');
          initialPayment.memberId = memberData.memberId;
          initialPayment.createdAt = now;
          initialPayment.createdBy = userEmail;
          initialPayment.updatedAt = now;
          initialPayment.updatedBy = userEmail;
          DB.create('PAYMENTS', initialPayment);
          if (typeof maybeSendPaymentReceipt_ === 'function') {
            maybeSendPaymentReceipt_(initialPayment);
          }
      }
    }
    return { success: true, data: savedData, message: isNew ? "Member added successfully." : "Member updated successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_deleteMember(memberId) {
  try {
    if (!memberId) throw new Error("Member ID is missing.");
    DB.remove('MEMBERS', memberId);
    return { success: true, message: "Member deleted successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_getMemberPayments(memberId) {
  try {
    if (!memberId) throw new Error("Member ID is missing.");

    const dbData = DB.batchRead(['PAYMENTS', 'SETTINGS']);
    const allPayments = dbData['PAYMENTS'] || [];
    const settingsRows = dbData['SETTINGS'] || [];
    const globalData = api_getGlobalDropdowns && api_getGlobalDropdowns();
    const paymentStatuses = (globalData && globalData.success && globalData.data && globalData.data.options)
      ? globalData.data.options.paymentstatus || globalData.data.options.status || []
      : [];

    let accrualMode = 'anchor';
    const accSetting = settingsRows.find(s => {
      const k = String(s.key || s.Key || s.setting || s.Setting || s.Name || '').toLowerCase();
      return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    if (accSetting) {
      accrualMode = String(accSetting.value !== undefined ? accSetting.value : (accSetting.Value || '')).toLowerCase();
    }

    let currencyFormat = 'Indian';
    const currSetting = settingsRows.find(s => {
      const k = String(s.key || s.Key || s.setting || s.Setting || s.Name || '').toLowerCase();
      return k === 'currency_format' || k === 'currency format' || k === 'currency_style';
    });
    if (currSetting) {
      const rawVal = currSetting.value !== undefined ? currSetting.value : currSetting.Value;
      if (rawVal) currencyFormat = String(rawVal).trim();
    }

    const memberPayments = allPayments.filter(p => p.memberId === memberId);

    // BACKEND MATH: Pre-calculate all years and modes based on Accrual Mode
    const chartMetrics = {};
    const ensureYear = (y) => {
      if (!chartMetrics[y]) chartMetrics[y] = { monthly: new Array(12).fill(0), quarterly: [0, 0, 0, 0], totalEarned: 0 };
    };

    memberPayments.forEach(p => {
      if (!isPaidPaymentStatus(p.paymentStatus, paymentStatuses)) return;
      let totalAmt = Number(String(p.amount || 0).replace(/[^0-9.-]+/g, ""));
      if (!totalAmt) return;

      distributeDailyProration(p.startDate || p.paidDate, p.endDate || p.paidDate, p.paidDate, totalAmt, accrualMode, (cYear, cMonth, intervalAmt) => {
        ensureYear(cYear);
        chartMetrics[cYear].totalEarned += intervalAmt;
        chartMetrics[cYear].monthly[cMonth] += intervalAmt;
        chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += intervalAmt;
      });
    });

    return { success: true, data: memberPayments, chartMetrics: chartMetrics, accrualMode: accrualMode, currencyFormat: currencyFormat };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function isPaidPaymentStatus(status, paymentStatuses) {
  const rawStatus = String(status || '').trim();
  const matchingOption = (paymentStatuses || []).find(option => {
    const optionId = String(option.id || option.value || option.code || '').trim();
    const optionName = String(option.name || option.label || '').trim();
    return optionId === rawStatus || optionName.toLowerCase() === rawStatus.toLowerCase();
  });
  const statusName = String(matchingOption ? (matchingOption.name || matchingOption.label || matchingOption.id) : rawStatus)
    .trim()
    .toLowerCase();
  return statusName === 'paid' || statusName === 'completed';
}

function api_recordPayment(paymentData) {
  try {
    if (!paymentData.memberId || !paymentData.amount || !paymentData.paidDate || !paymentData.startDate || !paymentData.endDate) {
      throw new Error("Missing required payment details (Member ID, Amount, Paid Date, Start Date, and End Date are strictly required).");
    }

    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail();
    const isNewPayment = !paymentData.paymentId;

    paymentData.updatedAt = now;
    paymentData.updatedBy = userEmail;

    let savedData;
    if (paymentData.paymentId) {
      savedData = DB.update('PAYMENTS', paymentData.paymentId, paymentData);
    } else {
      paymentData.paymentId = generateId('PAY');
      paymentData.createdAt = now;
      paymentData.createdBy = userEmail;
      savedData = DB.create('PAYMENTS', paymentData);
    }

    if (isNewPayment && typeof maybeSendPaymentReceipt_ === 'function') {
      maybeSendPaymentReceipt_(savedData || paymentData);
    }

    return { success: true, data: savedData, message: isNewPayment ? "Payment recorded successfully." : "Payment updated successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_deletePayment(paymentId) {
  try {
    if (!paymentId) throw new Error("Payment ID is missing.");
    DB.remove('PAYMENTS', paymentId);
    return { success: true, message: "Payment deleted successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}