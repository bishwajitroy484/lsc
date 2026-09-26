/**
 * API_Finance.gs
 * Dynamically aggregates real financial data with correct dropdown name resolution and dynamic greeting.
 */
function api_getDashboardMetrics(year = new Date().getFullYear().toString(), mode = 'Monthly', periods = []) {
  try {
    const targetYear = parseInt(year);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Add SETTINGS to the batch read
    const sheetNames = ['MEMBERS', 'PAYMENTS', 'EXPENSES', 'STAFF', 'SALARY', 'DROP_DOWN', 'SETTINGS'];
    const dbData = DB.batchRead(sheetNames);
    
    const members = dbData['MEMBERS'] || [];
    const payments = dbData['PAYMENTS'] || [];
    const expenses = dbData['EXPENSES'] || [];
    const staff = dbData['STAFF'] || [];
    const salaries = dbData['SALARY'] || [];
    const dropdownMeta = dbData['DROP_DOWN'] || [];
    const settingsRows = dbData['SETTINGS'] || [];
    
    // 2. Extract Accrual Mode from SETTINGS
    // Looks for a row where Key/Setting is 'Revenue_Recognition' (Values: 'Anchor' or 'Split')
    let accrualMode = 'anchor'; 
    const accSetting = settingsRows.find(s => {
        const k = String(s.key || s.setting || s.Name || '').toLowerCase();
        return k === 'revenue_recognition' || k === 'revenue recognition';
    });
    if (accSetting) {
        accrualMode = String(accSetting.value || accSetting.Value || '').toLowerCase();
    }

    const globalDataRes = api_getGlobalDropdowns();
    const dropDowns = globalDataRes.success ? globalDataRes.data.options : {};
    const resolveName = createDropdownResolver(dropdownMeta, dropDowns);

    let availableYears = new Set([today.getFullYear().toString()]);
    const trackYear = (dStr) => {
      const d = parseSafeDate(dStr);
      if(!isNaN(d)) availableYears.add(d.getFullYear().toString());
    };

    // 3. Pass the accrualMode into the financials processor
    const financialData = processFinancials(payments, expenses, salaries, targetYear, resolveName, trackYear, accrualMode);
    const operationalData = processOperations(members, staff, payments, targetYear, today, resolveName, trackYear, dropDowns);
    const chartMetrics = formatTimePeriods(financialData, operationalData, mode, periods, targetYear, today);

    // Dynamic Greeting Name Extraction based on Login Email
    const email = Session.getActiveUser().getEmail() || "User";
    const namePart = email.split('@')[0];
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();

    return {
      success: true,
      data: {
        userGreetingName: formattedName,
        availableYears: Array.from(availableYears).sort((a, b) => b - a),
        kpis: {
          activeMembers: operationalData.activeCount || 0,
          activeSegregation: operationalData.activeSegregation,
          staffCount: operationalData.staffCount || 0,
          membersCollected: chartMetrics.membersCollected || 0,
          overdueAmount: operationalData.snapOverdueAmt || 0,
          businessExpenses: (chartMetrics.totalOperatingExpenses - chartMetrics.staffCost) || 0,
          staffCost: chartMetrics.staffCost || 0,
          totalOperatingExpenses: chartMetrics.totalOperatingExpenses || 0,
          netInHand: (chartMetrics.membersCollected - chartMetrics.totalOperatingExpenses) || 0
        },
        charts: {
          categories: chartMetrics.filteredLabels,
          revenue: chartMetrics.filteredRev,
          expenses: chartMetrics.filteredExp,
          batchLabels: operationalData.batchLabels,
          batchData: operationalData.batchData,
          prediction: { actual: chartMetrics.actualNetArr, expected: chartMetrics.expectedNetArr },
          collectionTrend: { collected: chartMetrics.filteredRev, overdue: chartMetrics.filteredOverdue },
          expenseBreakdown: {
            series: financialData.expSeries,
            labels: financialData.expLabels,
            total: chartMetrics.totalOperatingExpenses || 0,
            miscSeries: financialData.mSeries,
            miscLabels: financialData.mLabels
          },
          staffTrend: chartMetrics.filteredStaff
        },
        overdue: operationalData.overdueList,
        upcoming: operationalData.upcomingList
      }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Robust dropdown resolver that handles ID-to-Name mapping safely across various schema structures.
 */
function createDropdownResolver(dropdownMetaRows, dropDownOptions) {
  const schemaMap = {}; 
  
  if (Array.isArray(dropdownMetaRows)) {
    dropdownMetaRows.forEach(row => {
      const schemaKey = row['Schema Key']; // e.g., 'membership', 'batch', 'expense'
      const usagesJson = row['Columns (JSON Usages (JSON))'];
      if (schemaKey && usagesJson) {
        try {
          const usages = JSON.parse(usagesJson);
          if (Array.isArray(usages)) {
            usages.forEach(usage => {
              if (usage.tab && usage.column) {
                schemaMap[`${usage.tab.toUpperCase()}_${usage.column}`] = schemaKey;
              }
            });
          }
        } catch (e) {}
      }
    });
  }

  return function(tabName, fieldName, id) {
    if (!id || id === 'N5A' || id === 'N/A') return 'Unknown';
    const cleanId = String(id).trim();
    
    const lookupKey = `${tabName.toUpperCase()}_${fieldName}`;
    const schemaKey = schemaMap[lookupKey] || fieldName;
    
    // Gather potential option lists from global dropdowns
    let optionsList = [];
    [schemaKey, schemaKey.toLowerCase(), fieldName, fieldName.toLowerCase()].forEach(key => {
      if (dropDownOptions[key] && Array.isArray(dropDownOptions[key])) {
        optionsList = optionsList.concat(dropDownOptions[key]);
      }
    });

    // If optionsList is still empty, search all keys in dropDownOptions globally
    if (!optionsList.length) {
      Object.keys(dropDownOptions).forEach(k => {
        if (Array.isArray(dropDownOptions[k])) {
          optionsList = optionsList.concat(dropDownOptions[k]);
        }
      });
    }

    if (!optionsList.length) return cleanId;
    
    // Search for a match by id, value, or code name
    const match = optionsList.find(item => {
      if (!item) return false;
      const itemId = String(item.id || item.value || item.code || '').trim();
      const itemName = String(item.name || item.label || '').trim();
      return itemId === cleanId || itemName === cleanId;
    });

    if (match) {
      return match.name || match.label || match.id || cleanId;
    }

    return cleanId;
  };
}

function processFinancials(payments, expenses, salaries, targetYear, resolveName, trackYear, accrualMode) {
  let revArr = new Array(12).fill(0);
  let expArr = new Array(12).fill(0);
  let staffArr = new Array(12).fill(0);    
  let catBreakdown = {};
  let miscBreakdown = {};

  // SMART ENGINE: Daily Proration Accrual Logic (GAAP Compliant)
  const distributeAmount = (sDateStr, eDateStr, fallbackDateStr, totalAmt, targetArr) => {
    trackYear(sDateStr || fallbackDateStr);
    distributeDailyProration(sDateStr, eDateStr, fallbackDateStr, totalAmt, accrualMode, (cYear, cMonth, intervalAmt) => {
      if (cYear === targetYear) {
        targetArr[cMonth] += intervalAmt;
      }
      trackYear(new Date(cYear, cMonth, 1).toISOString());
    });
  };

  payments.forEach(p => {
    if (!isSuccess(p.paymentStatus)) return;
    distributeAmount(p.startDate, p.endDate, p.paidDate, parseAmt(p.amount), revArr);
  });

  expenses.forEach(e => {
    const amt = parseAmt(e.amount);
    // Expenses usually just have a 'date', but if they have coverage dates, we can split them too!
    distributeAmount(e.startDate, e.endDate, e.date, amt, expArr);
    
    // For the Breakdown Donut Chart (Total counts mapped to target year by start date)
    const d = parseSafeDate(e.startDate || e.date);
    if (!isNaN(d) && d.getFullYear() === targetYear) {
      let cName = resolveName('EXPENSES', 'categoryId', e.categoryId);
      catBreakdown[cName] = (catBreakdown[cName] || 0) + amt;
      
      const cLower = String(cName).toLowerCase();
      if (cLower.includes('misc') || cLower.includes('other') || (e.whatMisc && String(e.whatMisc).trim() !== '')) {
        const detailLabel = (e.whatMisc && String(e.whatMisc).trim() !== '') ? String(e.whatMisc).trim() : 'Misc Expense';
        miscBreakdown[detailLabel] = (miscBreakdown[detailLabel] || 0) + amt;
      }
    }
  });

  salaries.forEach(s => {
    if (!isSuccess(s.paymentStatus)) return;
    const amt = parseAmt(s.amount);
    
    let tempArr = new Array(12).fill(0);
    distributeAmount(s.startDate, s.endDate, s.paidDate, amt, tempArr);
    
    // Add distributed salary to both Staff Cost trend and Overall Expenses
    for(let i=0; i<12; i++) {
        staffArr[i] += tempArr[i];
        expArr[i] += tempArr[i];
    }

    const d = parseSafeDate(s.startDate || s.paidDate);
    if (!isNaN(d) && d.getFullYear() === targetYear) {
      catBreakdown['Staff Cost'] = (catBreakdown['Staff Cost'] || 0) + amt;
    }
  });

  const expLabels = Object.keys(catBreakdown);
  const expSeries = safeNumArray(Object.values(catBreakdown));
  const mLabels = Object.keys(miscBreakdown);
  const mSeries = safeNumArray(Object.values(miscBreakdown));

  return { revArr, expArr, staffArr, expLabels, expSeries, mLabels, mSeries };
}

function processOperations(members, staff, payments, targetYear, today, resolveName, trackYear, dropDowns) {
  let activeCount = 0;
  let staffCount = 0;
  let batchCounts = {};
  let overdueList = [];
  let upcomingList = [];
  let snapOverdueAmt = 0; 
  let activeSegregation = {};
  let overdueArr = new Array(12).fill(0);

  // Pre-map payments by member for high-speed dynamic due date calculation
  const paymentsByMember = {};
  payments.forEach(p => {
    if (isSuccess(p.paymentStatus)) {
      if (!paymentsByMember[p.memberId]) paymentsByMember[p.memberId] = [];
      paymentsByMember[p.memberId].push(p);
    }
  });

  staff.forEach(s => {
    trackYear(s.joinDate);
    const sName = resolveName('STAFF', 'status', s.status).toLowerCase();
    if (!sName.includes('inactive') && !sName.includes('in-active') && !sName.includes('exit')) staffCount++;
  });

  const getBatchLabelWithGroup = (batchId) => {
    const batchOptions = dropDowns['batch'] || dropDowns['Batch_Options'] || [];
    const match = batchOptions.find(b => String(b.id).trim() === String(batchId).trim());
    const timeName = match ? (match.name || match.label) : resolveName('MEMBERS', 'batchId', batchId);
    const groupName = match ? (match.group || match.Group) : '';
    return groupName ? `${timeName} (${groupName})` : timeName;
  };

  members.forEach(m => {
    trackYear(m.joinDate);
    const statusName = resolveName('MEMBERS', 'status', m.status).toLowerCase();
    const isActive = !statusName.includes('inactive') && !statusName.includes('in-active') && !statusName.includes('exit');
    const amt = parseAmt(m.membershipAmount);
    
    if (isActive) {
      activeCount++;
      let bName = getBatchLabelWithGroup(m.batchId);
      batchCounts[bName] = (batchCounts[bName] || 0) + 1;

      const pName = resolveName('MEMBERS', 'membershipId', m.membershipId);
      activeSegregation[pName] = (activeSegregation[pName] || 0) + 1;
    }

    const joinDate = parseSafeDate(m.joinDate);
    if (!isNaN(joinDate) && amt > 0) {
       const planName = resolveName('MEMBERS', 'membershipId', m.membershipId).toLowerCase();
       let freqMonths = 1;
       if (planName.includes('year') || planName.includes('annual')) freqMonths = 12;
       else if (planName.includes('half')) freqMonths = 6;
       else if (planName.includes('quarter')) freqMonths = 3;

       let exitDate = new Date(today.getTime());
       if (!isActive && m.exitDate) {
           const ed = parseSafeDate(m.exitDate);
           if (!isNaN(ed)) exitDate = ed;
       }

       let mPayments = paymentsByMember[m.memberId] || [];
       let totalPaidByMember = mPayments.reduce((sum, p) => sum + parseAmt(p.amount), 0);

       // 1. Calculate precise NEXT DUE DATE perfectly synced with Members UI
       let actualNextDue = null;
       const isAdHocOrTrial = planName.includes('ad-hoc') || planName.includes('adhoc') || planName.includes('trial');
       
       if (mPayments.length > 0) {
           if (!isAdHocOrTrial) {
               mPayments.sort((a, b) => new Date(parseSafeDate(b.endDate || b.paidDate)) - new Date(parseSafeDate(a.endDate || a.paidDate)));
               const latestP = mPayments[0];
               if (latestP.endDate) {
                   let d = parseSafeDate(latestP.endDate);
                   if (!isNaN(d)) {
                       d.setDate(d.getDate() + 1);
                       actualNextDue = d;
                   }
               } else {
                   let baseD = parseSafeDate(latestP.paidDate || latestP.date || m.joinDate);
                   if (!isNaN(baseD)) {
                       let d = new Date(baseD);
                       d.setMonth(d.getMonth() + freqMonths);
                       actualNextDue = d;
                   }
               }
           }
       } else {
           if (!isNaN(joinDate)) actualNextDue = new Date(joinDate);
       }

       // 2. Simulate historical cycles to populate the Bar Chart accurately
       let cycleDate = new Date(joinDate);
       let totalUnpaidForMember = 0; 

       while (cycleDate <= exitDate) {
           const cYear = cycleDate.getFullYear();
           const cMonth = cycleDate.getMonth();
           let nextCycleDate = new Date(cycleDate);
           nextCycleDate.setMonth(nextCycleDate.getMonth() + freqMonths);

           let unpaidPortion = 0;
           if (totalPaidByMember >= amt) {
               totalPaidByMember -= amt;
           } else if (totalPaidByMember > 0) {
               unpaidPortion = amt - totalPaidByMember;
               totalPaidByMember = 0;
           } else {
               unpaidPortion = amt;
           }

           if (cYear === targetYear) {
               overdueArr[cMonth] += unpaidPortion;
           }

           let cycleDueDate = new Date(cycleDate);
           if (isActive && unpaidPortion > 0 && cycleDueDate < today) {
               totalUnpaidForMember += unpaidPortion;
               if (cYear === targetYear) snapOverdueAmt += unpaidPortion;
           }
           cycleDate = nextCycleDate;
       }
       
       // 3. Populate Dashboard Lists using the precise UI synced date
       if (isActive && actualNextDue && !isAdHocOrTrial) {
           const diffTime = actualNextDue.getTime() - today.getTime();
           const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
           const formattedDate = actualNextDue.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
           const pNameLabel = resolveName('MEMBERS', 'membershipId', m.membershipId);

           if (diffDays < 0) {
               // OVERDUE
               let displayAmt = totalUnpaidForMember > 0 ? totalUnpaidForMember : amt;
               overdueList.push({ 
                   memberId: m.memberId || '',
                   name: m.fullName || 'Unknown', 
                   plan: pNameLabel, 
                   amount: displayAmt, 
                   date: formattedDate, 
                   days: Math.abs(diffDays), // Convert negative to positive for display
                   status: 'text-red-600 bg-red-50 border-red-100' 
               });
           } else if (diffDays >= 0 && diffDays <= 7) {
               // UPCOMING (0 to 7 days from today)
               upcomingList.push({ 
                   memberId: m.memberId || '',
                   name: m.fullName || 'Unknown', 
                   plan: pNameLabel, 
                   amount: amt, 
                   date: formattedDate, 
                   days: diffDays, 
                   status: 'text-amber-600 bg-amber-50 border-amber-100' 
               });
           }
       }
    }
  });

  overdueList.sort((a, b) => b.days - a.days);
  upcomingList.sort((a, b) => a.days - b.days);

  const batchLabels = Object.keys(batchCounts);
  const batchData = safeNumArray(Object.values(batchCounts));

  return { activeCount, staffCount, batchLabels, batchData, overdueList, upcomingList, snapOverdueAmt, activeSegregation, overdueArr };
}

function formatTimePeriods(financialData, operationalData, mode, periods, targetYear, today) {
  const isQuarterly = mode === 'Quarterly';
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const quarterLabels = ['Q1 (JFM)', 'Q2 (AMJ)', 'Q3 (JAS)', 'Q4 (OND)'];
  
  let totalSlots = isQuarterly ? 4 : 12;
  let finalLabels = []; let finalRev = []; let finalExp = []; let finalStaff = []; let finalOverdue = [];

  if (isQuarterly) {
    for(let i = 0; i < totalSlots; i++) {
      finalLabels.push(quarterLabels[i]);
      finalRev.push((financialData.revArr[i*3]||0) + (financialData.revArr[i*3+1]||0) + (financialData.revArr[i*3+2]||0));
      finalExp.push((financialData.expArr[i*3]||0) + (financialData.expArr[i*3+1]||0) + (financialData.expArr[i*3+2]||0));
      finalStaff.push((financialData.staffArr[i*3]||0) + (financialData.staffArr[i*3+1]||0) + (financialData.staffArr[i*3+2]||0));
      finalOverdue.push((operationalData.overdueArr[i*3]||0) + (operationalData.overdueArr[i*3+1]||0) + (operationalData.overdueArr[i*3+2]||0));
    }
  } else {
    for(let i = 0; i < totalSlots; i++) {
      finalLabels.push(monthLabels[i]);
      finalRev.push(financialData.revArr[i]||0);
      finalExp.push(financialData.expArr[i]||0);
      finalStaff.push(financialData.staffArr[i]||0);
      finalOverdue.push(operationalData.overdueArr[i]||0);
    }
  }

  const filteredLabels = []; const filteredRev = []; const filteredExp = []; const filteredStaff = []; const filteredOverdue = [];
  const activePeriods = (periods && periods.length > 0) ? periods : finalLabels;
  
  finalLabels.forEach((lbl, idx) => {
    if (activePeriods.includes(lbl) || activePeriods.includes(lbl.split(' ')[0])) {
      filteredLabels.push(lbl); filteredRev.push(finalRev[idx]); filteredExp.push(finalExp[idx]);
      filteredStaff.push(finalStaff[idx]); filteredOverdue.push(finalOverdue[idx]);
    }
  });

  const membersCollected = filteredRev.reduce((a, b) => a + b, 0);
  const totalOperatingExpenses = filteredExp.reduce((a, b) => a + b, 0);
  const staffCost = filteredStaff.reduce((a, b) => a + b, 0);

  let actualNetArr = [];
  let expectedNetArr = [];
  const currentMIdx = today.getMonth();
  const currentQIdx = Math.floor(currentMIdx / 3);
  const elapsedBoundaryIdx = isQuarterly ? currentQIdx : currentMIdx;

  let elapsedRevSum = 0; 
  let elapsedExpSum = 0;
  let elapsedCount = 0;
  
  finalLabels.forEach((lbl, i) => {
     if (targetYear < today.getFullYear() || i <= elapsedBoundaryIdx) {
        elapsedRevSum += finalRev[i];
        elapsedExpSum += finalExp[i];
        elapsedCount++;
     }
  });
  
  // FIX 2: If there are NO active members left in the gym, projected future revenue drops to 0!
  const avgPeriodRev = (elapsedCount > 0 && operationalData.activeCount > 0) ? (elapsedRevSum / elapsedCount) : 0;
  const avgPeriodExp = elapsedCount > 0 ? (elapsedExpSum / elapsedCount) : 0;
  const avgPeriodNet = Number((avgPeriodRev - avgPeriodExp).toFixed(2));

  filteredLabels.forEach((lbl, finalIdx) => {
     const originalIdx = finalLabels.indexOf(lbl);
     const actualNet = Number((filteredRev[finalIdx] - filteredExp[finalIdx]).toFixed(2));
     
     if (targetYear === today.getFullYear() && originalIdx > elapsedBoundaryIdx) {
        actualNetArr.push(null);
        expectedNetArr.push(avgPeriodNet);
     } else if (targetYear > today.getFullYear()) {
        actualNetArr.push(null);
        expectedNetArr.push(avgPeriodNet);
     } else {
        actualNetArr.push(actualNet || 0);
        expectedNetArr.push(originalIdx === elapsedBoundaryIdx ? (actualNet || 0) : null);
     }
  });

  return {
    filteredLabels,
    filteredRev: safeNumArray(filteredRev),
    filteredExp: safeNumArray(filteredExp),
    filteredStaff: safeNumArray(filteredStaff),
    filteredOverdue: safeNumArray(filteredOverdue),
    actualNetArr: safeNumArray(actualNetArr),
    expectedNetArr: safeNumArray(expectedNetArr),
    membersCollected,
    totalOperatingExpenses,
    staffCost
  };
}

function safeNumArray(arr) { 
  return arr.map(v => (isNaN(v) || v == null) ? 0 : Number(Number(v).toFixed(2))); 
}

function parseAmt(val) { return Number(String(val).replace(/[^0-9.-]+/g, "")) || 0; }
function isSuccess(statusStr) { const s = (String(statusStr) || '').toLowerCase(); return !s.includes('fail') && !s.includes('pending'); }
