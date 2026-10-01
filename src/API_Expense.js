/**
 * API_Expenses.gs
 * Handles server-side operations for the Expenses module.
 */

function api_getExpenses() {
  try {
    const gate = requirePermission_('expenses', 'view');
    if (!gate.ok) return gate.response;
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
      salaries.forEach(function(t) {
        var status = String(t.paymentStatus || '').toLowerCase();
        if (status.includes('fail') || status.includes('pending') || status.includes('action')) return;

        var totalAmt = Number(String(t.amount || 0).replace(/[^0-9.-]+/g, ""));
        if (!totalAmt || isNaN(totalAmt)) return;

        distributeDailyProration(t.startDate || t.paidDate, t.endDate || t.paidDate, t.paidDate, totalAmt, accrualMode, function(cYear, cMonth, intervalAmt) {
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
      accrualMode: accrualMode,
      currencyFormat: currencyFormat
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_saveExpense(expenseData) {
  try {
    const isNewGate = !(expenseData && expenseData.expenseId);
    const gate = requirePermission_('expenses', isNewGate ? 'create' : 'edit');
    if (!gate.ok) return gate.response;
    if (!expenseData.categoryId || !expenseData.amount || !expenseData.date) {
      throw new Error("Category, Amount, and Date are required.");
    }

    var now = new Date().toISOString();
    var userEmail = Session.getActiveUser().getEmail(); 
    
    expenseData.updatedAt = now;
    expenseData.updatedBy = userEmail;

    var isNew = !expenseData.expenseId;
    if (isNew) {
      expenseData.expenseId = generateId('EXP');
      expenseData.createdAt = now;
      expenseData.createdBy = userEmail;
    }

    // Handle receipt image upload — use expenseId as filename (matches Members pattern)
    if (expenseData.base64Image) {
      var uploadRes = api_uploadImageToDrive(expenseData.base64Image, expenseData.expenseId);
      if (uploadRes.success) {
        expenseData.receiptFileId = uploadRes.fileId;
      } else {
        throw new Error("Receipt Upload Failed: " + uploadRes.error);
      }
    }

    // Clean transient upload fields before saving to DB
    delete expenseData.base64Image;
    delete expenseData.imageName;
    
    var savedData;
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
    const gate = requirePermission_('expenses', 'delete');
    if (!gate.ok) return gate.response;
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