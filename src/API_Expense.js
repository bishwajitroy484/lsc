/**
 * API_Expenses.gs
 * Handles server-side operations for the Expenses module.
 */

function api_getExpenses() {
  try {
    let dbData;
    try {
      dbData = DB.batchRead(['EXPENSES', 'SALARY', 'SETTINGS']);
    } catch (e) {
      dbData = {
        'EXPENSES': DB.read('EXPENSES') || [],
        'SALARY': DB.read('SALARY') || [],
        'SETTINGS': DB.read('SETTINGS') || []
      };
    }
    const expenses = dbData['EXPENSES'] || [];
    const salaries = dbData['SALARY'] || [];
    const settingsRows = dbData['SETTINGS'] || [];

    let accrualMode = 'anchor';
    const accSetting = settingsRows.find(s => {
      const k = String(s.key || s.setting || s.Name || '').toLowerCase();
      return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    if (accSetting) {
      accrualMode = String(accSetting.value || accSetting.Value || '').toLowerCase();
    }

    const staffMetrics = {};
    const ensureYear = (y) => {
      if (!staffMetrics[y]) {
        staffMetrics[y] = {
          monthly: new Array(12).fill(0),
          quarterly: [0, 0, 0, 0],
          totalCost: 0
        };
      }
    };

    try {
      salaries.forEach(t => {
        const status = String(t.paymentStatus || '').toLowerCase();
        if (status.includes('fail') || status.includes('pending') || status.includes('action')) return;

        let totalAmt = Number(String(t.amount || 0).replace(/[^0-9.-]+/g, ""));
        if (!totalAmt || isNaN(totalAmt)) return;

        distributeDailyProration(t.startDate || t.paidDate, t.endDate || t.paidDate, t.paidDate, totalAmt, accrualMode, (cYear, cMonth, intervalAmt) => {
          ensureYear(cYear);
          staffMetrics[cYear].totalCost += intervalAmt;
          staffMetrics[cYear].monthly[cMonth] += intervalAmt;
          staffMetrics[cYear].quarterly[Math.floor(cMonth / 3)] += intervalAmt;
        });
      });
    } catch (salErr) {
      console.error("Salary proration error in api_getExpenses:", salErr);
    }

    return {
      success: true,
      data: expenses,
      salaries: salaries,
      staffMetrics: staffMetrics,
      accrualMode: accrualMode
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_saveExpense(expenseData) {
  try {
    if (!expenseData.categoryId || !expenseData.amount || !expenseData.date) {
      throw new Error("Category, Amount, and Date are required.");
    }

    const now = new Date().toISOString();
    const userEmail = Session.getActiveUser().getEmail(); 
    
    expenseData.updatedAt = now;
    expenseData.updatedBy = userEmail;

    let isNew = !expenseData.expenseId;
    if (isNew) {
      expenseData.expenseId = generateId('EXP');
      expenseData.createdAt = now;
      expenseData.createdBy = userEmail;
    }

    // Handle receipt image upload intercept if base64Image is provided
    if (expenseData.base64Image) {
      const filename = expenseData.expenseId + '_' + (expenseData.imageName || 'receipt.png');
      const uploadRes = api_uploadImageToDrive(expenseData.base64Image, filename);
      if (uploadRes.success) {
        expenseData.receiptUrl = uploadRes.url || uploadRes.fileId;
      } else {
        throw new Error("Receipt Upload Failed: " + uploadRes.error);
      }
    }

    // Clean payload before saving to DB
    delete expenseData.base64Image;
    delete expenseData.imageName;
    delete expenseData.notes;
    
    let savedData;
    if (!isNew) {
      savedData = DB.update('EXPENSES', expenseData.expenseId, expenseData);
    } else {
      savedData = DB.create('EXPENSES', expenseData);
    }
    
    return { 
      success: true, 
      data: savedData, 
      message: !isNew ? "Expense updated successfully." : "Expense added successfully." 
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_deleteExpense(expenseId) {
  try {
    if (!expenseId) throw new Error("Expense ID is missing.");
    DB.remove('EXPENSES', expenseId);
    return { success: true, message: "Expense deleted successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    api_getExpenses,
    api_saveExpense,
    api_deleteExpense
  };
}