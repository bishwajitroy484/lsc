/**
 * Hover wording for the Dashboard and Expenses screens.
 *
 * Share this file when the wording needs a review. Edit the sentences,
 * then put the file back in src/. The screens read these strings at
 * load time, so the hover behaviour stays the same.
 */
var LSC_TOOLTIPS = {
  dashboard: {
    activeMembers: 'Members whose membership covered the selected months or quarters. Plan chips split that same group into Quarterly, Ad-hoc, Trial, and other plans.',
    totalCollected: 'Sum of member payments marked Paid/Completed in the selected year and months/quarters. Uses your Anchor or Split revenue recognition setting.',
    netInHand: 'Money already left after costs: recognized collections minus operating expenses. “Remaining” is unpaid renewals still due from today through the rest of the selected year, including later this month, minus estimated future costs.',
    overdueAmount: 'Estimated unpaid dues whose billing month falls in the selected months or quarters.',
    operatingExpenses: 'All running costs for the selected periods: gym/utilities expenses plus paid staff salaries. Total = Utilities + Staff.',
    utilities: 'Recorded gym expenses (rent, power, supplies, etc.) recognized in the selected periods. Excludes staff salary payments.',
    staffCost: 'Paid staff salary/cost amounts recognized in the selected periods. Pending or failed salary rows are not counted.',
    revenueVsExpenses: 'Compares recognized member collections against total operating expenses for each selected month or quarter.',
    membersByBatch: 'Members covered by the selected months or quarters, grouped by batch. People who were not members in that window are left out.',
    netInHandForecast: 'Solid line = cash already recognized (collections − expenses). Green dotted line adds renewals not yet collected from today onward, including later this month, and estimated future costs.',
    collectionTrend: 'Period-by-period paid collections vs estimated overdue dues. Helps see whether money coming in is keeping up with unpaid renewals.',
    expenseBreakdown: 'Share of operating spend by category in the selected periods, including staff cost. Use View Misc to drill into miscellaneous expense details.',
    overdueTable: 'Active members whose next renewal date is already past. Amount is the estimated unpaid dues; days show how late they are. Ad-hoc/trial plans are excluded.',
    upcomingTable: 'Active members due to renew within the next 7 days (including today). Amount is the expected renewal value for their plan. Ad-hoc/trial plans are excluded.'
  },
  expenses: {
    totalOutflow: 'Recorded gym expenses plus paid staff cost for the selected year and months or quarters.',
    periodAverage: 'Total outflow divided by how many months or quarters you selected.',
    staffCost: 'Paid staff salary amounts recognized in the selected periods. Pending or failed salary rows are not counted.',
    otherExpenses: 'Recorded gym expenses such as rent, power, and supplies in the selected periods. Staff payroll is counted separately.',
    staffCount: 'People whose status is Active. The rest of this card opens the staff list.',
    actionNeeded: 'Staff with at least one salary cycle still unpaid. The rest of this card opens the staff list.',
    expensesTrend: 'Staff cost and other expenses for each selected month or quarter. Switch the chart between bar, area, and line.',
    expensesByCategory: 'Share of spend by category in the selected periods, with staff cost included as its own slice.'
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
