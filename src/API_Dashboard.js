/**
 * API_Finance.gs
 * Dynamically aggregates real financial data with correct dropdown name resolution and dynamic greeting.
 */
function api_getAvailableYears() {
  try {
    const dbData = DB.batchRead(['MEMBERS', 'PAYMENTS', 'EXPENSES', 'STAFF', 'SALARY']);
    const datesBySheet = {
      MEMBERS: ['joinDate'],
      PAYMENTS: ['startDate', 'endDate', 'paidDate', 'date'],
      EXPENSES: ['startDate', 'endDate', 'date'],
      STAFF: ['joinDate'],
      SALARY: ['startDate', 'endDate', 'paidDate', 'date']
    };
    const years = new Set([String(new Date().getFullYear())]);

    Object.keys(datesBySheet).forEach(sheetName => {
      (dbData[sheetName] || []).forEach(record => {
        datesBySheet[sheetName].forEach(field => {
          const date = parseSafeDate(record[field]);
          if (!isNaN(date)) years.add(String(date.getFullYear()));
        });
      });
    });

    return { success: true, data: Array.from(years).sort((a, b) => Number(b) - Number(a)) };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

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

    const globalDataRes = api_getGlobalDropdowns && api_getGlobalDropdowns();
    const dropDowns = (globalDataRes && globalDataRes.success && globalDataRes.data && globalDataRes.data.options)
      ? globalDataRes.data.options
      : {};
    const resolveName = createDropdownResolver(dropdownMeta, dropDowns);

    // 3. Pass the accrualMode into the financials processor
    const financialData = processFinancials(payments, expenses, salaries, targetYear, resolveName, accrualMode);
    const expenseAverages = calculateMonthlyExpenseAverages(expenses, salaries, resolveName, accrualMode, today);
    const operationalData = processOperations(members, staff, payments, targetYear, today, resolveName, dropDowns, accrualMode);
    let actualAnchor = null;
    if (targetYear > today.getFullYear()) {
      const currentYearFinancials = processFinancials(payments, expenses, salaries, today.getFullYear(), resolveName, accrualMode);
      const currentMonth = today.getMonth();
      actualAnchor = Number(((currentYearFinancials.revArr[currentMonth] || 0) - (currentYearFinancials.expArr[currentMonth] || 0)).toFixed(2));
    }
    const chartMetrics = formatTimePeriods(financialData, operationalData, mode, periods, targetYear, today, expenseAverages, actualAnchor);
    const expenseBreakdown = formatExpenseBreakdown(financialData, mode, periods);

    // Dynamic Greeting Name Extraction based on Login Email
    const email = Session.getActiveUser().getEmail() || "User";
    const namePart = email.split('@')[0];
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();

    return {
      success: true,
      data: {
        userGreetingName: formattedName,
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
          prediction: {
            categories: chartMetrics.predictionLabels,
            actual: chartMetrics.actualNetArr,
            expected: chartMetrics.expectedNetArr,
            transitionIndex: chartMetrics.transitionIndex
          },
          collectionTrend: { collected: chartMetrics.filteredRev, overdue: chartMetrics.filteredOverdue },
          expenseBreakdown: {
            series: expenseBreakdown.series,
            labels: expenseBreakdown.labels,
            total: chartMetrics.totalOperatingExpenses || 0,
            miscSeries: expenseBreakdown.miscSeries,
            miscLabels: expenseBreakdown.miscLabels
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

function processFinancials(payments, expenses, salaries, targetYear, resolveName, accrualMode) {
  let revArr = new Array(12).fill(0);
  let expArr = new Array(12).fill(0);
  let staffArr = new Array(12).fill(0);    
  let catBreakdownByMonth = {};
  let miscBreakdownByMonth = {};

  // SMART ENGINE: Daily Proration Accrual Logic (GAAP Compliant)
  const distributeAmount = (sDateStr, eDateStr, fallbackDateStr, totalAmt, targetArr) => {
    distributeDailyProration(sDateStr, eDateStr, fallbackDateStr, totalAmt, accrualMode, (cYear, cMonth, intervalAmt) => {
      if (cYear === targetYear) {
        targetArr[cMonth] += intervalAmt;
      }
    });
  };
  const addBreakdownAmount = (breakdown, label, startDate, endDate, fallbackDate, amount) => {
    if (!breakdown[label]) breakdown[label] = new Array(12).fill(0);
    distributeAmount(startDate, endDate, fallbackDate, amount, breakdown[label]);
  };

  payments.forEach(p => {
    if (!isSuccess(resolveName('PAYMENTS', 'paymentStatus', p.paymentStatus))) return;
    distributeAmount(p.startDate, p.endDate, p.paidDate, parseAmt(p.amount), revArr);
  });

  expenses.forEach(e => {
    const amt = parseAmt(e.amount);
    // Expenses usually just have a 'date', but if they have coverage dates, we can split them too!
    distributeAmount(e.startDate, e.endDate, e.date, amt, expArr);
    
    const cName = resolveName('EXPENSES', 'categoryId', e.categoryId);
    addBreakdownAmount(catBreakdownByMonth, cName, e.startDate, e.endDate, e.date, amt);

    const cLower = String(cName).toLowerCase();
    if (cLower.includes('misc') || cLower.includes('other') || (e.whatMisc && String(e.whatMisc).trim() !== '')) {
      const detailLabel = (e.whatMisc && String(e.whatMisc).trim() !== '') ? String(e.whatMisc).trim() : 'Misc Expense';
      addBreakdownAmount(miscBreakdownByMonth, detailLabel, e.startDate, e.endDate, e.date, amt);
    }
  });

  salaries.forEach(s => {
    if (!isSuccess(resolveName('SALARY', 'paymentStatus', s.paymentStatus))) return;
    const amt = parseAmt(s.amount);
    
    let tempArr = new Array(12).fill(0);
    distributeAmount(s.startDate, s.endDate, s.paidDate, amt, tempArr);
    
    // Add distributed salary to both Staff Cost trend and Overall Expenses
    for(let i=0; i<12; i++) {
        staffArr[i] += tempArr[i];
        expArr[i] += tempArr[i];
    }

    addBreakdownAmount(catBreakdownByMonth, 'Staff Cost', s.startDate, s.endDate, s.paidDate, amt);
  });

  return { revArr, expArr, staffArr, catBreakdownByMonth, miscBreakdownByMonth };
}

function formatExpenseBreakdown(financialData, mode, periods) {
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const quarterLabels = ['Q1 (JFM)', 'Q2 (AMJ)', 'Q3 (JAS)', 'Q4 (OND)'];
  const isQuarterly = mode === 'Quarterly';
  const availablePeriods = isQuarterly ? quarterLabels : monthLabels;
  const activePeriods = periods && periods.length > 0 ? periods : availablePeriods;
  const selectedMonths = [];

  availablePeriods.forEach((period, periodIndex) => {
    if (!activePeriods.includes(period) && !activePeriods.includes(period.split(' ')[0])) return;
    if (isQuarterly) {
      selectedMonths.push(periodIndex * 3, periodIndex * 3 + 1, periodIndex * 3 + 2);
    } else {
      selectedMonths.push(periodIndex);
    }
  });

  const aggregateByPeriod = breakdownByMonth => {
    const labels = [];
    const series = [];
    Object.keys(breakdownByMonth).forEach(label => {
      const total = safeNumArray([
        selectedMonths.reduce((sum, monthIndex) => sum + (breakdownByMonth[label][monthIndex] || 0), 0)
      ])[0];
      if (total !== 0) {
        labels.push(label);
        series.push(total);
      }
    });
    return { labels, series };
  };

  const categories = aggregateByPeriod(financialData.catBreakdownByMonth);
  const misc = aggregateByPeriod(financialData.miscBreakdownByMonth);
  return {
    labels: categories.labels,
    series: categories.series,
    miscLabels: misc.labels,
    miscSeries: misc.series
  };
}

function calculateMonthlyExpenseAverages(expenses, salaries, resolveName, accrualMode, today) {
  const monthStart = new Date(today.getFullYear(), today.getMonth() - 12, 1);
  const operatingByMonth = new Array(12).fill(0);
  const staffByMonth = new Array(12).fill(0);

  const addToHistory = (startDate, endDate, fallbackDate, amount, target) => {
    distributeDailyProration(startDate, endDate, fallbackDate, amount, accrualMode, (year, month, intervalAmount) => {
      const monthIndex = (year - monthStart.getFullYear()) * 12 + month - monthStart.getMonth();
      if (monthIndex >= 0 && monthIndex < 12) target[monthIndex] += intervalAmount;
    });
  };

  expenses.forEach(expense => {
    addToHistory(expense.startDate, expense.endDate, expense.date, parseAmt(expense.amount), operatingByMonth);
  });
  salaries.forEach(salary => {
    if (!isSuccess(resolveName('SALARY', 'paymentStatus', salary.paymentStatus))) return;
    addToHistory(salary.startDate, salary.endDate, salary.paidDate, parseAmt(salary.amount), staffByMonth);
  });

  return {
    operating: operatingByMonth.reduce((total, amount) => total + amount, 0) / 12,
    staff: staffByMonth.reduce((total, amount) => total + amount, 0) / 12
  };
}

function addCalendarMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function processOperations(members, staff, payments, targetYear, today, resolveName, dropDowns, accrualMode) {
  let activeCount = 0;
  let staffCount = 0;
  let batchCounts = {};
  let overdueList = [];
  let upcomingList = [];
  let snapOverdueAmt = 0; 
  let activeSegregation = {};
  let overdueArr = new Array(12).fill(0);
  let expectedCollectionArr = new Array(12).fill(0);

  // Pre-map payments by member for high-speed dynamic due date calculation
  const paymentsByMember = {};
  payments.forEach(p => {
    if (isSuccess(resolveName('PAYMENTS', 'paymentStatus', p.paymentStatus))) {
      if (!paymentsByMember[p.memberId]) paymentsByMember[p.memberId] = [];
      paymentsByMember[p.memberId].push(p);
    }
  });

  staff.forEach(s => {
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
    let mPayments = paymentsByMember[m.memberId] || [];
    if (amt > 0 || mPayments.length > 0) {
       const planOption = (dropDowns.membership || dropDowns.Membership || []).find(option =>
         String(option.id || option.value || option.code || '').trim() === String(m.membershipId || '').trim()
       );
       const planName = resolveName('MEMBERS', 'membershipId', m.membershipId).toLowerCase();
       const planFrequency = String(planOption && (planOption.frequency || planOption.Frequency) || '').toLowerCase();
       const planDetails = `${planName} ${planFrequency}`;
       let freqMonths = 1;
       if (planDetails.includes('year') || planDetails.includes('annual')) freqMonths = 12;
       else if (planDetails.includes('half')) freqMonths = 6;
       else if (planDetails.includes('quarter')) freqMonths = 3;

       let exitDate = new Date(today.getTime());
       if (!isActive && m.exitDate) {
           const ed = parseSafeDate(m.exitDate);
           if (!isNaN(ed)) exitDate = ed;
       }

       let totalPaidByMember = mPayments.reduce((sum, p) => sum + parseAmt(p.amount), 0);

       // 1. Calculate precise NEXT DUE DATE perfectly synced with Members UI
       let actualNextDue = null;
       const isAdHocOrTrial = planDetails.includes('ad-hoc') || planDetails.includes('adhoc') || planDetails.includes('trial');
       
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

       const latestPaymentAmount = mPayments.length ? parseAmt(mPayments[0].amount) : 0;
       const expectedPaymentAmount = amt || latestPaymentAmount;
       if (isActive && !isAdHocOrTrial && expectedPaymentAmount > 0 && actualNextDue && actualNextDue >= today) {
           const firstDueDate = new Date(actualNextDue);
           const targetYearEnd = new Date(targetYear, 11, 31, 23, 59, 59, 999);
           let billingNumber = 0;
           while (true) {
               const dueDate = addCalendarMonths(firstDueDate, freqMonths * billingNumber);
               if (dueDate > targetYearEnd) break;
               const coverageEnd = addCalendarMonths(dueDate, freqMonths);
               coverageEnd.setDate(coverageEnd.getDate() - 1);
               distributeDailyProration(dueDate, coverageEnd, dueDate, expectedPaymentAmount, accrualMode, (year, month, intervalAmount) => {
                   if (year === targetYear) expectedCollectionArr[month] += intervalAmount;
               });
               billingNumber++;
           }
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

  return { activeCount, staffCount, batchLabels, batchData, overdueList, upcomingList, snapOverdueAmt, activeSegregation, overdueArr, expectedCollectionArr };
}

function formatTimePeriods(financialData, operationalData, mode, periods, targetYear, today, expenseAverages, actualAnchor) {
  const isQuarterly = mode === 'Quarterly';
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const quarterLabels = ['Q1 (JFM)', 'Q2 (AMJ)', 'Q3 (JAS)', 'Q4 (OND)'];
  
  let totalSlots = isQuarterly ? 4 : 12;
  let finalLabels = []; let finalRev = []; let finalExp = []; let finalStaff = []; let finalOverdue = [];
  let finalExpectedCollections = []; let finalExpectedExpenses = [];

  if (isQuarterly) {
    for(let i = 0; i < totalSlots; i++) {
      finalLabels.push(quarterLabels[i]);
      finalRev.push((financialData.revArr[i*3]||0) + (financialData.revArr[i*3+1]||0) + (financialData.revArr[i*3+2]||0));
      finalExp.push((financialData.expArr[i*3]||0) + (financialData.expArr[i*3+1]||0) + (financialData.expArr[i*3+2]||0));
      finalStaff.push((financialData.staffArr[i*3]||0) + (financialData.staffArr[i*3+1]||0) + (financialData.staffArr[i*3+2]||0));
      finalOverdue.push((operationalData.overdueArr[i*3]||0) + (operationalData.overdueArr[i*3+1]||0) + (operationalData.overdueArr[i*3+2]||0));
      finalExpectedCollections.push((operationalData.expectedCollectionArr[i*3]||0) + (operationalData.expectedCollectionArr[i*3+1]||0) + (operationalData.expectedCollectionArr[i*3+2]||0));
      finalExpectedExpenses.push((expenseAverages.operating + expenseAverages.staff) * 3);
    }
  } else {
    for(let i = 0; i < totalSlots; i++) {
      finalLabels.push(monthLabels[i]);
      finalRev.push(financialData.revArr[i]||0);
      finalExp.push(financialData.expArr[i]||0);
      finalStaff.push(financialData.staffArr[i]||0);
      finalOverdue.push(operationalData.overdueArr[i]||0);
      finalExpectedCollections.push(operationalData.expectedCollectionArr[i]||0);
      finalExpectedExpenses.push(expenseAverages.operating + expenseAverages.staff);
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

  const currentMIdx = today.getMonth();
  const currentQIdx = Math.floor(currentMIdx / 3);
  const elapsedBoundaryIdx = isQuarterly ? currentQIdx : currentMIdx;
  const isFuturePeriod = index => targetYear > today.getFullYear() ||
    (targetYear === today.getFullYear() && index > elapsedBoundaryIdx);
  const selectedIndices = filteredLabels.map(label => finalLabels.indexOf(label));
  const selectedForecastStart = selectedIndices.findIndex(index => isFuturePeriod(index));
  let predictionLabels = filteredLabels.slice();
  let predictionActual = selectedIndices.map(index => isFuturePeriod(index)
    ? null
    : Number(((finalRev[index] || 0) - (finalExp[index] || 0)).toFixed(2)));
  let predictionExpected = selectedIndices.map(index => isFuturePeriod(index)
    ? Number((finalExpectedCollections[index] - finalExpectedExpenses[index]).toFixed(2))
    : null);
  let transitionIndex = selectedIndices.indexOf(elapsedBoundaryIdx);

  if (selectedForecastStart >= 0) {
    const needsAnchor = targetYear > today.getFullYear() || !selectedIndices.includes(elapsedBoundaryIdx);
    if (needsAnchor) {
      const insertionIndex = selectedForecastStart;
      const anchorLabel = targetYear > today.getFullYear()
        ? `${monthLabels[currentMIdx]} ${today.getFullYear()}`
        : finalLabels[elapsedBoundaryIdx];
      const anchorValue = targetYear > today.getFullYear()
        ? Number((actualAnchor || 0).toFixed(2))
        : Number(((finalRev[elapsedBoundaryIdx] || 0) - (finalExp[elapsedBoundaryIdx] || 0)).toFixed(2));
      predictionLabels.splice(insertionIndex, 0, anchorLabel);
      predictionActual.splice(insertionIndex, 0, anchorValue);
      predictionExpected.splice(insertionIndex, 0, anchorValue);
      transitionIndex = insertionIndex;
    } else {
      predictionExpected[transitionIndex] = predictionActual[transitionIndex];
    }
  }

  return {
    filteredLabels,
    filteredRev: safeNumArray(filteredRev),
    filteredExp: safeNumArray(filteredExp),
    filteredStaff: safeNumArray(filteredStaff),
    filteredOverdue: safeNumArray(filteredOverdue),
    actualNetArr: safeNullableNumArray(predictionActual),
    expectedNetArr: safeNullableNumArray(predictionExpected),
    predictionLabels,
    transitionIndex,
    membersCollected,
    totalOperatingExpenses,
    staffCost
  };
}

function safeNullableNumArray(arr) {
  return arr.map(value => value == null || isNaN(value) ? null : Number(Number(value).toFixed(2)));
}

function safeNumArray(arr) { 
  return arr.map(v => (isNaN(v) || v == null) ? 0 : Number(Number(v).toFixed(2))); 
}

function parseAmt(val) { return Number(String(val).replace(/[^0-9.-]+/g, "")) || 0; }
function isSuccess(statusStr) {
  const status = String(statusStr || '').trim().toLowerCase();
  return status === 'paid' || status === 'completed';
}
