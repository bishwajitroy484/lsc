// Env IDs used by Config_Env.js / MockDataGenerator (local tests).
global.LSC_ENV = 'dev';
global.SPREADSHEET_ID = '1QM2_Ivi4hNtStWFO4QYkt7fYtIukiztHkhNVwbNNPLI';
global.LSC_DRIVE_ID = '';
global.LSC_SCRIPT_ID = '18gsDCFSfqq7XOVgVAjhctSgyeW7pjyA_QlAwbRvOtHyXgybOQkX_BPgp';
global.LSC_DEV_SCRIPT_ID = '18gsDCFSfqq7XOVgVAjhctSgyeW7pjyA_QlAwbRvOtHyXgybOQkX_BPgp';
global.LSC_PROD_SCRIPT_ID = '1z0FR65RqWh25HtPpnc68MNUx_obdbHmE5ejRHRwXpwLIS6a56xxjXpJf';
global.LSC_DEV_SPREADSHEET_ID = '1QM2_Ivi4hNtStWFO4QYkt7fYtIukiztHkhNVwbNNPLI';
global.LSC_PROD_SPREADSHEET_ID = '';

global.SpreadsheetApp = {
    getActiveSpreadsheet: jest.fn(() => ({
        getSheetByName: jest.fn(() => ({
            getDataRange: jest.fn(() => ({
                getValues: jest.fn(() => [['memberId', 'fullName'], ['MEM-123', 'John Doe']])
            })),
            appendRow: jest.fn()
        }))
    }))
};

global.Session = {
    getActiveUser: jest.fn(() => ({
        getEmail: jest.fn(() => 'admin@gym.com')
    })),
    getEffectiveUser: jest.fn(() => ({
        getEmail: jest.fn(() => 'admin@gym.com')
    }))
};

global.requirePermission_ = jest.fn(() => ({
    ok: true,
    context: { email: 'admin@gym.com', isOwner: true, allowed: true, permissions: {} }
}));

global.requireAnyViewPermission_ = jest.fn(() => ({
    ok: true,
    context: { email: 'admin@gym.com', isOwner: true, allowed: true, permissions: {} }
}));