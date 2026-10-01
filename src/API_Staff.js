/**
 * API_Staff.gs
 * Handles server-side operations for the Staff module with Accrual Accounting support.
 */

function api_getStaff(authToken) {
  try {
    requireApiAccess_(authToken);
    const dbData = DB.batchRead(['STAFF', 'SALARY', 'SETTINGS']);
    const staff = dbData['STAFF'] || [];
    const payments = dbData['SALARY'] || [];
    const settingsRows = dbData['SETTINGS'] || [];

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

    // GLOBAL BACKEND MATH: Pre-calculate all staff costs based on Accrual Mode
    const chartMetrics = {}; 
    const ensureYear = (y) => {
        if (!chartMetrics[y]) chartMetrics[y] = { monthly: new Array(12).fill(0), quarterly: [0, 0, 0, 0], totalCost: 0 };
    };

    payments.forEach(t => {
        const status = String(t.paymentStatus || '').toLowerCase();
        if (status.includes('fail') || status.includes('pending')) return;

        let totalAmt = Number(String(t.amount || 0).replace(/[^0-9.-]+/g,""));
        if (!totalAmt) return;

        distributeDailyProration(t.startDate || t.paidDate, t.endDate || t.paidDate, t.paidDate, totalAmt, accrualMode, (cYear, cMonth, intervalAmt) => {
            ensureYear(cYear);
            chartMetrics[cYear].totalCost += intervalAmt;
            chartMetrics[cYear].monthly[cMonth] += intervalAmt;
            chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += intervalAmt;
        });
    });

    return { 
      success: true, 
      data: { staff: staff, payments: payments }, 
      chartMetrics: chartMetrics, 
      accrualMode: accrualMode,
      currencyFormat: currencyFormat
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_saveStaff(staffData, authToken) {
  try {
    requireApiAccess_(authToken);
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

function api_deleteStaff(staffId, authToken) {
  try {
    requireApiAccess_(authToken);
    if (!staffId) throw new Error("Staff ID is missing.");
    DB.remove('STAFF', staffId);
    return { success: true, message: "Staff member deleted successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// --- Staff Payments & Transactions (SALARY Sheet) ---

function api_getStaffTransactions(staffId, authToken) {
  try {
    requireApiAccess_(authToken);
    if (!staffId) throw new Error("Staff ID is missing.");
    
    // Batch read and pull settings for individual staff charts
    const dbData = DB.batchRead(['SALARY', 'SETTINGS']);
    const allTxn = dbData['SALARY'] || [];
    const settingsRows = dbData['SETTINGS'] || [];
    
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

    const staffTxn = allTxn.filter(t => t.staffId === staffId);
    
    // BACKEND MATH: Pre-calculate all years and modes based on Accrual Mode
    const chartMetrics = {}; 
    const ensureYear = (y) => {
        if (!chartMetrics[y]) chartMetrics[y] = { monthly: new Array(12).fill(0), quarterly: [0, 0, 0, 0], totalEarned: 0 };
    };

    staffTxn.forEach(t => {
        const status = String(t.paymentStatus || '').toLowerCase();
        if (status.includes('fail') || status.includes('pending')) return;

        let totalAmt = Number(String(t.amount || 0).replace(/[^0-9.-]+/g,""));
        if (!totalAmt) return;

        distributeDailyProration(t.startDate || t.paidDate, t.endDate || t.paidDate, t.paidDate, totalAmt, accrualMode, (cYear, cMonth, intervalAmt) => {
            ensureYear(cYear);
            chartMetrics[cYear].totalEarned += intervalAmt;
            chartMetrics[cYear].monthly[cMonth] += intervalAmt;
            chartMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += intervalAmt;
        });
    });

    return { success: true, data: staffTxn, chartMetrics: chartMetrics, accrualMode: accrualMode, currencyFormat: currencyFormat };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_recordStaffTransaction(txnData, authToken) {
  try {
    requireApiAccess_(authToken);
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

function api_deleteStaffTransaction(paymentId, authToken) {
  try {
    requireApiAccess_(authToken);
    if (!paymentId) throw new Error("Payment ID is missing.");
    DB.remove('SALARY', paymentId);
    return { success: true, message: "Transaction deleted successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}