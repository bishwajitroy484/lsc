/**
 * Hover wording for the Dashboard and Expenses screens.
 *
 * Share this file when the wording needs a review. Edit the sentences,
 * then put the file back in src/. The screens read these strings at
 * load time, so the hover behaviour stays the same.
 */
var LSC_TOOLTIPS = {
  dashboard: {
    activeMembers: 'Members covered in the months or quarters you picked.',
    totalCollected: 'Money members already paid in the selected periods.',
    netInHand: 'Cash left after expenses, plus what is still expected.',
    overdueAmount: 'Fees still unpaid for the periods you selected.',
    operatingExpenses: 'Gym costs plus staff pay for the selected periods.',
    utilities: 'Gym bills such as rent, power, and supplies.',
    staffCost: 'Staff pay already paid in the selected periods.',
    revenueVsExpenses: 'Money received compared with expenses each period.',
    membersByBatch: 'Members by batch. (A) is Adult and (K) is Kid.',
    netInHandForecast: 'Period shows each month. Over time shows the running total.',
    cashVsUpi: 'Cash and UPI received, as rupees or as a share.',
    expenseBreakdown: 'How spending splits by category, including staff pay.',
    overdueTable: 'Members whose renewal date is already past.',
    upcomingTable: 'Members due to renew within the next seven days.'
  },
  expenses: {
    totalOutflow: 'Gym bills plus staff pay for the selected periods.',
    periodAverage: 'Total spending divided by the periods you selected.',
    staffCost: 'Staff pay already paid in the selected periods.',
    otherExpenses: 'Gym bills such as rent, power, and supplies.',
    staffCount: 'People currently marked active on the staff list.',
    actionNeeded: 'Staff who still have an unpaid salary cycle.',
    expensesTrend: 'Staff pay and other costs for each selected period.',
    expensesByCategory: 'How spending splits by category, including staff pay.'
  }
};

function tooltipCopy_(key) {
  var parts = String(key || '').split('.');
  var node = LSC_TOOLTIPS;
  var i;
  for (i = 0; i < parts.length; i++) {
    if (!node || typeof node !== 'object') return '';
    node = node[parts[i]];
  }
  return typeof node === 'string' ? node : '';
}
