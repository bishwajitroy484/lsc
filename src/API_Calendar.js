/**
 * API_Calendar.gs
 * Aggregates payments and dues for the calendar views.
 */
function api_getCalendarData(month, year) {
  try {
    // In production, query the DB based on month/year. 
    // Sending mocked aggregation matching the design for UI development.
    return {
      success: true,
      stats: { paid: 82, due: 18, overdue: 12, total: 112 },
      // Map of day (1-31) to its dots array
      dayData: {
        8: ['paid'], 9: ['paid', 'due'], 10: ['paid', 'due', 'overdue'], 
        15: ['paid'], 17: ['overdue'], 23: ['due', 'overdue'], 28: ['paid', 'due']
      },
      transactions: [
        { id: 1, name: "Amit Sharma", plan: "Monthly Plan", amount: 2500, status: "Paid", time: "10 Sep 2026", img: "" },
        { id: 2, name: "Priya Mehta", plan: "Quarterly Plan", amount: 3000, status: "Due", time: "10 Sep 2026", img: "" },
        { id: 3, name: "Rohit Verma", plan: "Adhoc (15 Days)", amount: 2000, status: "Overdue", time: "10 Sep 2026", img: "" }
      ]
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}