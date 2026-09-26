/**
 * API_Expenses.gs
 * Handles server-side operations for the Expenses module.
 */

function api_getExpenses() {
  try {
    const expenses = DB.read('EXPENSES') || [];
    return { success: true, data: expenses };
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
    
    let savedData;
    if (expenseData.expenseId) {
      savedData = DB.update('EXPENSES', expenseData.expenseId, expenseData);
    } else {
      expenseData.expenseId = generateId('EXP');
      expenseData.createdAt = now;
      expenseData.createdBy = userEmail;
      
      savedData = DB.create('EXPENSES', expenseData);
    }
    
    return { 
      success: true, 
      data: savedData, 
      message: expenseData.expenseId ? "Expense updated successfully." : "Expense added successfully." 
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