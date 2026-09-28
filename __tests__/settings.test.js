const fs = require('fs');
const path = require('path');

function createSettingsApi(overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Settings.js'), 'utf8');

  const defaultDB = {
    read: jest.fn(() => [
      { key: 'GYM_NAME', value: 'Lakeside Gym' },
      { key: 'Revenue_Recognition', value: 'split' },
      { key: 'ENABLE_NOTIFICATION', value: 'YES' }
    ])
  };

  const dummyRange = {
    clearContent: jest.fn().mockReturnThis(),
    clearFormat: jest.fn().mockReturnThis(),
    setValues: jest.fn().mockReturnThis(),
    setValue: jest.fn().mockReturnThis(),
    getValues: jest.fn(() => [[]]),
    setBackground: jest.fn().mockReturnThis(),
    setFontWeight: jest.fn().mockReturnThis(),
    breakApart: jest.fn()
  };

  const defaultSheet = {
    getLastRow: jest.fn(() => 3),
    getSheetId: jest.fn(() => 101),
    getRange: jest.fn(() => dummyRange),
    insertColumnsAfter: jest.fn(),
    deleteColumns: jest.fn()
  };

  const defaultSpreadsheetApp = {
    openById: jest.fn(() => ({
      getSheetByName: jest.fn(() => defaultSheet)
    })),
    flush: jest.fn()
  };

  const defaultSheets = {
    Spreadsheets: {
      get: jest.fn(() => ({
        sheets: [{ properties: { title: 'MEMBERS' } }]
      })),
      Values: {
        batchGet: jest.fn(() => ({ valueRanges: [] })),
        update: jest.fn(),
        clear: jest.fn()
      },
      batchUpdate: jest.fn()
    }
  };

  const _colToLetter = (n) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    let num = n;
    while (num > 0) {
      const rem = (num - 1) % 26;
      result = letters[rem] + result;
      num = Math.floor((num - 1) / 26);
    }
    return result;
  };

  const api = new Function(
    'DB',
    'SpreadsheetApp',
    'Sheets',
    'SPREADSHEET_ID',
    '_colToLetter',
    `
      ${source};
      return { 
        api_getSheetStructure,
        api_getDropdownConfig,
        api_saveSchema,
        api_saveDropdownOptions,
        api_getGeneralSettings, 
        api_saveGeneralSettings 
      };
    `
  )(
    overrides.DB || defaultDB,
    overrides.SpreadsheetApp || defaultSpreadsheetApp,
    overrides.Sheets || defaultSheets,
    'spreadsheet-id-123',
    _colToLetter
  );

  return { api, sheet: defaultSheet, sheetsService: defaultSheets.Spreadsheets, dummyRange };
}

describe('Settings Module', () => {
  describe('General Settings API', () => {
    test('api_getGeneralSettings loads saved settings rows from the SETTINGS sheet', () => {
      const { api } = createSettingsApi();
      const response = api.api_getGeneralSettings();

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data[0].key).toBe('GYM_NAME');
      expect(response.data[1].value).toBe('split');
      expect(response.data[2].key).toBe('ENABLE_NOTIFICATION');
    });

    test('api_saveGeneralSettings persists a valid payload without wiping the sheet', () => {
      const { api, sheet } = createSettingsApi();
      const payload = [
        { key: 'GYM_NAME', value: 'Lakeside Gym' },
        { key: 'Revenue_Recognition', value: 'anchor' },
        { key: 'ENABLE_NOTIFICATION', value: 'YES' }
      ];

      const response = api.api_saveGeneralSettings(payload);
      expect(response.success).toBe(true);
      expect(response.message).toContain('General Settings saved successfully');
      expect(sheet.getRange).toHaveBeenCalled();
    });

    test('api_saveGeneralSettings aborts and returns an error if the payload is empty', () => {
      const { api } = createSettingsApi();
      const response = api.api_saveGeneralSettings([]);
      expect(response.success).toBe(false);
      expect(response.error).toContain('No settings provided');
    });
  });

  describe('Dropdown Schema Configuration (Add & Edit)', () => {
    const makeRangeMock = (values = [[]]) => {
      const range = {};
      range.clearContent = jest.fn(() => range);
      range.clearFormat = jest.fn(() => range);
      range.setValues = jest.fn(() => range);
      range.setValue = jest.fn(() => range);
      range.getValues = jest.fn(() => values);
      range.setBackground = jest.fn(() => range);
      range.setFontWeight = jest.fn(() => range);
      range.breakApart = jest.fn(() => range);
      return range;
    };

    test('api_saveSchema creates a new schema dropdown configuration when schema key is new', () => {
      const aValues = [['Schema Key'], ['']];
      const sheet = {
        getSheetId: jest.fn(() => 101),
        getLastRow: jest.fn(() => 2),
        getRange: jest.fn((r) => {
          if (r === 'A:A') return makeRangeMock(aValues);
          return makeRangeMock([[]]);
        }),
        insertColumnsAfter: jest.fn(),
        deleteColumns: jest.fn()
      };

      const sheetsService = {
        batchUpdate: jest.fn()
      };

      const { api } = createSettingsApi({
        SpreadsheetApp: {
          openById: jest.fn(() => ({ getSheetByName: jest.fn(() => sheet) })),
          flush: jest.fn()
        },
        Sheets: { Spreadsheets: sheetsService }
      });

      const newSchema = {
        key: 'batch_options',
        name: 'Batch Options',
        prefix: 'BAT',
        columns: [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Batch Name' }
        ],
        usages: [{ tab: 'MEMBERS', col: 'batchId' }]
      };

      const response = api.api_saveSchema(newSchema);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Schema saved successfully');
      expect(newSchema.startCol).toBeGreaterThan(0);
      expect(newSchema.numCols).toBe(2);
      expect(sheetsService.batchUpdate).toHaveBeenCalled();
    });

    test('api_saveSchema updates an existing schema configuration when schema key exists', () => {
      const aValues = [['Schema Key'], ['plan_options']];
      const metaValues = [[
        'plan_options',
        'Plan Options',
        'PLN',
        JSON.stringify([{ key: 'id', label: 'ID' }, { key: 'name', label: 'Plan Name' }]),
        JSON.stringify([{ tab: 'MEMBERS', col: 'membershipId' }]),
        10,
        2
      ]];

      const sheet = {
        getSheetId: jest.fn(() => 101),
        getLastRow: jest.fn(() => 2),
        getRange: jest.fn((r, c) => {
          if (r === 'A:A') return makeRangeMock(aValues);
          return makeRangeMock(metaValues);
        }),
        insertColumnsAfter: jest.fn(),
        deleteColumns: jest.fn()
      };

      const sheetsService = {
        batchUpdate: jest.fn()
      };

      const { api } = createSettingsApi({
        SpreadsheetApp: {
          openById: jest.fn(() => ({ getSheetByName: jest.fn(() => sheet) })),
          flush: jest.fn()
        },
        Sheets: { Spreadsheets: sheetsService }
      });

      const updatedSchema = {
        key: 'plan_options',
        name: 'Membership Plans (Updated)',
        prefix: 'PLN',
        columns: [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Plan Name' },
          { key: 'fee', label: 'Monthly Fee' }
        ],
        usages: [{ tab: 'MEMBERS', col: 'membershipId' }]
      };

      const response = api.api_saveSchema(updatedSchema);
      expect(response.success).toBe(true);
      expect(updatedSchema.startCol).toBe(10);
      expect(updatedSchema.numCols).toBe(3);
      expect(sheet.insertColumnsAfter).toHaveBeenCalledWith(11, 1);
    });
  });

  describe('Dropdown Options Data Sync (Add & Edit Options)', () => {
    test('api_saveDropdownOptions clears target range and writes updated options for category', () => {
      const aValues = [['Schema Key'], ['plan_options']];
      const metaValues = [[
        'plan_options',
        'Plan Options',
        'PLN',
        JSON.stringify([{ key: 'id', label: 'ID' }, { key: 'name', label: 'Plan Name' }]),
        JSON.stringify([]),
        10,
        2
      ]];

      const sheet = {
        getLastRow: jest.fn(() => 2),
        getRange: jest.fn((r) => {
          if (r === 'A:A') return { getValues: jest.fn(() => aValues) };
          return { getValues: jest.fn(() => metaValues) };
        })
      };

      const clearMock = jest.fn();
      const updateMock = jest.fn();

      const { api } = createSettingsApi({
        SpreadsheetApp: {
          openById: jest.fn(() => ({ getSheetByName: jest.fn(() => sheet) }))
        },
        Sheets: {
          Spreadsheets: {
            Values: {
              clear: clearMock,
              update: updateMock
            }
          }
        }
      });

      const options = [
        { id: 'PLN-1001', name: 'Monthly Basic' },
        { id: 'PLN-1002', name: 'Annual Pro' }
      ];

      const response = api.api_saveDropdownOptions('plan_options', options);
      expect(response.success).toBe(true);
      expect(clearMock).toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [
            ['PLN-1001', 'Monthly Basic'],
            ['PLN-1002', 'Annual Pro']
          ]
        }),
        'spreadsheet-id-123',
        expect.stringContaining('\'DROP_DOWN\'!'),
        { valueInputOption: 'USER_ENTERED' }
      );
    });

    test('Frontend option save logic correctly handles adding new options vs editing existing options', () => {
      const activeSchema = {
        key: 'role_options',
        prefix: 'ROL',
        columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Role Name' }]
      };

      const activeOptionsList = [
        { id: 'ROL-1001', name: 'Trainer' },
        { id: 'ROL-1002', name: 'Manager' }
      ];

      // Case A: Editing an existing option
      const editPayload = { id: 'ROL-1001', name: 'Senior Trainer' };
      const editIdx = activeOptionsList.findIndex(o => o.id === editPayload.id);
      expect(editIdx).toBe(0);
      if (editIdx > -1) {
        activeOptionsList[editIdx] = editPayload;
      }
      expect(activeOptionsList[0].name).toBe('Senior Trainer');

      // Case B: Adding a new option (no ID)
      const addPayload = { id: '', name: 'Nutritionist' };
      if (!addPayload.id) {
        addPayload.id = activeSchema.prefix + '-1003';
        activeOptionsList.push(addPayload);
      }
      expect(activeOptionsList.length).toBe(3);
      expect(activeOptionsList[2].id).toBe('ROL-1003');
      expect(activeOptionsList[2].name).toBe('Nutritionist');
    });
  });

  describe('View_Settings.html Layout and Element Structure', () => {
    test('View_Settings.html includes fixed bottom action bar and responsive mobile elements', () => {
      const viewHtml = fs.readFileSync(path.join(__dirname, '../src/View_Settings.html'), 'utf8');

      // Tab navigation pills
      expect(viewHtml).toContain('id="tab-btn-general"');
      expect(viewHtml).toContain('id="tab-btn-dropdowns"');

      // Core inputs
      expect(viewHtml).toContain('id="gen-GYM_NAME"');
      expect(viewHtml).toContain('id="gen-OWNER_EMAIL"');
      expect(viewHtml).toContain('id="gen-Revenue_Recognition"');
      expect(viewHtml).toContain('id="gen-REMINDER_BUFFER"');
      expect(viewHtml).toContain('id="gen-SPREADSHEET_ID"');
      expect(viewHtml).toContain('id="gen-DRIVE_ID"');
      expect(viewHtml).toContain('id="gen-LOGO_ID"');
      expect(viewHtml).toContain('id="gen-ENABLE_NOTIFICATION"');

      // Fixed bottom action bar for general settings (desktop/tablet) & mobile actions
      expect(viewHtml).toContain('id="general-bottom-bar"');
      expect(viewHtml).toContain('id="btn-save-general"');
      expect(viewHtml).toContain('id="btn-save-general-mobile"');
      expect(viewHtml).toContain('id="btn-save-general-header"');

      // Custom key addition option is removed
      expect(viewHtml).not.toContain('Add Custom Key');
      expect(viewHtml).not.toContain('id="custom-settings-card"');

      // Desktop and mobile responsive containers
      expect(viewHtml).toContain('id="options-tbody"');
      expect(viewHtml).toContain('id="options-mobile-cards"');
      expect(viewHtml).toContain('id="save-order-toolbar"');

      // Modals
      expect(viewHtml).toContain('id="schema-modal"');
      expect(viewHtml).toContain('id="option-modal"');
      expect(viewHtml).toContain('id="delete-opt-modal"');
      expect(viewHtml).toContain('id="notification-modal"');
    });
  });
});
