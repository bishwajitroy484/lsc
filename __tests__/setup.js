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
    }))
};

global.requireApiAccess_ = jest.fn(() => ({ email: 'admin@gym.com', isAdmin: true }));
global.AuthApp = { token: 'test-token', email: 'admin@gym.com', isAdmin: true };