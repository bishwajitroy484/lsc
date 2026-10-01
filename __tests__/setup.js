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