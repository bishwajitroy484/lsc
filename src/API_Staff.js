/**
 * API_Staff.gs
 * Handles server-side operations for the Staff module with Accrual Accounting support.
 */

function api_getStaff() {
  try {
    const dbData = DB.batchRead(['STAFF', 'SALARY', 'SETTINGS']);
    const staff = dbData['STAFF'] || [];
    const payments = dbData['SALARY'] || [];
    const settingsRows = dbData['SETTINGS'] || [];

    let accrualMode = 'anchor';
    const accSetting = settingsRows.find(s => {
        const k = String(s.key || s.setting || s.Name || '').toLowerCase();
        return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    
    if (accSetting) {
        accrualMode = String(accSetting.value || accSetting.Value || '').toLowerCase();
    }

    // GLOBAL BACKEND MATH: Pre-calculate all staff costs based on Accrual Mode
    const chartMetrics = {}; 
    const ensureYear = (y) => {
        if (!chartMetrics[y]) chartMetrics[y] = { monthly: new Array(12).fill(0), quarterly: [0, 0, 0, 0], totalCost: 0 };
    };

    const parseSafeDate = (dStr) => {
        if (!dStr) return new Date("");
        let d = new Date(dStr);
        if (isNaN(d) && typeof dStr === 'string') {
          const parts = dStr.split('-');
          if (parts.length === 3) {
            const mMap = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11};
            d = new Date(parts[2], mMap[parts[1].toLowerCase()] || 0, parts[0]);
          }
        }
        return d;
    };

    payments.forEach(t => {
        const status = String(t.paymentStatus || '').toLowerCase();
        if (status.includes('fail') || status.includes('pending')) return;

        let totalAmt = Number(String(t.amount || 0).replace(/[^0-9.-]+/g,""));
        let sDate = parseSafeDate(t.startDate || t.paidDate);
        let eDate = parseSafeDate(t.endDate || t.paidDate);

        if (isNaN(sDate)) return;

        if (accrualMode === 'split' && !isNaN(eDate) && eDate >= sDate) {
            let monthsSpan = (eDate.getFullYear() - sDate.getFullYear()) * 12 + eDate.getMonth() - sDate.getMonth() + 1;
            monthsSpan = monthsSpan > 0 ? monthsSpan : 1; 
            let splitAmt = totalAmt / monthsSpan;
            
            for(let i = 0; i < monthsSpan; i++) {
                let cMonth = (sDate.getMonth() + i) % 12;
                let cYear = sDate.getFullYear() + Math.floor((sDate.getMonth() + i) / 12);
                
                ensureYear(cYear);
                chartMetrics[cYear].totalCost += splitAmt;
                chartMetrics[cYear].monthly[cMonth] += splitAmt;
                chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += splitAmt;
            }
        } else {
            // Anchor Logic
            let cYear = sDate.getFullYear();
            let cMonth = sDate.getMonth();
            
            ensureYear(cYear);
            chartMetrics[cYear].totalCost += totalAmt;
            chartMetrics[cYear].monthly[cMonth] += totalAmt;
            chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += totalAmt;
        }
    });

    return { 
      success: true, 
      data: { staff: staff, payments: payments }, 
      chartMetrics: chartMetrics, 
      accrualMode: accrualMode 
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_saveStaff(staffData) {
  try {
    if (!staffData.fullName || !staffData.phone) throw new Error("Name and Phone are required.");
    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail(); 
    
    if (!staffData.reportingTo || String(staffData.reportingTo).trim() === '') {
       staffData.reportingTo = 'Admin';
    }

    staffData.updatedAt = now;
    staffData.updatedBy = userEmail;
    
    let savedData;
    if (staffData.staffId) {
      savedData = DB.update('STAFF', staffData.staffId, staffData);
    } else {
      staffData.staffId = generateId('STF');
      staffData.createdAt = now;
      staffData.createdBy = userEmail;
      if (!staffData.status) staffData.status = 'SAT-1'; 
      savedData = DB.create('STAFF', staffData);
    }
    return { success: true, data: savedData, message: staffData.staffId ? "Staff updated successfully" : "Staff added successfully" };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_deleteStaff(staffId) {
  try {
    if (!staffId) throw new Error("Staff ID is missing.");
    DB.remove('STAFF', staffId);
    return { success: true, message: "Staff member deleted successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// --- Staff Payments & Transactions (SALARY Sheet) ---

function api_getStaffTransactions(staffId) {
  try {
    if (!staffId) throw new Error("Staff ID is missing.");
    
    // Batch read and pull settings for individual staff charts
    const dbData = DB.batchRead(['SALARY', 'SETTINGS']);
    const allTxn = dbData['SALARY'] || [];
    const settingsRows = dbData['SETTINGS'] || [];
    
    let accrualMode = 'anchor';
    const accSetting = settingsRows.find(s => {
        const k = String(s.key || s.setting || s.Name || '').toLowerCase();
        return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    if (accSetting) {
        accrualMode = String(accSetting.value || accSetting.Value || '').toLowerCase();
    }

    const staffTxn = allTxn.filter(t => t.staffId === staffId);
    
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
            const mMap = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11};
            d = new Date(parts[2], mMap[parts[1].toLowerCase()] || 0, parts[0]);
          }
        }
        return d;
    };

    staffTxn.forEach(t => {
        const status = String(t.paymentStatus || '').toLowerCase();
        if (status.includes('fail') || status.includes('pending')) return;

        let totalAmt = Number(String(t.amount || 0).replace(/[^0-9.-]+/g,""));
        let sDate = parseSafeDate(t.startDate || t.paidDate);
        let eDate = parseSafeDate(t.endDate || t.paidDate);

        if (isNaN(sDate)) return;

        if (accrualMode === 'split' && !isNaN(eDate) && eDate >= sDate) {
            let monthsSpan = (eDate.getFullYear() - sDate.getFullYear()) * 12 + eDate.getMonth() - sDate.getMonth() + 1;
            monthsSpan = monthsSpan > 0 ? monthsSpan : 1; 
            let splitAmt = totalAmt / monthsSpan;
            
            for(let i = 0; i < monthsSpan; i++) {
                let cMonth = (sDate.getMonth() + i) % 12;
                let cYear = sDate.getFullYear() + Math.floor((sDate.getMonth() + i) / 12);
                
                ensureYear(cYear);
                chartMetrics[cYear].totalEarned += splitAmt;
                chartMetrics[cYear].monthly[cMonth] += splitAmt;
                chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += splitAmt;
            }
        } else {
            // Anchor Logic
            let cYear = sDate.getFullYear();
            let cMonth = sDate.getMonth();
            
            ensureYear(cYear);
            chartMetrics[cYear].totalEarned += totalAmt;
            chartMetrics[cYear].monthly[cMonth] += totalAmt;
            chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += totalAmt;
        }
    });

    return { success: true, data: staffTxn, chartMetrics: chartMetrics };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_recordStaffTransaction(txnData) {
  try {
    if (!txnData.staffId || !txnData.amount || !txnData.paidDate || !txnData.startDate || !txnData.endDate) {
      throw new Error("Staff ID, Amount, Paid Date, Start Date, and End Date are strictly required for accurate expense tracking.");
    }

    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail(); 
    
    txnData.updatedAt = now;
    txnData.updatedBy = userEmail;
    
    let savedData;
    if (txnData.paymentId) {
      savedData = DB.update('SALARY', txnData.paymentId, txnData);
    } else {
      txnData.paymentId = generateId('SAL');
      txnData.createdAt = now;
      txnData.createdBy = userEmail;
      savedData = DB.create('SALARY', txnData);
    }
    return { success: true, data: savedData, message: txnData.paymentId ? "Transaction updated successfully" : "Transaction recorded successfully" };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_deleteStaffTransaction(paymentId) {
  try {
    if (!paymentId) throw new Error("Payment ID is missing.");
    DB.remove('SALARY', paymentId);
    return { success: true, message: "Transaction deleted successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}