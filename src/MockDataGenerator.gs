/**
 * MockDataGenerator.gs
 *
 * Automated mock data generator for Project LSC (Gym Management System).
 * Cleans and regenerates realistic, meaningful relational data from 1-Jan-2025 till date.
 *
 * Data Specifications:
 *  - STAFF: Exactly 2 staff members (Head Coach & Assistant Coach/Trainer) with realistic salaries
 *           and monthly disbursements, keeping staff expenses in proportion with gym size.
 *  - MEMBER PRICING:
 *      * Adult Membership: ₹30,000 Quarterly (₹10,000/mo)
 *      * Kids Membership: ₹15,000 Quarterly (₹5,000/mo)
 *      * Ad-Hoc: ₹4,000 (Adults) / ₹2,000 (Kids)
 *      * Trial: ₹1,500 (1-week trial)
 *  - NET-IN-HAND: Collections (~₹180k-₹210k/mo) comfortably exceed total operating & staff costs
 *                 (~₹105k-₹115k/mo), ensuring a strong, realistic positive Net-In-Hand trend.
 *  - RENEWAL CASES:
 *      * Due in 2 days
 *      * Due in 10 days
 *      * Due today
 *      * Overdue by 5, 15, and 30 days
 *      * Active with 40-60 days runway
 *      * Left / Inactive members with exitDate and cleanly completed historical payments
 *  - BATCHES: Distributed across Adult Morning, Adult Evening, Kids Morning, and Kids Evening.
 *
 * Note: SETTINGS and DROP_DOWN tabs are strictly preserved and never wiped.
 */

var MOCK_SPREADSHEET_ID = (typeof SPREADSHEET_ID !== 'undefined') ? SPREADSHEET_ID : "1Vev8UEoNi1M4a1aWX3bp0zJ8xUjd-gmXSrTorEXDXD0";

var DEFAULT_SHEET_HEADERS = {
  MEMBERS: [
    'memberId', 'fullName', 'phone', 'email', 'gender', 'dob',
    'joinDate', 'exitDate', 'status', 'membershipId', 'batchId',
    'membershipAmount', 'notes', 'profileImage', 'createdAt', 'updatedAt',
    'createdBy', 'updatedBy'
  ],
  PAYMENTS: [
    'paymentId', 'memberId', 'amount', 'paidDate', 'startDate', 'endDate',
    'paymentMode', 'paymentStatus', 'notes', 'createdAt', 'updatedAt',
    'createdBy', 'updatedBy'
  ],
  STAFF: [
    'staffId', 'fullName', 'role', 'reportingTo', 'phone', 'email', 'dob',
    'salary', 'joinDate', 'exitDate', 'status', 'notes', 'createdAt', 'updatedAt',
    'createdBy', 'updatedBy'
  ],
  SALARY: [
    'paymentId', 'staffId', 'creditType', 'amount', 'paidDate', 'startDate', 'endDate',
    'paymentMode', 'paymentStatus', 'receiptUrl', 'notes', 'createdAt', 'updatedAt',
    'createdBy', 'updatedBy'
  ],
  EXPENSES: [
    'expenseId', 'categoryId', 'whatMisc', 'date', 'amount', 'description',
    'receiptFileId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'
  ]
};

// ============================================================================
// DATE & ID HELPER UTILITIES
// ============================================================================

function mockFormatDDMMMYYYY(d) {
  if (!d || isNaN(d.getTime())) return '';
  var day = String(d.getDate()).padStart(2, '0');
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var month = months[d.getMonth()];
  var year = d.getFullYear();
  return day + '-' + month + '-' + year;
}

function mockAddDays(d, days) {
  var copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function mockAddMonths(d, months) {
  var copy = new Date(d.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function mockGenerateId(prefix) {
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
    return prefix + '-' + Utilities.getUuid().substring(0, 6).toUpperCase();
  }
  var rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return prefix + '-' + rand;
}

function mockColToLetter(colIndex) {
  var temp;
  var letter = '';
  var col = colIndex;
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = Math.floor((col - temp - 1) / 26);
  }
  return letter;
}

// ============================================================================
// DROPDOWN CONFIGURATION RESOLUTION
// ============================================================================

function fetchOrCreateDropdownConfig() {
  var dropdowns = {
    membership: [],
    batch: [],
    status: [],
    paymentmode: [],
    paymentstatus: [],
    role: [],
    credittype: [],
    expenseCats: []
  };

  if (typeof api_getGlobalDropdowns === 'function') {
    try {
      var res = api_getGlobalDropdowns();
      if (res && res.success && res.data && res.data.options) {
        var opts = res.data.options;
        dropdowns.membership = opts.membership || opts.Membership || [];
        dropdowns.batch = opts.batch || opts.Batch || [];
        dropdowns.status = opts.status || opts.Status || [];
        dropdowns.paymentmode = opts.paymentmode || opts.payment_mode || [];
        dropdowns.paymentstatus = opts.paymentstatus || opts.payment_status || opts.status || [];
        dropdowns.role = opts.role || opts.roles || opts.staffrole || [];
        dropdowns.credittype = opts.credittype || opts.credit_type || opts.credit_type_options || [];
        dropdowns.expenseCats = opts.expensecategory || opts.expense_category || opts.expense || opts.categories || [];
      }
    } catch (e) {
      console.warn("Could not load dynamic dropdowns; using built-in defaults: " + e.message);
    }
  }

  function resolveOptionId(list, matchKeywords, fallbackId) {
    if (Array.isArray(list) && list.length > 0) {
      var found = list.find(function(item) {
        var name = (item.name || item.label || item.id || '').toLowerCase();
        return matchKeywords.some(function(kw) { return name.indexOf(kw.toLowerCase()) !== -1; });
      });
      if (found) return found.id || found.code || found.value || fallbackId;
    }
    return fallbackId;
  }

  // Plans: Quarterly is the primary plan as requested
  var planList = dropdowns.membership || [];
  var planQuarterly = resolveOptionId(planList, ['quarter'], (planList[0] && planList[0].id) || 'PLAN-QUARTERLY');
  var planAdHoc = resolveOptionId(planList, ['ad-hoc', 'adhoc'], (planList[1 % planList.length] && planList[1 % planList.length].id) || 'PLAN-ADHOC');
  var planTrial = resolveOptionId(planList, ['trial', 'week'], (planList[2 % planList.length] && planList[2 % planList.length].id) || 'PLAN-TRIAL');

  // Batches: Guarantee distinct options across adult and kids morning/evening
  var batchList = dropdowns.batch || [];
  var bAdultM = resolveOptionId(batchList, ['adult morning', '06:00', 'morning'], (batchList[0] && batchList[0].id) || 'BAT-ADULT-M');
  var bAdultE = resolveOptionId(batchList, ['adult evening', 'evening', 'pm'], (batchList[1 % batchList.length] && batchList[1 % batchList.length].id) || 'BAT-ADULT-E');
  var bKidsM = resolveOptionId(batchList, ['kids morning', 'junior morning', '09:00', 'kids'], (batchList[2 % batchList.length] && batchList[2 % batchList.length].id) || 'BAT-KIDS-M');
  var bKidsE = resolveOptionId(batchList, ['kids evening', 'junior evening', '04:30', 'kids'], (batchList[3 % batchList.length] && batchList[3 % batchList.length].id) || 'BAT-KIDS-E');

  if (batchList.length >= 2 && bAdultM === bAdultE) {
    bAdultE = batchList[1].id;
  }
  if (batchList.length >= 3 && (bKidsM === bAdultM || bKidsM === bAdultE)) {
    bKidsM = batchList[2].id;
  }
  if (batchList.length >= 4 && (bKidsE === bKidsM || bKidsE === bAdultM)) {
    bKidsE = batchList[3].id;
  }

  // Statuses: Use 'Active' and 'Inactive' by default so resolveName always recognizes them
  var statusActive = resolveOptionId(dropdowns.status, ['active'], 'Active');
  var statusInactive = resolveOptionId(dropdowns.status, ['inactive', 'exit', 'left'], 'Inactive');

  return {
    planQuarterly: planQuarterly,
    planAdHoc: planAdHoc,
    planTrial: planTrial,

    batchAdultMorning: bAdultM,
    batchAdultEvening: bAdultE,
    batchKidsMorning: bKidsM,
    batchKidsEvening: bKidsE,

    statusActive: statusActive,
    statusInactive: statusInactive,

    payStatusPaid: resolveOptionId(dropdowns.paymentstatus, ['paid', 'completed'], 'Paid'),
    payStatusOverdue: resolveOptionId(dropdowns.paymentstatus, ['overdue'], 'Overdue'),
    payStatusPending: resolveOptionId(dropdowns.paymentstatus, ['pending'], 'Pending'),

    modeUPI: resolveOptionId(dropdowns.paymentmode, ['upi'], 'UPI'),
    modeCash: resolveOptionId(dropdowns.paymentmode, ['cash'], 'Cash'),
    modeCard: resolveOptionId(dropdowns.paymentmode, ['card'], 'Card'),
    modeBank: resolveOptionId(dropdowns.paymentmode, ['bank', 'transfer', 'net'], 'Bank Transfer'),

    roleHeadCoach: resolveOptionId(dropdowns.role, ['head', 'coach', 'trainer'], 'Head Coach'),
    roleTrainer: resolveOptionId(dropdowns.role, ['trainer', 'assistant', 'coach'], 'Assistant Trainer'),

    creditSalary: resolveOptionId(dropdowns.credittype, ['salary'], 'Salary'),
    creditBonus: resolveOptionId(dropdowns.credittype, ['bonus'], 'Bonus'),

    catRent: resolveOptionId(dropdowns.expenseCats, ['rent'], 'CAT-RENT'),
    catUtilities: resolveOptionId(dropdowns.expenseCats, ['util', 'power', 'elect'], 'CAT-UTIL'),
    catCleaning: resolveOptionId(dropdowns.expenseCats, ['clean', 'sanit'], 'CAT-CLEAN'),
    catMaintenance: resolveOptionId(dropdowns.expenseCats, ['maint', 'repair', 'equip'], 'CAT-MAINT'),
    catMarketing: resolveOptionId(dropdowns.expenseCats, ['market', 'promo', 'ad'], 'CAT-MKT'),
    catMisc: resolveOptionId(dropdowns.expenseCats, ['misc', 'other', 'general'], 'CAT-MISC')
  };
}

// ============================================================================
// DATASET GENERATORS
// ============================================================================

/**
 * Builds synchronized Member and Payment records with realistic gym pricing:
 *  - Adult Quarterly: ₹30,000 / quarter
 *  - Kids Quarterly: ₹15,000 / quarter
 *  - Ad-Hoc: ₹4,000 (Adult) / ₹2,000 (Kids)
 *  - Trial: ₹1,500
 *
 * Scenarios covered:
 *  - Due in 2 days (Adult & Kids)
 *  - Due in 10 days (Adult & Kids)
 *  - Due Today
 *  - Overdue by 5, 15, and 30 days
 *  - Active with comfortable runway (~45–60 days remaining)
 *  - Adult and Kids batches (Morning & Evening)
 *  - Inactive / Left members with exitDate and completely closed payment cycles
 */
function buildMembersAndPayments(today, cfg) {
  var members = [];
  var payments = [];
  var adminEmail = (typeof Session !== 'undefined' && Session.getActiveUser)
    ? (Session.getActiveUser().getEmail() || 'admin@gym.com')
    : 'admin@gym.com';
  var nowIso = new Date().toISOString();

  var ADULT_FEE = 30000;
  var KIDS_FEE = 15000;
  var ADULT_ADHOC = 4000;
  var KIDS_ADHOC = 2000;
  var TRIAL_FEE = 1500;

  function addPayment(memberId, amount, paidDate, startDate, endDate, mode, status, notes) {
    payments.push({
      paymentId: mockGenerateId('PAY'),
      memberId: memberId,
      amount: amount,
      paidDate: mockFormatDDMMMYYYY(paidDate),
      startDate: mockFormatDDMMMYYYY(startDate),
      endDate: mockFormatDDMMMYYYY(endDate),
      paymentMode: mode || cfg.modeUPI,
      paymentStatus: status || cfg.payStatusPaid,
      notes: notes || '',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: adminEmail,
      updatedBy: adminEmail
    });
  }

  function simulatePaymentCycles(memberId, joinDate, finalCoverageEnd, cycleMonths, amount, mode) {
    var curStart = new Date(joinDate.getTime());
    while (curStart < finalCoverageEnd) {
      var nextEnd = mockAddMonths(curStart, cycleMonths);
      nextEnd.setDate(nextEnd.getDate() - 1);

      if (nextEnd > finalCoverageEnd) {
        nextEnd = new Date(finalCoverageEnd.getTime());
      }

      var paidDate = new Date(curStart.getTime());
      addPayment(memberId, amount, paidDate, curStart, nextEnd, mode, cfg.payStatusPaid, 'Quarterly membership renewal');

      curStart = mockAddDays(nextEnd, 1);
    }
  }

  // --- SCENARIOS ---

  // 1. ADULT: Due in 2 Days (Adult Morning, Quarterly ₹30,000)
  var memDue2Days = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Aarav Sharma',
    phone: '9820112233',
    email: 'aarav.sharma@example.com',
    gender: 'Male',
    dob: '14-Apr-1994',
    joinDate: '15-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: ADULT_FEE,
    notes: 'Adult Morning Batch. Renewal due in 2 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memDue2Days);
  simulatePaymentCycles(memDue2Days.memberId, new Date(2025, 0, 15), mockAddDays(today, 1), 3, ADULT_FEE, cfg.modeUPI);

  // 2. KIDS: Due in 2 Days (Kids Evening, Quarterly ₹15,000)
  var memKidDue2 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Anvi Joshi',
    phone: '9820223344',
    email: 'parent.joshi@example.com',
    gender: 'Female',
    dob: '20-Aug-2016',
    joinDate: '01-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchKidsEvening,
    membershipAmount: KIDS_FEE,
    notes: 'Kids Evening Batch (Age 9). Parent: Rajesh Joshi. Due in 2 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKidDue2);
  simulatePaymentCycles(memKidDue2.memberId, new Date(2025, 1, 1), mockAddDays(today, 1), 3, KIDS_FEE, cfg.modeUPI);

  // 3. ADULT: Due in 10 Days (Adult Evening, Quarterly ₹30,000)
  var memDue10Days = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Pooja Patel',
    phone: '9820334455',
    email: 'pooja.patel@example.com',
    gender: 'Female',
    dob: '22-Aug-1996',
    joinDate: '01-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: ADULT_FEE,
    notes: 'Adult Evening Batch. Renewal due in 10 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memDue10Days);
  simulatePaymentCycles(memDue10Days.memberId, new Date(2025, 1, 1), mockAddDays(today, 9), 3, ADULT_FEE, cfg.modeCard);

  // 4. KIDS: Due in 10 Days (Kids Evening, Quarterly ₹15,000)
  var memKidDue10 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Reyansh Banerjee',
    phone: '9820445566',
    email: 'parent.banerjee@example.com',
    gender: 'Male',
    dob: '05-Nov-2014',
    joinDate: '10-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchKidsEvening,
    membershipAmount: KIDS_FEE,
    notes: 'Kids Evening Batch (Age 11). Parent: Alok Banerjee. Due in 10 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKidDue10);
  simulatePaymentCycles(memKidDue10.memberId, new Date(2025, 0, 10), mockAddDays(today, 9), 3, KIDS_FEE, cfg.modeCard);

  // 5. ADULT: Due Today (Adult Morning, Quarterly ₹30,000)
  var memDueToday = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Rohan Verma',
    phone: '9820556677',
    email: 'rohan.verma@example.com',
    gender: 'Male',
    dob: '10-Nov-1991',
    joinDate: '10-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: ADULT_FEE,
    notes: 'Adult Morning Batch. Membership expires and due today.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memDueToday);
  simulatePaymentCycles(memDueToday.memberId, new Date(2025, 0, 10), mockAddDays(today, -1), 3, ADULT_FEE, cfg.modeUPI);

  // 6. ADULT: Overdue by 5 Days (Adult Evening, Quarterly ₹30,000)
  var memOverdue5 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Vikram Malhotra',
    phone: '9820667788',
    email: 'vikram.m@example.com',
    gender: 'Male',
    dob: '05-Jul-1988',
    joinDate: '20-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: ADULT_FEE,
    notes: 'Adult Evening Batch. Overdue by 5 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memOverdue5);
  simulatePaymentCycles(memOverdue5.memberId, new Date(2025, 0, 20), mockAddDays(today, -6), 3, ADULT_FEE, cfg.modeCash);
  addPayment(memOverdue5.memberId, ADULT_FEE, mockAddDays(today, -5), mockAddDays(today, -5), mockAddDays(today, 85), cfg.modeUPI, cfg.payStatusOverdue, 'Overdue renewal notification');

  // 7. KIDS: Overdue by 15 Days (Kids Morning, Quarterly ₹15,000)
  var memKidOverdue15 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Myra Kapoor',
    phone: '9820778899',
    email: 'parent.kapoor@example.com',
    gender: 'Female',
    dob: '14-Feb-2017',
    joinDate: '01-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchKidsMorning,
    membershipAmount: KIDS_FEE,
    notes: 'Kids Morning Batch (Age 8). Parent: Neha Kapoor. Overdue by 15 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKidOverdue15);
  simulatePaymentCycles(memKidOverdue15.memberId, new Date(2025, 1, 1), mockAddDays(today, -16), 3, KIDS_FEE, cfg.modeUPI);

  // 8. ADULT: Overdue by 30 Days (Adult Evening, Quarterly ₹30,000)
  var memOverdue30 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Karan Singhania',
    phone: '9820889900',
    email: 'karan.s@example.com',
    gender: 'Male',
    dob: '30-Sep-1992',
    joinDate: '05-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: ADULT_FEE,
    notes: 'Adult Evening Batch. Overdue by 30 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memOverdue30);
  simulatePaymentCycles(memOverdue30.memberId, new Date(2025, 1, 5), mockAddDays(today, -31), 3, ADULT_FEE, cfg.modeUPI);

  // 9. KIDS: Active with Comfortable Runway (Kids Morning, Quarterly ₹15,000)
  var memKidActive1 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Aarush Desai',
    phone: '9820990011',
    email: 'parent.desai@example.com',
    gender: 'Male',
    dob: '12-May-2015',
    joinDate: '15-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchKidsMorning,
    membershipAmount: KIDS_FEE,
    notes: 'Kids Morning Batch (Age 10). Parent: Sunita Desai. Active with 45 days left.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKidActive1);
  simulatePaymentCycles(memKidActive1.memberId, new Date(2025, 0, 15), mockAddDays(today, 45), 3, KIDS_FEE, cfg.modeUPI);

  // 10. ADULT: Active with Comfortable Runway (Adult Morning, Quarterly ₹30,000)
  var memAdultActive1 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Devendra Choudhury',
    phone: '9821001122',
    email: 'devendra.c@example.com',
    gender: 'Male',
    dob: '15-Dec-1985',
    joinDate: '01-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: ADULT_FEE,
    notes: 'Adult Morning Batch. Active with 50 days left.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memAdultActive1);
  simulatePaymentCycles(memAdultActive1.memberId, new Date(2025, 0, 1), mockAddDays(today, 50), 3, ADULT_FEE, cfg.modeBank);

  // 11. ADULT AD-HOC MEMBER (Adult Evening, ₹4,000 per pack)
  var memAdHocAdult = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Aditi Rao',
    phone: '9821112233',
    email: 'aditi.rao@example.com',
    gender: 'Female',
    dob: '25-Oct-1998',
    joinDate: '10-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planAdHoc,
    batchId: cfg.batchAdultEvening,
    membershipAmount: ADULT_ADHOC,
    notes: 'Adult Ad-Hoc 5-session pack holder.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memAdHocAdult);
  addPayment(memAdHocAdult.memberId, ADULT_ADHOC, new Date(2025, 1, 10), new Date(2025, 1, 10), new Date(2025, 1, 25), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc session pack 1');
  addPayment(memAdHocAdult.memberId, ADULT_ADHOC, new Date(2025, 4, 15), new Date(2025, 4, 15), new Date(2025, 4, 30), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc session pack 2');
  addPayment(memAdHocAdult.memberId, ADULT_ADHOC, new Date(2025, 8, 20), new Date(2025, 8, 20), new Date(2025, 9, 5), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc session pack 3');
  if (today >= new Date(2026, 1, 1)) {
    addPayment(memAdHocAdult.memberId, ADULT_ADHOC, new Date(2026, 1, 10), new Date(2026, 1, 10), new Date(2026, 1, 25), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc session pack 4');
  }

  // 12. KIDS AD-HOC MEMBER (Kids Morning, ₹2,000 per pack)
  var memAdHocKids = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Kabir Rawat',
    phone: '9821223344',
    email: 'parent.rawat@example.com',
    gender: 'Male',
    dob: '15-May-2016',
    joinDate: '15-Mar-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planAdHoc,
    batchId: cfg.batchKidsMorning,
    membershipAmount: KIDS_ADHOC,
    notes: 'Kids Ad-hoc session pack. Parent: Meenakshi Rawat.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memAdHocKids);
  addPayment(memAdHocKids.memberId, KIDS_ADHOC, new Date(2025, 2, 15), new Date(2025, 2, 15), new Date(2025, 2, 28), cfg.modeUPI, cfg.payStatusPaid, 'Kids weekend gymnastics pass');
  addPayment(memAdHocKids.memberId, KIDS_ADHOC, new Date(2025, 6, 10), new Date(2025, 6, 10), new Date(2025, 6, 25), cfg.modeUPI, cfg.payStatusPaid, 'Kids holiday sports camp pass');

  // 13. TRIAL MEMBER (Adult Morning, ₹1,500 1-Week Trial)
  var memTrial = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Ishaan Gupta',
    phone: '9821334455',
    email: 'ishaan.gupta@example.com',
    gender: 'Male',
    dob: '08-Jan-2000',
    joinDate: mockFormatDDMMMYYYY(mockAddDays(today, -5)),
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planTrial,
    batchId: cfg.batchAdultMorning,
    membershipAmount: TRIAL_FEE,
    notes: '7-day introductory trial member.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memTrial);
  addPayment(memTrial.memberId, TRIAL_FEE, mockAddDays(today, -5), mockAddDays(today, -5), mockAddDays(today, 2), cfg.modeUPI, cfg.payStatusPaid, '7-Day Introductory Trial Fee');

  // 14. INACTIVE / LEFT MEMBER 1 (Adult, Joined Jan 2025, Left Jul 2025)
  // Fully paid up to exitDate so no phantom overdue cycles exist
  var memLeft1 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Sameer Saxena',
    phone: '9821445566',
    email: 'sameer.saxena@example.com',
    gender: 'Male',
    dob: '11-Jan-1990',
    joinDate: '01-Jan-2025',
    exitDate: '30-Jun-2025',
    status: cfg.statusInactive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: ADULT_FEE,
    notes: 'Relocated to another city. Membership completed and closed on 30-Jun-2025.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memLeft1);
  addPayment(memLeft1.memberId, ADULT_FEE, new Date(2025, 0, 1), new Date(2025, 0, 1), new Date(2025, 2, 31), cfg.modeUPI, cfg.payStatusPaid, 'Quarter 1 2025');
  addPayment(memLeft1.memberId, ADULT_FEE, new Date(2025, 3, 1), new Date(2025, 3, 1), new Date(2025, 5, 30), cfg.modeUPI, cfg.payStatusPaid, 'Quarter 2 2025');

  // 15. INACTIVE / LEFT MEMBER 2 (Adult, Joined Mar 2025, Left Nov 2025)
  var memLeft2 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Kavita Sen',
    phone: '9821556677',
    email: 'kavita.sen@example.com',
    gender: 'Female',
    dob: '24-Apr-1993',
    joinDate: '01-Mar-2025',
    exitDate: '30-Nov-2025',
    status: cfg.statusInactive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: ADULT_FEE,
    notes: 'Completed 3 quarters. Discontinued due to injury recovery.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memLeft2);
  addPayment(memLeft2.memberId, ADULT_FEE, new Date(2025, 2, 1), new Date(2025, 2, 1), new Date(2025, 4, 31), cfg.modeBank, cfg.payStatusPaid, 'Quarter 1');
  addPayment(memLeft2.memberId, ADULT_FEE, new Date(2025, 5, 1), new Date(2025, 5, 1), new Date(2025, 7, 31), cfg.modeBank, cfg.payStatusPaid, 'Quarter 2');
  addPayment(memLeft2.memberId, ADULT_FEE, new Date(2025, 8, 1), new Date(2025, 8, 1), new Date(2025, 10, 30), cfg.modeBank, cfg.payStatusPaid, 'Quarter 3');

  // 16. INACTIVE / LEFT MEMBER 3 (Kids, Joined Feb 2025, Left Sep 2025)
  var memLeft3 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Vihaan Chatterjee',
    phone: '9821667788',
    email: 'parent.chatterjee@example.com',
    gender: 'Male',
    dob: '18-Sep-2015',
    joinDate: '15-Feb-2025',
    exitDate: '31-Aug-2025',
    status: cfg.statusInactive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchKidsMorning,
    membershipAmount: KIDS_FEE,
    notes: 'Kids Morning. Parent: S. Chatterjee. Left on 31-Aug-2025.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memLeft3);
  addPayment(memLeft3.memberId, KIDS_FEE, new Date(2025, 1, 15), new Date(2025, 1, 15), new Date(2025, 4, 14), cfg.modeUPI, cfg.payStatusPaid, 'Kids Quarter 1');
  addPayment(memLeft3.memberId, KIDS_FEE, new Date(2025, 4, 15), new Date(2025, 4, 15), new Date(2025, 7, 14), cfg.modeUPI, cfg.payStatusPaid, 'Kids Quarter 2');

  // 17. ADDITIONAL ACTIVE MEMBERS TO POPULATE HEALTHY QUARTERLY REVENUES ACROSS 2025 & 2026
  var activeCohorts = [
    // Adults (₹30,000 Quarterly)
    { name: 'Arjun Das', phone: '9821778899', gender: 'Male', dob: '04-Feb-1993', join: new Date(2025, 0, 1), amt: ADULT_FEE, batch: cfg.batchAdultMorning },
    { name: 'Shruti Kulkarni', phone: '9821889900', gender: 'Female', dob: '19-Aug-1995', join: new Date(2025, 1, 1), amt: ADULT_FEE, batch: cfg.batchAdultEvening },
    { name: 'Manish Pandey', phone: '9821990011', gender: 'Male', dob: '07-Oct-1990', join: new Date(2025, 2, 1), amt: ADULT_FEE, batch: cfg.batchAdultMorning },
    { name: 'Tanvi Nair', phone: '9822001122', gender: 'Female', dob: '23-Dec-1996', join: new Date(2025, 3, 1), amt: ADULT_FEE, batch: cfg.batchAdultEvening },
    { name: 'Ritu Bhargava', phone: '9822112233', gender: 'Female', dob: '11-Jun-1992', join: new Date(2025, 4, 1), amt: ADULT_FEE, batch: cfg.batchAdultMorning },
    { name: 'Aditya Swaminathan', phone: '9822223344', gender: 'Male', dob: '29-Jan-1994', join: new Date(2025, 5, 1), amt: ADULT_FEE, batch: cfg.batchAdultEvening },
    { name: 'Gaurav Bhatia', phone: '9822334455', gender: 'Male', dob: '16-Sep-1987', join: new Date(2025, 6, 1), amt: ADULT_FEE, batch: cfg.batchAdultMorning },
    { name: 'Deepa Srinivas', phone: '9822445566', gender: 'Female', dob: '03-Dec-1991', join: new Date(2025, 7, 1), amt: ADULT_FEE, batch: cfg.batchAdultEvening },
    { name: 'Naveen Goyal', phone: '9822556677', gender: 'Male', dob: '21-Apr-1989', join: new Date(2025, 9, 1), amt: ADULT_FEE, batch: cfg.batchAdultMorning },
    { name: 'Sanya Mirza', phone: '9822667788', gender: 'Female', dob: '08-May-1997', join: new Date(2026, 0, 1), amt: ADULT_FEE, batch: cfg.batchAdultEvening },

    // Kids (₹15,000 Quarterly)
    { name: 'Dhruv Singhal', phone: '9822778899', gender: 'Male', dob: '14-Mar-2015', join: new Date(2025, 1, 1), amt: KIDS_FEE, batch: cfg.batchKidsMorning },
    { name: 'Kiara Advani', phone: '9822889900', gender: 'Female', dob: '26-Jul-2016', join: new Date(2025, 2, 1), amt: KIDS_FEE, batch: cfg.batchKidsEvening },
    { name: 'Shaurya Roy', phone: '9822990011', gender: 'Male', dob: '09-Oct-2014', join: new Date(2025, 3, 1), amt: KIDS_FEE, batch: cfg.batchKidsMorning },
    { name: 'Ira Trivedi', phone: '9823001122', gender: 'Female', dob: '30-Jan-2017', join: new Date(2025, 5, 1), amt: KIDS_FEE, batch: cfg.batchKidsEvening },
    { name: 'Devansh Saxena', phone: '9823112233', gender: 'Male', dob: '18-Aug-2015', join: new Date(2025, 8, 1), amt: KIDS_FEE, batch: cfg.batchKidsMorning }
  ];

  activeCohorts.forEach(function(c) {
    if (today >= c.join) {
      var mObj = {
        memberId: mockGenerateId('MEM'),
        fullName: c.name,
        phone: c.phone,
        email: c.name.toLowerCase().replace(/\s+/g, '.') + '@example.com',
        gender: c.gender,
        dob: c.dob,
        joinDate: mockFormatDDMMMYYYY(c.join),
        exitDate: '',
        status: cfg.statusActive,
        membershipId: cfg.planQuarterly,
        batchId: c.batch,
        membershipAmount: c.amt,
        notes: (c.amt === KIDS_FEE ? 'Kids' : 'Adult') + ' Quarterly Subscriber.',
        profileImage: '',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: adminEmail,
        updatedBy: adminEmail
      };
      members.push(mObj);
      simulatePaymentCycles(mObj.memberId, c.join, mockAddDays(today, 60), 3, c.amt, cfg.modeUPI);
    }
  });

  return { members: members, payments: payments };
}

/**
 * Builds exactly 2 staff members with realistic salaries and monthly payroll:
 *  - Staff 1: Head Coach (₹35,000 / month)
 *  - Staff 2: Assistant Coach / Operations (₹25,000 / month)
 *  - Total staff payroll: ₹60,000 / month
 *  - Monthly regular salary disbursements from 1-Jan-2025 to date.
 *  - Festive (Diwali) and Performance Bonuses.
 *  - 1 pending cycle left for Staff 2 to populate the Staff Action Needed tab.
 */
function buildStaffAndSalary(today, cfg) {
  var staff = [];
  var salary = [];
  var adminEmail = (typeof Session !== 'undefined' && Session.getActiveUser)
    ? (Session.getActiveUser().getEmail() || 'admin@gym.com')
    : 'admin@gym.com';
  var nowIso = new Date().toISOString();

  var staffList = [
    {
      fullName: 'Rajesh Kumar',
      role: cfg.roleHeadCoach,
      reportingTo: 'Owner',
      phone: '9830011223',
      email: 'rajesh.coach@gym.com',
      dob: '15-Aug-1985',
      salary: 35000,
      joinDate: new Date(2025, 0, 1),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Head Fitness Coach & Program Director.'
    },
    {
      fullName: 'Sneha Kulkarni',
      role: cfg.roleTrainer,
      reportingTo: 'Rajesh Kumar',
      phone: '9830022334',
      email: 'sneha.pt@gym.com',
      dob: '12-Nov-1993',
      salary: 25000,
      joinDate: new Date(2025, 0, 1),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Assistant Coach & Operations Coordinator.'
    }
  ];

  staffList.forEach(function(stfDef, staffIdx) {
    var stfId = mockGenerateId('STF');
    var staffObj = {
      staffId: stfId,
      fullName: stfDef.fullName,
      role: stfDef.role,
      reportingTo: stfDef.reportingTo,
      phone: stfDef.phone,
      email: stfDef.email,
      dob: stfDef.dob,
      salary: stfDef.salary,
      joinDate: mockFormatDDMMMYYYY(stfDef.joinDate),
      exitDate: '',
      status: cfg.statusActive,
      notes: stfDef.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: adminEmail,
      updatedBy: adminEmail
    };
    staff.push(staffObj);

    var cur = new Date(stfDef.joinDate.getFullYear(), stfDef.joinDate.getMonth(), 1);
    while (cur <= today) {
      var startOfMonth = new Date(cur.getFullYear(), cur.getMonth(), 1);
      var endOfMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      var paidDate = new Date(cur.getFullYear(), cur.getMonth() + 1, 3);

      // Leave the latest cycle pending for Staff 2 so "Action Needed" has a realistic item
      var isLatestMonth = (cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth());
      var isPendingCandidate = (staffIdx === 1 && isLatestMonth);
      var payStatus = isPendingCandidate ? cfg.payStatusPending : cfg.payStatusPaid;

      salary.push({
        paymentId: mockGenerateId('SAL'),
        staffId: stfId,
        creditType: cfg.creditSalary,
        amount: stfDef.salary,
        paidDate: mockFormatDDMMMYYYY(paidDate),
        startDate: mockFormatDDMMMYYYY(startOfMonth),
        endDate: mockFormatDDMMMYYYY(endOfMonth),
        paymentMode: cfg.modeBank,
        paymentStatus: payStatus,
        receiptUrl: '',
        notes: 'Monthly salary disbursement for ' + mockFormatDDMMMYYYY(startOfMonth).substring(3),
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: adminEmail,
        updatedBy: adminEmail
      });

      // Diwali Festive Bonus in October 2025
      if (cur.getFullYear() === 2025 && cur.getMonth() === 9) {
        var bonusAmt = (staffIdx === 0) ? 10000 : 8000;
        salary.push({
          paymentId: mockGenerateId('SAL'),
          staffId: stfId,
          creditType: cfg.creditBonus,
          amount: bonusAmt,
          paidDate: '25-Oct-2025',
          startDate: '01-Oct-2025',
          endDate: '31-Oct-2025',
          paymentMode: cfg.modeBank,
          paymentStatus: cfg.payStatusPaid,
          receiptUrl: '',
          notes: 'Diwali Festive Bonus 2025',
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: adminEmail,
          updatedBy: adminEmail
        });
      }

      // Performance Award in March 2026
      if (cur.getFullYear() === 2026 && cur.getMonth() === 2) {
        var perfBonusAmt = (staffIdx === 0) ? 8000 : 6000;
        salary.push({
          paymentId: mockGenerateId('SAL'),
          staffId: stfId,
          creditType: cfg.creditBonus,
          amount: perfBonusAmt,
          paidDate: '31-Mar-2026',
          startDate: '01-Mar-2026',
          endDate: '31-Mar-2026',
          paymentMode: cfg.modeBank,
          paymentStatus: cfg.payStatusPaid,
          receiptUrl: '',
          notes: 'FY26 Q1 Performance Bonus',
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: adminEmail,
          updatedBy: adminEmail
        });
      }

      cur.setMonth(cur.getMonth() + 1);
    }
  });

  return { staff: staff, salary: salary };
}

/**
 * Builds realistic, recurring operational expenses scaled appropriately for a 2-staff gym:
 *  - Facility Rent: ₹35,000 / month
 *  - Electricity & Power: ₹6,500 - ₹9,500 / month
 *  - Cleaning & Sanitation: ₹2,000 / month
 *  - Broadband Internet & Software: ₹1,500 / month
 *  - Equipment Servicing: ~₹3,500 every 2-3 months
 *  - Marketing: ~₹4,000 seasonal
 *  - Miscellaneous: ~₹1,000 / month
 * Total operating costs: ~₹48,000 - ₹55,000 / month.
 */
function buildExpenses(today, cfg) {
  var expenses = [];
  var adminEmail = (typeof Session !== 'undefined' && Session.getActiveUser)
    ? (Session.getActiveUser().getEmail() || 'admin@gym.com')
    : 'admin@gym.com';
  var nowIso = new Date().toISOString();

  function addExp(catId, date, amount, desc, whatMisc) {
    if (date > today) return;
    expenses.push({
      expenseId: mockGenerateId('EXP'),
      categoryId: catId,
      whatMisc: whatMisc || '',
      date: mockFormatDDMMMYYYY(date),
      amount: amount,
      description: desc || '',
      receiptFileId: '',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: adminEmail,
      updatedBy: adminEmail
    });
  }

  var cur = new Date(2025, 0, 1);
  var monthCounter = 0;

  while (cur <= today) {
    var year = cur.getFullYear();
    var month = cur.getMonth();

    // 1. Facility Rent (1st of month)
    var rentDate = new Date(year, month, 1);
    addExp(cfg.catRent, rentDate, 35000, 'Monthly Facility Lease & Commercial Premises Rent', '');

    // 2. Electricity & Commercial Power (12th of month)
    var isSummer = (month >= 3 && month <= 6);
    var powerAmt = isSummer ? 9200 : 6800;
    var powerDate = new Date(year, month, 12);
    addExp(cfg.catUtilities, powerDate, powerAmt, 'Commercial electricity bill & power tariff', '');

    // 3. Water Supply & Dispenser Charges (8th of month)
    var waterDate = new Date(year, month, 8);
    addExp(cfg.catUtilities, waterDate, 1500, 'Municipal commercial water supply & filtration service', '');

    // 4. Cleaning & Hygiene Supplies (5th of month)
    var cleanDate = new Date(year, month, 5);
    addExp(cfg.catCleaning, cleanDate, 2000, 'Disinfectant sprays, microfiber towels, sanitizers & handwash', '');

    // 5. Software & High-Speed Optical Fiber Internet (7th of month)
    var netDate = new Date(year, month, 7);
    addExp(cfg.catUtilities, netDate, 1500, 'Broadband connection & music streaming license', '');

    // 6. Equipment Servicing & Maintenance (Every 3 months)
    if (monthCounter % 3 === 1) {
      var maintDate = new Date(year, month, 20);
      var maintTypes = [
        { amt: 3500, desc: 'Treadmill belt lubrication & motor brush inspection' },
        { amt: 4200, desc: 'Cable crossover pulley bearings and wire tensioning' },
        { amt: 2800, desc: 'Bench press leather upholstery repair' }
      ];
      var mChoice = maintTypes[Math.floor(monthCounter / 3) % maintTypes.length];
      addExp(cfg.catMaintenance, maintDate, mChoice.amt, mChoice.desc, '');
    }

    // 7. Seasonal Marketing (Every 4 months)
    if (monthCounter % 4 === 0) {
      var mktDate = new Date(year, month, 10);
      addExp(cfg.catMarketing, mktDate, 4000, 'Local digital fitness ads & promotional flyers', '');
    }

    // 8. Miscellaneous Operational Expenses
    var miscDate1 = new Date(year, month, 18);
    var miscItems = [
      { amt: 800, label: 'First Aid Kit Refill', desc: 'Bandages, pain relief spray & medical supplies' },
      { amt: 1200, label: 'Mineral Water Cans', desc: 'Commercial drinking water bubble top jars' },
      { amt: 1500, label: 'Staff Tea & Coffee', desc: 'Monthly tea, coffee & pantry supplies' },
      { amt: 900, label: 'Locker Locks & Keys', desc: 'Replacement padlocks and key duplicates' }
    ];
    var miscChoice = miscItems[monthCounter % miscItems.length];
    addExp(cfg.catMisc, miscDate1, miscChoice.amt, miscChoice.desc, miscChoice.label);

    monthCounter++;
    cur.setMonth(cur.getMonth() + 1);
  }

  return expenses;
}

// ============================================================================
// SHEET CLEAN & BATCH INSERT ENGINE
// ============================================================================

function clearSheetData(sheetName) {
  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    try {
      Sheets.Spreadsheets.Values.clear({}, MOCK_SPREADSHEET_ID, "'" + sheetName + "'!A2:ZZ");
      return;
    } catch (e) {
      console.warn("Advanced Sheets clear failed for " + sheetName + ": " + e.message);
    }
  }

  if (typeof SpreadsheetApp !== 'undefined') {
    try {
      var ss = SpreadsheetApp.openById(MOCK_SPREADSHEET_ID);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet && sheet.getLastRow() > 1) {
        var lastRow = sheet.getLastRow();
        var lastCol = Math.max(sheet.getLastColumn(), 1);
        sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }
    } catch (e) {
      console.warn("SpreadsheetApp clear failed for " + sheetName + ": " + e.message);
    }
  }
}

function getOrInitHeaders(sheetName, defaultHeaders) {
  var headers = [];

  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    try {
      var res = Sheets.Spreadsheets.Values.get(MOCK_SPREADSHEET_ID, "'" + sheetName + "'!1:1");
      if (res && res.values && res.values[0] && res.values[0].length > 0) {
        headers = res.values[0];
      }
    } catch (e) {
      console.warn("Failed to get headers via Sheets API for " + sheetName + ": " + e.message);
    }
  }

  if (headers.length === 0 && typeof SpreadsheetApp !== 'undefined') {
    try {
      var ss = SpreadsheetApp.openById(MOCK_SPREADSHEET_ID);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet && sheet.getLastColumn() > 0) {
        headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      }
    } catch (e) {
      console.warn("Failed to get headers via SpreadsheetApp for " + sheetName + ": " + e.message);
    }
  }

  if (headers.length === 0 || !headers.some(function(h) { return h && String(h).trim() !== ''; })) {
    headers = defaultHeaders;
    if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
      try {
        var endCol = mockColToLetter(defaultHeaders.length);
        Sheets.Spreadsheets.Values.update(
          { values: [defaultHeaders] },
          MOCK_SPREADSHEET_ID,
          "'" + sheetName + "'!A1:" + endCol + "1",
          { valueInputOption: 'USER_ENTERED' }
        );
      } catch (err) {
        console.warn("Could not set default headers via Sheets API: " + err.message);
      }
    } else if (typeof SpreadsheetApp !== 'undefined') {
      try {
        var ss2 = SpreadsheetApp.openById(MOCK_SPREADSHEET_ID);
        var sheet2 = ss2.getSheetByName(sheetName);
        if (sheet2) {
          sheet2.getRange(1, 1, 1, defaultHeaders.length).setValues([defaultHeaders]);
        }
      } catch (err2) {
        console.warn("Could not set default headers via SpreadsheetApp: " + err2.message);
      }
    }
  }

  return headers;
}

function mapRecordsToSheetRows(records, headers) {
  return records.map(function(record) {
    return headers.map(function(header) {
      if (!header) return '';
      if (header.indexOf('*') !== -1) return '';
      var cleanKey = header.replace('*', '').trim();
      var val = record[cleanKey];
      return (val !== undefined && val !== null) ? val : '';
    });
  });
}

function batchWriteSheetData(sheetName, headers, rows) {
  if (!rows || rows.length === 0) return;

  var numRows = rows.length;
  var numCols = headers.length;
  var endColLetter = mockColToLetter(numCols);
  var rangeStr = "'" + sheetName + "'!A2:" + endColLetter + (numRows + 1);

  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    try {
      Sheets.Spreadsheets.Values.update(
        { values: rows },
        MOCK_SPREADSHEET_ID,
        rangeStr,
        { valueInputOption: 'USER_ENTERED' }
      );
      return;
    } catch (e) {
      console.warn("Advanced Sheets batch write failed for " + sheetName + ": " + e.message);
    }
  }

  if (typeof SpreadsheetApp !== 'undefined') {
    try {
      var ss = SpreadsheetApp.openById(MOCK_SPREADSHEET_ID);
      var sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        sheet.getRange(2, 1, numRows, numCols).setValues(rows);
      }
    } catch (e) {
      console.error("SpreadsheetApp batch write failed for " + sheetName + ": " + e.message);
      throw e;
    }
  }
}

// ============================================================================
// MAIN GENERATION CONTROLLER
// ============================================================================

function generateAllMockDatasets(customToday) {
  var today = customToday || new Date();
  var cfg = fetchOrCreateDropdownConfig();

  var memRes = buildMembersAndPayments(today, cfg);
  var staffRes = buildStaffAndSalary(today, cfg);
  var expenses = buildExpenses(today, cfg);

  return {
    members: memRes.members,
    payments: memRes.payments,
    staff: staffRes.staff,
    salary: staffRes.salary,
    expenses: expenses
  };
}

function generateMockData() {
  var startTime = new Date().getTime();
  var logPrefix = "[MockDataGenerator]";
  console.log(logPrefix + " Starting mock data generation from 1-Jan-2025 till date...");

  var today = new Date();
  var targetSheets = ['MEMBERS', 'PAYMENTS', 'STAFF', 'SALARY', 'EXPENSES'];

  // Step 1: Clean all data rows (row 2 down) in target sheets
  console.log(logPrefix + " Step 1/3: Cleaning existing data rows...");
  targetSheets.forEach(function(sName) {
    clearSheetData(sName);
  });

  // Step 2: Build fresh synchronized relational datasets
  console.log(logPrefix + " Step 2/3: Generating meaningful records with 2 staff and ₹30k/₹15k quarterly pricing...");
  var datasets = generateAllMockDatasets(today);

  // Step 3: Batch insert generated datasets into sheets
  console.log(logPrefix + " Step 3/3: Batch writing records into Google Sheets...");

  var sheetMap = [
    { name: 'MEMBERS', defaultHeaders: DEFAULT_SHEET_HEADERS.MEMBERS, data: datasets.members },
    { name: 'PAYMENTS', defaultHeaders: DEFAULT_SHEET_HEADERS.PAYMENTS, data: datasets.payments },
    { name: 'STAFF', defaultHeaders: DEFAULT_SHEET_HEADERS.STAFF, data: datasets.staff },
    { name: 'SALARY', defaultHeaders: DEFAULT_SHEET_HEADERS.SALARY, data: datasets.salary },
    { name: 'EXPENSES', defaultHeaders: DEFAULT_SHEET_HEADERS.EXPENSES, data: datasets.expenses }
  ];

  var stats = {};
  sheetMap.forEach(function(item) {
    var headers = getOrInitHeaders(item.name, item.defaultHeaders);
    var rows = mapRecordsToSheetRows(item.data, headers);
    batchWriteSheetData(item.name, headers, rows);
    stats[item.name] = rows.length;
    console.log(logPrefix + " " + item.name + ": Inserted " + rows.length + " rows.");
  });

  var durationSec = ((new Date().getTime() - startTime) / 1000).toFixed(2);
  var summaryMsg = "Mock data generated successfully in " + durationSec + "s. Stats: " + JSON.stringify(stats);
  console.log(logPrefix + " " + summaryMsg);

  return {
    success: true,
    message: summaryMsg,
    stats: stats,
    durationSeconds: Number(durationSec)
  };
}

function api_generateMockData() {
  try {
    return generateMockData();
  } catch (err) {
    console.error("api_generateMockData error: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateMockData: generateMockData,
    api_generateMockData: api_generateMockData,
    generateAllMockDatasets: generateAllMockDatasets,
    mockFormatDDMMMYYYY: mockFormatDDMMMYYYY,
    mockAddDays: mockAddDays,
    mockAddMonths: mockAddMonths,
    mockGenerateId: mockGenerateId,
    mockColToLetter: mockColToLetter,
    mapRecordsToSheetRows: mapRecordsToSheetRows,
    DEFAULT_SHEET_HEADERS: DEFAULT_SHEET_HEADERS,
    fetchOrCreateDropdownConfig: fetchOrCreateDropdownConfig
  };
}
