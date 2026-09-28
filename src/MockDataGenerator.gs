/**
 * MockDataGenerator.gs
 *
 * Automated mock data generator for Project LSC (Gym Management System).
 * Cleans and regenerates realistic, meaningful relational data from 1-Jan-2025 till date.
 *
 * Covered Modules & Sheets:
 *  - MEMBERS: Adult & Kids batches, Monthly/Quarterly/Annual/Ad-hoc/Trial plans,
 *             Due in 2 days, Due in 10 days, Due today, Overdue, Active, and Left/Inactive.
 *  - PAYMENTS: Complete chronological payment history synced with member subscription cycles.
 *  - STAFF: Diverse roles (Head Coach, Personal Trainer, Kids Coach, Nutritionist, Front Desk, Cleaner, Ex-Staff).
 *  - SALARY: Monthly payroll disbursements, plus festive & performance Bonuses, and pending cycles for Action Needed.
 *  - EXPENSES: Chronological operational expenses (Rent, Utilities, Cleaning, Equipment Maintenance, Marketing, Misc).
 *
 * Note: SETTINGS and DROP_DOWN tabs are strictly preserved and never wiped.
 */

// Universal fallback Spreadsheet ID if not defined in global scope
var MOCK_SPREADSHEET_ID = (typeof SPREADSHEET_ID !== 'undefined') ? SPREADSHEET_ID : "1Vev8UEoNi1M4a1aWX3bp0zJ8xUjd-gmXSrTorEXDXD0";

/**
 * Standard default headers for target sheets.
 * Used if the sheet row 1 is missing or empty.
 */
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
// DROPDOWN OPTION MATCHER
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

  // Fallback defaults if options are empty
  function resolveOptionId(list, matchKeywords, fallbackId) {
    if (Array.isArray(list) && list.length > 0) {
      var found = list.find(function(item) {
        var name = (item.name || item.label || '').toLowerCase();
        return matchKeywords.some(function(kw) { return name.indexOf(kw.toLowerCase()) !== -1; });
      });
      if (found) return found.id || found.code || found.value || fallbackId;
      return list[0].id || fallbackId;
    }
    return fallbackId;
  }

  return {
    // Membership Plans
    planMonthly: resolveOptionId(dropdowns.membership, ['month'], 'PLAN-MONTHLY'),
    planQuarterly: resolveOptionId(dropdowns.membership, ['quarter'], 'PLAN-QUARTERLY'),
    planAnnual: resolveOptionId(dropdowns.membership, ['annual', 'year'], 'PLAN-ANNUAL'),
    planAdHoc: resolveOptionId(dropdowns.membership, ['ad-hoc', 'adhoc'], 'PLAN-ADHOC'),
    planTrial: resolveOptionId(dropdowns.membership, ['trial', 'week'], 'PLAN-TRIAL'),

    // Batches
    batchAdultMorning: resolveOptionId(dropdowns.batch, ['adult morning', '06:00', 'morning'], 'BAT-ADULT-M'),
    batchAdultEvening: resolveOptionId(dropdowns.batch, ['adult evening', '06:00 pm', 'evening'], 'BAT-ADULT-E'),
    batchKidsMorning: resolveOptionId(dropdowns.batch, ['kids morning', 'junior morning', '09:00', 'kids'], 'BAT-KIDS-M'),
    batchKidsEvening: resolveOptionId(dropdowns.batch, ['kids evening', 'junior evening', '04:30', 'kids'], 'BAT-KIDS-E'),

    // Statuses
    statusActive: resolveOptionId(dropdowns.status, ['active'], 'SAT-1'),
    statusInactive: resolveOptionId(dropdowns.status, ['inactive', 'exit', 'left'], 'SAT-2'),

    // Payment Statuses
    payStatusPaid: resolveOptionId(dropdowns.paymentstatus, ['paid', 'completed'], 'Paid'),
    payStatusOverdue: resolveOptionId(dropdowns.paymentstatus, ['overdue'], 'Overdue'),
    payStatusPending: resolveOptionId(dropdowns.paymentstatus, ['pending'], 'Pending'),

    // Payment Modes
    modeUPI: resolveOptionId(dropdowns.paymentmode, ['upi'], 'UPI'),
    modeCash: resolveOptionId(dropdowns.paymentmode, ['cash'], 'Cash'),
    modeCard: resolveOptionId(dropdowns.paymentmode, ['card'], 'Card'),
    modeBank: resolveOptionId(dropdowns.paymentmode, ['bank', 'transfer', 'net'], 'Bank Transfer'),

    // Staff Roles
    roleHeadCoach: resolveOptionId(dropdowns.role, ['head', 'chief'], 'Head Coach'),
    roleTrainer: resolveOptionId(dropdowns.role, ['trainer', 'coach', 'fitness'], 'Personal Trainer'),
    roleKidsCoach: resolveOptionId(dropdowns.role, ['kid', 'junior'], 'Kids Fitness Coach'),
    roleNutritionist: resolveOptionId(dropdowns.role, ['nutrition', 'diet'], 'Nutritionist'),
    roleFrontDesk: resolveOptionId(dropdowns.role, ['front', 'desk', 'admin', 'manager'], 'Front Desk'),
    roleCleaner: resolveOptionId(dropdowns.role, ['clean', 'house', 'support'], 'Housekeeping'),

    // Staff Credit Types
    creditSalary: resolveOptionId(dropdowns.credittype, ['salary'], 'Salary'),
    creditBonus: resolveOptionId(dropdowns.credittype, ['bonus'], 'Bonus'),

    // Expense Categories
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
 * Builds synchronized Member and Payment records covering all required scenarios:
 *  - 2 days left (Due in 2 Days)
 *  - 10 days left (Due in 10 Days)
 *  - Due Today
 *  - Overdue (5, 15, and 35 days)
 *  - Active with comfortable remaining duration
 *  - Kids Batches (Morning & Evening) and Adult Batches (Morning & Evening)
 *  - Membership plan types (Monthly, Quarterly, Annual, Ad-hoc, Trial)
 *  - Left / Inactive members with exit dates
 */
function buildMembersAndPayments(today, cfg) {
  var members = [];
  var payments = [];
  var adminEmail = (typeof Session !== 'undefined' && Session.getActiveUser)
    ? (Session.getActiveUser().getEmail() || 'admin@gym.com')
    : 'admin@gym.com';
  var nowIso = new Date().toISOString();

  // Helper to record a payment row
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

  // Helper to simulate consecutive monthly or quarterly payment cycles from joinDate up to a final target end date
  function simulatePaymentCycles(memberId, joinDate, finalCoverageEnd, cycleMonths, amount, mode) {
    var curStart = new Date(joinDate.getTime());
    while (curStart < finalCoverageEnd) {
      var nextEnd = mockAddMonths(curStart, cycleMonths);
      nextEnd.setDate(nextEnd.getDate() - 1); // e.g. 1st Jan to 31st Jan

      // If the cycle would overshoot beyond target end date, adjust
      if (nextEnd > finalCoverageEnd) {
        nextEnd = new Date(finalCoverageEnd.getTime());
      }

      var paidDate = new Date(curStart.getTime());
      addPayment(memberId, amount, paidDate, curStart, nextEnd, mode, cfg.payStatusPaid, 'Standard subscription renewal');

      curStart = mockAddDays(nextEnd, 1);
    }
  }

  // --- SCENARIO DEFINITIONS ---

  // 1. Due in 2 Days (Adult Morning, Monthly)
  // Coverage ends in 1 day from today -> Next due = today + 2 days
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
    membershipId: cfg.planMonthly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 2500,
    notes: 'Regular weight training member. Renewal due in 2 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memDue2Days);
  simulatePaymentCycles(memDue2Days.memberId, new Date(2025, 0, 15), mockAddDays(today, 1), 1, 2500, cfg.modeUPI);

  // 2. Due in 10 Days (Adult Evening, Monthly)
  // Coverage ends in 9 days from today -> Next due = today + 10 days
  var memDue10Days = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Pooja Patel',
    phone: '9820223344',
    email: 'pooja.patel@example.com',
    gender: 'Female',
    dob: '22-Aug-1996',
    joinDate: '01-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: 2500,
    notes: 'Fitness & Zumba enthusiast. Renewal due in 10 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memDue10Days);
  simulatePaymentCycles(memDue10Days.memberId, new Date(2025, 1, 1), mockAddDays(today, 9), 1, 2500, cfg.modeCard);

  // 3. Due Today (Adult Morning, Monthly)
  // Coverage ended yesterday -> Next due = today
  var memDueToday = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Rohan Verma',
    phone: '9820334455',
    email: 'rohan.verma@example.com',
    gender: 'Male',
    dob: '10-Nov-1991',
    joinDate: '10-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 2500,
    notes: 'Powerlifting focus. Membership expires and due today.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memDueToday);
  simulatePaymentCycles(memDueToday.memberId, new Date(2025, 0, 10), mockAddDays(today, -1), 1, 2500, cfg.modeUPI);

  // 4. Overdue by 5 Days (Adult Evening, Monthly)
  // Coverage ended 6 days ago -> Next due was 5 days ago
  var memOverdue5Days = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Vikram Malhotra',
    phone: '9820445566',
    email: 'vikram.m@example.com',
    gender: 'Male',
    dob: '05-Jul-1988',
    joinDate: '20-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: 2500,
    notes: 'Pending renewal. Overdue by 5 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memOverdue5Days);
  simulatePaymentCycles(memOverdue5Days.memberId, new Date(2025, 0, 20), mockAddDays(today, -6), 1, 2500, cfg.modeCash);
  // Add an overdue reminder/invoice record
  addPayment(memOverdue5Days.memberId, 2500, mockAddDays(today, -5), mockAddDays(today, -5), mockAddDays(today, 25), cfg.modeUPI, cfg.payStatusOverdue, 'Automated Overdue invoice notification');

  // 5. Overdue by 15 Days (Adult Morning, Quarterly)
  // Coverage ended 16 days ago -> Next due was 15 days ago
  var memOverdue15Days = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Ananya Iyer',
    phone: '9820556677',
    email: 'ananya.iyer@example.com',
    gender: 'Female',
    dob: '18-Mar-1995',
    joinDate: '01-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 6500,
    notes: 'Yoga & Functional training. Quarterly renewal overdue by 15 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memOverdue15Days);
  simulatePaymentCycles(memOverdue15Days.memberId, new Date(2025, 0, 1), mockAddDays(today, -16), 3, 6500, cfg.modeBank);

  // 6. Severely Overdue by 35 Days (Adult Evening, Monthly)
  var memOverdue35Days = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Karan Singhania',
    phone: '9820667788',
    email: 'karan.s@example.com',
    gender: 'Male',
    dob: '30-Sep-1992',
    joinDate: '05-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: 2500,
    notes: 'Repeatedly contacted. Overdue by 35 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memOverdue35Days);
  simulatePaymentCycles(memOverdue35Days.memberId, new Date(2025, 1, 5), mockAddDays(today, -36), 1, 2500, cfg.modeUPI);

  // 7. Active with Plenty of Runway (~25 Days Remaining, Monthly)
  var memActiveRunway = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Neha Reddy',
    phone: '9820778899',
    email: 'neha.reddy@example.com',
    gender: 'Female',
    dob: '12-May-1997',
    joinDate: '12-Mar-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 2500,
    notes: 'Recently renewed. Active with 25 days remaining.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memActiveRunway);
  simulatePaymentCycles(memActiveRunway.memberId, new Date(2025, 2, 12), mockAddDays(today, 24), 1, 2500, cfg.modeUPI);

  // 8. Quarterly Active Member (Due in ~45 Days)
  var memQuarterlyActive = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Devendra Choudhury',
    phone: '9820889900',
    email: 'devendra.c@example.com',
    gender: 'Male',
    dob: '15-Dec-1985',
    joinDate: '01-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: 6500,
    notes: 'Long-term quarterly subscriber.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memQuarterlyActive);
  simulatePaymentCycles(memQuarterlyActive.memberId, new Date(2025, 0, 1), mockAddDays(today, 44), 3, 6500, cfg.modeBank);

  // 9. Quarterly Active Member (Due in 2 Days)
  var memQuarterlyDue2 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Suresh Nair',
    phone: '9820990011',
    email: 'suresh.nair@example.com',
    gender: 'Male',
    dob: '28-Feb-1989',
    joinDate: '01-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 6500,
    notes: 'Quarterly cycle completing in 1 day; renewal due in 2 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memQuarterlyDue2);
  simulatePaymentCycles(memQuarterlyDue2.memberId, new Date(2025, 1, 1), mockAddDays(today, 1), 3, 6500, cfg.modeCard);

  // 10. Annual Membership Member (Active, Long Runway)
  var memAnnual = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Deepak Mehra',
    phone: '9821001122',
    email: 'deepak.mehra@example.com',
    gender: 'Male',
    dob: '03-Jun-1984',
    joinDate: '15-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planAnnual,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 22000,
    notes: 'Annual premium member with personal locker.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memAnnual);
  // Year 1 (2025)
  addPayment(memAnnual.memberId, 22000, new Date(2025, 0, 15), new Date(2025, 0, 15), new Date(2026, 0, 14), cfg.modeBank, cfg.payStatusPaid, 'Annual membership 2025');
  // Year 2 renewal if today is past Jan 2026
  if (today >= new Date(2026, 0, 15)) {
    addPayment(memAnnual.memberId, 22000, new Date(2026, 0, 15), new Date(2026, 0, 15), new Date(2027, 0, 14), cfg.modeBank, cfg.payStatusPaid, 'Annual membership renewal 2026');
  }

  // 11. Ad-Hoc Membership Member (Pays per session / block, Next Due is N/A)
  var memAdHoc = {
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
    membershipAmount: 1500,
    notes: 'Ad-hoc pass holder. Attends weekend crossfit bootcamps.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memAdHoc);
  addPayment(memAdHoc.memberId, 1500, new Date(2025, 1, 10), new Date(2025, 1, 10), new Date(2025, 1, 20), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc 5-session pack');
  addPayment(memAdHoc.memberId, 1500, new Date(2025, 4, 15), new Date(2025, 4, 15), new Date(2025, 4, 25), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc 5-session pack');
  addPayment(memAdHoc.memberId, 1500, new Date(2025, 9, 8), new Date(2025, 9, 8), new Date(2025, 9, 18), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc 5-session pack');
  if (today >= new Date(2026, 2, 1)) {
    addPayment(memAdHoc.memberId, 1500, new Date(2026, 2, 10), new Date(2026, 2, 10), new Date(2026, 2, 20), cfg.modeUPI, cfg.payStatusPaid, 'Ad-hoc 5-session pack');
  }

  // 12. Trial Membership Member (1-Week Trial)
  var memTrial = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Ishaan Gupta',
    phone: '9821223344',
    email: 'ishaan.gupta@example.com',
    gender: 'Male',
    dob: '08-Jan-2000',
    joinDate: mockFormatDDMMMYYYY(mockAddDays(today, -5)),
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planTrial,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 500,
    notes: '7-day trial member exploring gym facilities.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memTrial);
  addPayment(memTrial.memberId, 500, mockAddDays(today, -5), mockAddDays(today, -5), mockAddDays(today, 2), cfg.modeUPI, cfg.payStatusPaid, '7-Day Introductory Trial Fee');

  // 13. KIDS BATCH - Member 1 (Morning Batch, Active, Age 10)
  var memKid1 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Aarush Desai',
    phone: '9821334455',
    email: 'parent.desai@example.com',
    gender: 'Male',
    dob: '12-May-2015',
    joinDate: '15-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchKidsMorning,
    membershipAmount: 2200,
    notes: 'Kids Gymnastics & Agility Batch. Parent: Sunita Desai.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKid1);
  simulatePaymentCycles(memKid1.memberId, new Date(2025, 0, 15), mockAddDays(today, 18), 1, 2200, cfg.modeUPI);

  // 14. KIDS BATCH - Member 2 (Evening Batch, Active, Age 9, Due in 2 Days)
  var memKid2 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Anvi Joshi',
    phone: '9821445566',
    email: 'parent.joshi@example.com',
    gender: 'Female',
    dob: '20-Aug-2016',
    joinDate: '01-Feb-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchKidsEvening,
    membershipAmount: 2200,
    notes: 'Junior Fitness & Martial Arts. Parent: Rajesh Joshi. Due in 2 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKid2);
  simulatePaymentCycles(memKid2.memberId, new Date(2025, 1, 1), mockAddDays(today, 1), 1, 2200, cfg.modeUPI);

  // 15. KIDS BATCH - Member 3 (Evening Batch, Active, Age 11, Due in 10 Days)
  var memKid3 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Reyansh Banerjee',
    phone: '9821556677',
    email: 'parent.banerjee@example.com',
    gender: 'Male',
    dob: '05-Nov-2014',
    joinDate: '10-Jan-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchKidsEvening,
    membershipAmount: 5800,
    notes: 'Kids Strength & Posture Program. Quarterly due in 10 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKid3);
  simulatePaymentCycles(memKid3.memberId, new Date(2025, 0, 10), mockAddDays(today, 9), 3, 5800, cfg.modeCard);

  // 16. KIDS BATCH - Member 4 (Morning Batch, Active, Age 8, Overdue by 8 Days)
  var memKid4 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Myra Kapoor',
    phone: '9821667788',
    email: 'parent.kapoor@example.com',
    gender: 'Female',
    dob: '14-Feb-2017',
    joinDate: '01-Mar-2025',
    exitDate: '',
    status: cfg.statusActive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchKidsMorning,
    membershipAmount: 2200,
    notes: 'Junior Athletics. Overdue by 8 days.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memKid4);
  simulatePaymentCycles(memKid4.memberId, new Date(2025, 2, 1), mockAddDays(today, -9), 1, 2200, cfg.modeUPI);

  // 17. LEFT / INACTIVE MEMBER 1 (Adult Morning, Joined Jan 2025, Left Jul 2025)
  var memLeft1 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Sameer Saxena',
    phone: '9821778899',
    email: 'sameer.saxena@example.com',
    gender: 'Male',
    dob: '11-Jan-1990',
    joinDate: '01-Jan-2025',
    exitDate: '15-Jul-2025',
    status: cfg.statusInactive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchAdultMorning,
    membershipAmount: 2500,
    notes: 'Relocated to another city for job transfer.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memLeft1);
  simulatePaymentCycles(memLeft1.memberId, new Date(2025, 0, 1), new Date(2025, 5, 30), 1, 2500, cfg.modeUPI);

  // 18. LEFT / INACTIVE MEMBER 2 (Adult Evening, Joined Mar 2025, Left Nov 2025)
  var memLeft2 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Kavita Sen',
    phone: '9821889900',
    email: 'kavita.sen@example.com',
    gender: 'Female',
    dob: '24-Apr-1993',
    joinDate: '01-Mar-2025',
    exitDate: '30-Nov-2025',
    status: cfg.statusInactive,
    membershipId: cfg.planQuarterly,
    batchId: cfg.batchAdultEvening,
    membershipAmount: 6500,
    notes: 'Completed 3 quarters. Discontinued due to injury recovery.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memLeft2);
  simulatePaymentCycles(memLeft2.memberId, new Date(2025, 2, 1), new Date(2025, 10, 30), 3, 6500, cfg.modeBank);

  // 19. LEFT / INACTIVE MEMBER 3 (Kids Morning Batch, Left Sep 2025)
  var memLeft3 = {
    memberId: mockGenerateId('MEM'),
    fullName: 'Vihaan Chatterjee',
    phone: '9821990011',
    email: 'parent.chatterjee@example.com',
    gender: 'Male',
    dob: '18-Sep-2015',
    joinDate: '15-Feb-2025',
    exitDate: '30-Sep-2025',
    status: cfg.statusInactive,
    membershipId: cfg.planMonthly,
    batchId: cfg.batchKidsMorning,
    membershipAmount: 2200,
    notes: 'Discontinued due to school exam preparation.',
    profileImage: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminEmail,
    updatedBy: adminEmail
  };
  members.push(memLeft3);
  simulatePaymentCycles(memLeft3.memberId, new Date(2025, 1, 15), new Date(2025, 7, 31), 1, 2200, cfg.modeUPI);

  // 20. ADDITIONAL COHORT OF ACTIVE MEMBERS ACROSS 2025 & 2026
  var additionalCohorts = [
    { name: 'Arjun Das', phone: '9822001122', gender: 'Male', dob: '04-Feb-1993', join: new Date(2025, 3, 1), plan: cfg.planMonthly, amt: 2500, batch: cfg.batchAdultMorning, cyc: 1 },
    { name: 'Shruti Kulkarni', phone: '9822112233', gender: 'Female', dob: '19-Aug-1995', join: new Date(2025, 5, 1), plan: cfg.planQuarterly, amt: 6500, batch: cfg.batchAdultEvening, cyc: 3 },
    { name: 'Manish Pandey', phone: '9822223344', gender: 'Male', dob: '07-Oct-1990', join: new Date(2025, 7, 15), plan: cfg.planMonthly, amt: 2500, batch: cfg.batchAdultMorning, cyc: 1 },
    { name: 'Tanvi Nair', phone: '9822334455', gender: 'Female', dob: '23-Dec-1996', join: new Date(2025, 9, 1), plan: cfg.planMonthly, amt: 2500, batch: cfg.batchAdultEvening, cyc: 1 },
    { name: 'Kabir Rawat', phone: '9822445566', gender: 'Male', dob: '15-May-2016', join: new Date(2025, 10, 1), plan: cfg.planMonthly, amt: 2200, batch: cfg.batchKidsEvening, cyc: 1 },
    { name: 'Ritu Bhargava', phone: '9822556677', gender: 'Female', dob: '11-Jun-1992', join: new Date(2026, 0, 10), plan: cfg.planMonthly, amt: 2500, batch: cfg.batchAdultMorning, cyc: 1 },
    { name: 'Aditya Swaminathan', phone: '9822667788', gender: 'Male', dob: '29-Jan-1994', join: new Date(2026, 2, 1), plan: cfg.planQuarterly, amt: 6500, batch: cfg.batchAdultEvening, cyc: 3 }
  ];

  additionalCohorts.forEach(function(c) {
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
        membershipId: c.plan,
        batchId: c.batch,
        membershipAmount: c.amt,
        notes: 'Active consistent member.',
        profileImage: '',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: adminEmail,
        updatedBy: adminEmail
      };
      members.push(mObj);
      simulatePaymentCycles(mObj.memberId, c.join, mockAddDays(today, 15), c.cyc, c.amt, cfg.modeUPI);
    }
  });

  return { members: members, payments: payments };
}

/**
 * Builds Staff and Salary disbursement records covering:
 *  - Head Coach, Senior Trainer, Kids Fitness Coach, Nutritionist, Front Desk, Cleaner.
 *  - Ex-Trainer (Left / Inactive).
 *  - Monthly regular salary payments from joinDate to present.
 *  - Festive (Diwali) and Annual Appraisal Bonuses.
 *  - Action Needed simulation (leaves 1 recent month pending for 1 or 2 staff).
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
      salary: 42000,
      joinDate: new Date(2025, 0, 1),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Overall Gym Head Coach & Strength Specialist.'
    },
    {
      fullName: 'Amitabh Sengupta',
      role: cfg.roleTrainer,
      reportingTo: 'Rajesh Kumar',
      phone: '9830022334',
      email: 'amitabh.pt@gym.com',
      dob: '20-May-1990',
      salary: 30000,
      joinDate: new Date(2025, 0, 1),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Senior Fitness Trainer & Hypertrophy Coach.'
    },
    {
      fullName: 'Sneha Kulkarni',
      role: cfg.roleKidsCoach,
      reportingTo: 'Rajesh Kumar',
      phone: '9830033445',
      email: 'sneha.kids@gym.com',
      dob: '12-Nov-1993',
      salary: 26000,
      joinDate: new Date(2025, 0, 15),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Specialist in Kids Gymnastics, Calisthenics & Youth Agility.'
    },
    {
      fullName: 'Priya Nambiar',
      role: cfg.roleNutritionist,
      reportingTo: 'Rajesh Kumar',
      phone: '9830044556',
      email: 'priya.diet@gym.com',
      dob: '05-Sep-1992',
      salary: 24000,
      joinDate: new Date(2025, 1, 1),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Certified Clinical Sports Nutritionist & Diet Consultant.'
    },
    {
      fullName: 'Manoj Tiwari',
      role: cfg.roleFrontDesk,
      reportingTo: 'Admin',
      phone: '9830055667',
      email: 'manoj.desk@gym.com',
      dob: '18-Feb-1995',
      salary: 20000,
      joinDate: new Date(2025, 0, 1),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Front Desk In-charge, Member Support & Tour Guide.'
    },
    {
      fullName: 'Sunil Rathod',
      role: cfg.roleCleaner,
      reportingTo: 'Manoj Tiwari',
      phone: '9830066778',
      email: 'sunil.clean@gym.com',
      dob: '10-Oct-1988',
      salary: 12000,
      joinDate: new Date(2025, 0, 1),
      exitDate: null,
      status: cfg.statusActive,
      notes: 'Housekeeping, Floor Sanitization & Locker Cleaning.'
    },
    {
      fullName: 'Vikrant Chauhan',
      role: cfg.roleTrainer,
      reportingTo: 'Rajesh Kumar',
      phone: '9830077889',
      email: 'vikrant.pt@gym.com',
      dob: '28-Jun-1991',
      salary: 25000,
      joinDate: new Date(2025, 0, 15),
      exitDate: new Date(2025, 7, 31),
      status: cfg.statusInactive,
      notes: 'Resigned to start own fitness franchise.'
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
      exitDate: stfDef.exitDate ? mockFormatDDMMMYYYY(stfDef.exitDate) : '',
      status: stfDef.status,
      notes: stfDef.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: adminEmail,
      updatedBy: adminEmail
    };
    staff.push(staffObj);

    // Generate monthly payroll from joinDate to either exitDate or current month
    var cur = new Date(stfDef.joinDate.getFullYear(), stfDef.joinDate.getMonth(), 1);
    var endLimit = stfDef.exitDate ? stfDef.exitDate : today;

    while (cur <= endLimit) {
      var startOfMonth = new Date(cur.getFullYear(), cur.getMonth(), 1);
      var endOfMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);

      // Paid date is typically the 2nd-5th of the following month
      var paidDate = new Date(cur.getFullYear(), cur.getMonth() + 1, 3);

      // Leave the latest cycle pending for 2 staff members so "Action Needed" has realistic items
      var isLatestMonth = (cur.getFullYear() === today.getFullYear() && cur.getMonth() === today.getMonth());
      var isPrevMonth = (cur.getFullYear() === today.getFullYear() && cur.getMonth() === (today.getMonth() - 1));
      var isActionNeededCandidate = (staffIdx === 1 || staffIdx === 3) && (isLatestMonth || isPrevMonth);

      var payStatus = isActionNeededCandidate ? cfg.payStatusPending : cfg.payStatusPaid;

      // Add regular salary payment
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

      // Add Festive Bonus in October 2025 (Diwali bonus)
      if (cur.getFullYear() === 2025 && cur.getMonth() === 9 && !stfDef.exitDate) {
        var bonusAmt = Math.round(stfDef.salary * 0.35);
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

      // Add Annual Performance Bonus in March 2026 (if timeline has reached Mar 2026)
      if (cur.getFullYear() === 2026 && cur.getMonth() === 2 && !stfDef.exitDate && (staffIdx === 0 || staffIdx === 2)) {
        var perfBonusAmt = Math.round(stfDef.salary * 0.30);
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
          notes: 'FY26 Q1 Special Performance Award',
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
 * Builds realistic, recurring and variable operational expenses from 1-Jan-2025 till date:
 *  - Facility Lease / Rent (Fixed on 1st of every month)
 *  - Electricity & Power (Monthly 12th-15th, seasonal variation)
 *  - Cleaning Supplies & Hygiene Refills (Monthly 5th)
 *  - Equipment Servicing & Cable Repairs (Bi-monthly / quarterly)
 *  - Software, Internet & Music License (Monthly 7th)
 *  - Marketing & Promotions (Seasonal campaigns)
 *  - Miscellaneous (With whatMisc field filled in)
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

    // 1. Facility Lease / Rent (1st of month)
    var rentDate = new Date(year, month, 1);
    addExp(cfg.catRent, rentDate, 55000, 'Monthly Facility Lease & Commercial Premises Rent', '');

    // 2. Electricity & Commercial Power (12th of month)
    // Seasonal power consumption (summer is higher due to air conditioning)
    var isSummer = (month >= 3 && month <= 6);
    var powerAmt = isSummer ? 14200 : 9800;
    var powerDate = new Date(year, month, 12);
    addExp(cfg.catUtilities, powerDate, powerAmt, 'Commercial electricity bill & sub-station tariff', '');

    // 3. Water Supply & Dispenser Charges (8th of month)
    var waterDate = new Date(year, month, 8);
    addExp(cfg.catUtilities, waterDate, 2400, 'Municipal commercial water supply & filtration service', '');

    // 4. Cleaning & Hygiene Supplies (5th of month)
    var cleanDate = new Date(year, month, 5);
    addExp(cfg.catCleaning, cleanDate, 3500, 'Disinfectant sprays, microfiber towels, sanitizers & handwash', '');

    // 5. Software & High-Speed Optical Fiber Internet (7th of month)
    var netDate = new Date(year, month, 7);
    addExp(cfg.catUtilities, netDate, 2200, 'Gym sound system streaming license & broadband connection', '');

    // 6. Equipment Servicing & Maintenance (Bi-monthly / every 2-3 months)
    if (monthCounter % 2 === 1) {
      var maintDate = new Date(year, month, 20);
      var maintTypes = [
        { amt: 6500, desc: 'Treadmill motor brush servicing & belt realignment' },
        { amt: 8200, desc: 'Cable crossover wire replacement & pulley bearing greasing' },
        { amt: 4800, desc: 'Bench press leather upholstery repair & dumbbell rack welding' },
        { amt: 9500, desc: 'Spin bike pedal overhaul & resistance magnet calibration' }
      ];
      var mChoice = maintTypes[Math.floor(monthCounter / 2) % maintTypes.length];
      addExp(cfg.catMaintenance, maintDate, mChoice.amt, mChoice.desc, '');
    }

    // 7. Seasonal Marketing Campaigns (Every 4 months)
    if (monthCounter % 4 === 0) {
      var mktDate = new Date(year, month, 10);
      addExp(cfg.catMarketing, mktDate, 8500, 'Social media targeted ads & neighborhood fitness flyers distribution', '');
    }

    // 8. Miscellaneous Operational Expenses
    var miscDate1 = new Date(year, month, 18);
    var miscItems = [
      { amt: 1200, label: 'First Aid Kit Refill', desc: 'Bandages, pain relief spray & basic medical supplies' },
      { amt: 1800, label: 'Mineral Water Cans', desc: '10x 20L commercial drinking water bubble top jars' },
      { amt: 2100, label: 'Staff Tea & Coffee', desc: 'Monthly tea, coffee beans & pantry consumables' },
      { amt: 1400, label: 'Locker Locks & Keys', desc: 'Replacement padlocks and master key duplicates' }
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

/**
 * Clears data rows (row 2 down) in the given sheet, preserving row 1 headers.
 */
function clearSheetData(sheetName) {
  // Method A: Advanced Sheets Service
  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    try {
      Sheets.Spreadsheets.Values.clear({}, MOCK_SPREADSHEET_ID, "'" + sheetName + "'!A2:ZZ");
      return;
    } catch (e) {
      console.warn("Advanced Sheets clear failed for " + sheetName + ": " + e.message);
    }
  }

  // Method B: Native SpreadsheetApp fallback
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

/**
 * Reads row 1 headers from the given sheet, or writes default headers if empty.
 */
function getOrInitHeaders(sheetName, defaultHeaders) {
  var headers = [];

  // Try Advanced Sheets Service
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

  // Try SpreadsheetApp fallback
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

  // If still empty, write default headers to row 1
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

/**
 * Maps record objects into a 2D array matching the exact header structure,
 * safely preserving formula columns marked with '*'.
 */
function mapRecordsToSheetRows(records, headers) {
  return records.map(function(record) {
    return headers.map(function(header) {
      if (!header) return '';
      // Protect and skip formula columns
      if (header.indexOf('*') !== -1) return '';
      var cleanKey = header.replace('*', '').trim();
      var val = record[cleanKey];
      return (val !== undefined && val !== null) ? val : '';
    });
  });
}

/**
 * Writes data rows starting at row 2 in a single high-performance batch call.
 */
function batchWriteSheetData(sheetName, headers, rows) {
  if (!rows || rows.length === 0) return;

  var numRows = rows.length;
  var numCols = headers.length;
  var endColLetter = mockColToLetter(numCols);
  var rangeStr = "'" + sheetName + "'!A2:" + endColLetter + (numRows + 1);

  // Method A: Advanced Sheets Service batchUpdate / update
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

  // Method B: Native SpreadsheetApp setValues fallback
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

/**
 * Generates all in-memory datasets without spreadsheet writes.
 * Useful for automated unit tests and data verification.
 */
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

/**
 * Primary entry point: cleans existing data and regenerates all mock data
 * across MEMBERS, PAYMENTS, STAFF, SALARY, and EXPENSES.
 * Can be executed directly from Google Apps Script editor.
 */
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
  console.log(logPrefix + " Step 2/3: Generating meaningful records...");
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

/**
 * Named global API function exposed for client-side or web app execution.
 */
function api_generateMockData() {
  try {
    var result = generateMockData();
    return result;
  } catch (err) {
    console.error("api_generateMockData error: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

// Module exports for Jest unit testing
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
