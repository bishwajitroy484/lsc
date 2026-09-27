const fs = require('fs');
const path = require('path');

function loadSettingsApi() {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Settings.js'), 'utf8');

  return new Function(
    'DB',
    'SpreadsheetApp',
    'Sheets',
    'SPREADSHEET_ID',
    '_colToLetter',
    `
      ${source};
      return { api_getGeneralSettings, api_saveGeneralSettings };
    `
  )(
    {
      read: jest.fn(() => [
        { key: 'GYM_NAME', value: 'Lakeside Gym' },
        { key: 'Revenue_Recognition', value: 'split' }
      ])
    },
    {
      openById: jest.fn(() => ({
        getSheetByName: jest.fn(() => ({
          getLastRow: jest.fn(() => 3),
          getRange: jest.fn(() => ({
            clearContent: jest.fn(),
            setValues: jest.fn()
          }))
        }))
      }))
    },
    {},
    'spreadsheet-id-123',
    (n) => {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let result = '';
      let num = n;
      while (num > 0) {
        const rem = (num - 1) % 26;
        result = letters[rem] + result;
        num = Math.floor((num - 1) / 26);
      }
      return result;
    }
  );
}

describe('Settings Module', () => {
  test('api_getGeneralSettings loads saved settings rows from the SETTINGS sheet', () => {
    const settingsApi = loadSettingsApi();
    const response = settingsApi.api_getGeneralSettings();

    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data[0].key).toBe('GYM_NAME');
    expect(response.data[1].value).toBe('split');
  });

  test('api_saveGeneralSettings persists a valid payload without wiping the sheet', () => {
    const settingsApi = loadSettingsApi();
    const sheet = {
      getLastRow: jest.fn(() => 3),
      getRange: jest.fn(() => ({
        clearContent: jest.fn(),
        setValues: jest.fn()
      }))
    };

    const SpreadsheetApp = {
      openById: jest.fn(() => ({
        getSheetByName: jest.fn(() => sheet)
      }))
    };

    const source = fs.readFileSync(path.join(__dirname, '../src/API_Settings.js'), 'utf8');
    const settingsApiWithSheet = new Function(
      'DB',
      'SpreadsheetApp',
      'Sheets',
      'SPREADSHEET_ID',
      '_colToLetter',
      `
        ${source};
        return { api_getGeneralSettings, api_saveGeneralSettings };
      `
    )(
      { read: jest.fn(() => [{ key: 'GYM_NAME', value: 'Lakeside Gym' }]) },
      SpreadsheetApp,
      {},
      'spreadsheet-id-123',
      (n) => {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        let num = n;
        while (num > 0) {
          const rem = (num - 1) % 26;
          result = letters[rem] + result;
          num = Math.floor((num - 1) / 26);
        }
        return result;
      }
    );

    const payload = [
      { key: 'GYM_NAME', value: 'Lakeside Gym' },
      { key: 'Revenue_Recognition', value: 'anchor' }
    ];

    const response = settingsApiWithSheet.api_saveGeneralSettings(payload);
    expect(response.success).toBe(true);
    expect(response.message).toContain('General Settings saved successfully');
    expect(sheet.getRange).toHaveBeenCalled();
  });
});
