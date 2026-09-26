/**
 * API_Members.gs
 * Handles server-side operations for the Members module.
 * No mock data. Strictly relies on the DB utility.
 */

function api_getMembers() {
  try {
    // 1. Batch read for performance, including SETTINGS
    const dbData = DB.batchRead(['MEMBERS', 'PAYMENTS', 'SETTINGS']);
    const members = dbData['MEMBERS'] || [];
    const payments = dbData['PAYMENTS'] || [];
    const settingsRows = dbData['SETTINGS'] || [];

    // 2. Extract Accrual Mode
    let accrualMode = 'anchor';
    const accSetting = settingsRows.find(s => {
      const k = String(s.key || s.setting || s.Name || '').toLowerCase();
      return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    if (accSetting) {
      accrualMode = String(accSetting.value || accSetting.Value || '').toLowerCase();
    }

    const globalData = api_getGlobalDropdowns();
    const plans = (globalData.success && globalData.data.options.membership) ? globalData.data.options.membership : [];

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

      mPayments = mPayments.filter(p => {
        const status = (p.paymentStatus || '').toLowerCase();
        return !status.includes('fail') && !status.includes('pending');
      });

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

    console.log("enrichedMembers ", enrichedMembers)
    // 3. Return accrualMode at the root level to avoid breaking the frontend data array
    return { success: true, data: enrichedMembers, accrualMode: accrualMode };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// function api_saveMember(memberData) {
//   try {
//     if (!memberData.fullName || !memberData.phone) throw new Error("Name and Phone are required.");
//     const now = new Date().toISOString();
//     const userEmail = Session.getActiveUser().getEmail();

//     memberData.updatedAt = now;
//     memberData.updatedBy = userEmail;

//     // 1. Isolate payment data so it doesn't save inside the Member DB object
//     const initialPayment = memberData.initialPayment;
//     delete memberData.initialPayment;

//     // 2. Handle Image Upload intercept
//     if (memberData.base64Image) {
//         const uploadRes = api_uploadImageToDrive(memberData.base64Image, memberData.imageName || memberData.fullName);
//         if (uploadRes.success) {
//             memberData.profileimage = uploadRes.url; // Assign new Drive URL
//         } else {
//             throw new Error("Image Upload Failed: " + uploadRes.error);
//         }
//     }
//     // Clean payload before DB save
//     delete memberData.base64Image;
//     delete memberData.imageName;

//     let savedData;
//     let isNew = !memberData.memberId;
    
//     // 3. Save Member to DB
//     if (!isNew) {
//       savedData = DB.update('MEMBERS', memberData.memberId, memberData);
//     } else {
//       memberData.memberId = generateId('MEM');
//       memberData.createdAt = now;
//       memberData.createdBy = userEmail;
//       savedData = DB.create('MEMBERS', memberData);
      
//       // 4. Instantly process upfront payment if checked in UI
//       if (initialPayment && initialPayment.amount > 0) {
//           initialPayment.paymentId = generateId('PAY');
//           initialPayment.memberId = memberData.memberId;
//           initialPayment.createdAt = now;
//           initialPayment.createdBy = userEmail;
//           initialPayment.updatedAt = now;
//           initialPayment.updatedBy = userEmail;
//           DB.create('PAYMENTS', initialPayment);
//       }
//     }
//     return { success: true, data: savedData, message: isNew ? "Member added successfully." : "Member updated successfully." };
//   } catch (error) {
//     return { success: false, error: error.toString() };
//   }
// }

function api_saveMember(memberData) {
  try {
    if (!memberData.fullName || !memberData.phone) throw new Error("Name and Phone are required.");
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
    console.log("ERROR ", { success: false, error: error.toString() })
    return { success: false, error: error.toString() };
  }
}

function api_getMemberPayments(memberId) {
  try {
    if (!memberId) throw new Error("Member ID is missing.");

    const dbData = DB.batchRead(['PAYMENTS', 'SETTINGS']);
    const allPayments = dbData['PAYMENTS'] || [];
    const settingsRows = dbData['SETTINGS'] || [];

    let accrualMode = 'anchor';
    const accSetting = settingsRows.find(s => {
      const k = String(s.key || s.setting || s.Name || '').toLowerCase();
      return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    if (accSetting) {
      accrualMode = String(accSetting.value || accSetting.Value || '').toLowerCase();
    }

    const memberPayments = allPayments.filter(p => p.memberId === memberId);

    // BACKEND MATH: Pre-calculate all years and modes based on Accrual Mode
    const chartMetrics = {};
    const ensureYear = (y) => {
      if (!chartMetrics[y]) chartMetrics[y] = { monthly: new Array(12).fill(0), quarterly: [0, 0, 0, 0], totalEarned: 0 };
    };

    const parseSafeDate = (dStr) => {
      if (!dStr) return new Date("");
      let d = new Date(dStr);
      if (isNaN(d) && typeof dStr === 'string') {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          const mMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
          d = new Date(parts[2], mMap[parts[1].toLowerCase()] || 0, parts[0]);
        }
      }
      return d;
    };

    memberPayments.forEach(p => {
      const status = String(p.paymentStatus || '').toLowerCase();
      if (status.includes('fail') || status.includes('pending') || status.includes('overdue') || status.includes('unpaid')) return;
      let totalAmt = Number(String(p.amount || 0).replace(/[^0-9.-]+/g, ""));
      let sDate = parseSafeDate(p.startDate || p.paidDate);
      let eDate = parseSafeDate(p.endDate || p.paidDate);

      if (isNaN(sDate)) return;

      // SMART ENGINE: Daily Proration Accrual Logic (GAAP Compliant)
      if (accrualMode === 'split' && !isNaN(eDate) && eDate >= sDate) {

        // Strip times to ensure pure date math
        const start = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
        const end = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());

        // Use UTC to prevent Daylight Saving Time from causing missing hours/days
        const msPerDay = 1000 * 60 * 60 * 24;
        const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
        const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

        // Total days inclusive (+1 day)
        let totalDays = Math.floor((utcEnd - utcStart) / msPerDay) + 1;
        if (totalDays <= 0) totalDays = 1; // Safeguard

        const dailyRate = totalAmt / totalDays;

        let current = new Date(start);

        while (current <= end) {
          let cYear = current.getFullYear();
          let cMonth = current.getMonth();

          // Find the last day of the current month being iterated
          let endOfMonth = new Date(cYear, cMonth + 1, 0);

          // The active interval ends at the end of the month, or the final end date (whichever is earlier)
          let intervalEnd = (end < endOfMonth) ? end : endOfMonth;

          let utcCurrent = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
          let utcIntervalEnd = Date.UTC(intervalEnd.getFullYear(), intervalEnd.getMonth(), intervalEnd.getDate());

          let daysInInterval = Math.floor((utcIntervalEnd - utcCurrent) / msPerDay) + 1;
          let intervalAmt = daysInInterval * dailyRate;

          ensureYear(cYear);
          chartMetrics[cYear].totalEarned += intervalAmt;
          chartMetrics[cYear].monthly[cMonth] += intervalAmt;
          chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += intervalAmt;

          // Jump to the 1st of the next month for the next loop iteration
          current = new Date(cYear, cMonth + 1, 1);
        }
      } else {
        // Anchor Logic (Cash Basis)
        let cYear = sDate.getFullYear();
        let cMonth = sDate.getMonth();

        ensureYear(cYear);
        chartMetrics[cYear].totalEarned += totalAmt;
        chartMetrics[cYear].monthly[cMonth] += totalAmt;
        chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += totalAmt;
      }
    });

    return { success: true, data: memberPayments, chartMetrics: chartMetrics };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_recordPayment(paymentData) {
  try {
    if (!paymentData.memberId || !paymentData.amount || !paymentData.paidDate || !paymentData.startDate || !paymentData.endDate) {
      throw new Error("Missing required payment details (Member ID, Amount, Paid Date, Start Date, and End Date are strictly required).");
    }

    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail();

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
    return { success: true, data: savedData, message: paymentData.paymentId ? "Payment updated successfully." : "Payment recorded successfully." };
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