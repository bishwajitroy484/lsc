/**
 * API_Settings.gs
 * High-Speed Headless CMS engine.
 */

// _colToLetter is provided by Utils_DB.gs (colToLetter)

function api_getSheetStructure() {
  try {
    const ssMeta = Sheets.Spreadsheets.get(SPREADSHEET_ID);
    const sheetNames = ssMeta.sheets
      .map(s => s.properties.title)
      .filter(name => name !== 'DROP_DOWN' && name !== 'AUDIT_LOG');

    const structure = {};
    if (sheetNames.length === 0) return { success: true, data: structure };

    const ranges = sheetNames.map(name => `'${name}'!A1:Z1`);
    const response = Sheets.Spreadsheets.Values.batchGet(SPREADSHEET_ID, { ranges: ranges });

    if (response.valueRanges) {
      response.valueRanges.forEach((vr, i) => {
        const name = sheetNames[i];
        if (vr.values && vr.values[0]) {
          structure[name] = vr.values[0].filter(h => h && h.toString().trim() !== '');
        } else {
          structure[name] = [];
        }
      });
    }

    return { success: true, data: structure };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_getDropdownConfig() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('DROP_DOWN');
    if (!sheet) throw new Error("DropDown sheet is missing.");

    // FIND LAST ROW SPECIFICALLY FOR COLUMN A
    const aValues = sheet.getRange("A:A").getValues();
    let lastMetaRow = 1;
    for (let i = aValues.length - 1; i >= 0; i--) {
      if (aValues[i][0] && aValues[i][0].toString().trim() !== "") {
        lastMetaRow = i + 1; break;
      }
    }

    const schemas = [];
    if (lastMetaRow >= 2) {
      const metaValues = sheet.getRange(2, 1, lastMetaRow - 1, 7).getValues();
      metaValues.forEach(row => {
        if (row[0] && row[0].toString().trim() !== '') {
          schemas.push({
            key: row[0],
            name: row[1],
            prefix: row[2],
            columns: row[3] ? JSON.parse(row[3]) : [],
            usages: row[4] ? JSON.parse(row[4]) : [],
            startCol: Number(row[5]),
            numCols: Number(row[6])
          });
        }
      });
    } else {
      sheet.getRange("A1:G1").setValues([["Schema Key", "Dropdown Name", "Prefix", "Columns (JSON)", "Usages (JSON)", "Start Col", "Num Cols"]])
        .setBackground("#f1f5f9").setFontWeight("bold");
    }

    const dropdowns = {};
    if (schemas.length > 0) {
      const ranges = [];
      schemas.forEach(sch => {
        if (sch.startCol && sch.numCols) {
          const startLetter = _colToLetter(sch.startCol);
          const endLetter = _colToLetter(sch.startCol + sch.numCols - 1);
          ranges.push(`'DROP_DOWN'!${startLetter}3:${endLetter}`);
        }
      });

      if (ranges.length > 0) {
        const response = Sheets.Spreadsheets.Values.batchGet(SPREADSHEET_ID, { ranges: ranges });
        if (response.valueRanges) {
          response.valueRanges.forEach((vr, i) => {
            const sch = schemas[i];
            const options = [];
            if (vr.values) {
              vr.values.forEach(row => {
                if (row[0] && row[0].toString().trim() !== '') {
                  let opt = {};
                  sch.columns.forEach((col, idx) => {
                    opt[col.key] = row[idx] !== undefined ? row[idx] : '';
                  });
                  options.push(opt);
                }
              });
            }
            dropdowns[sch.key] = options;
          });
        }
      }
    } else {
      schemas.forEach(sch => dropdowns[sch.key] = []);
    }

    return { success: true, data: { schemas: schemas, dropdowns: dropdowns } };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function api_saveSchema(schemaObj) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('DROP_DOWN');
    if (!sheet) throw new Error("DROP_DOWN sheet is missing.");

    sheet.getRange("A1:G1").setValues([["Schema Key", "Dropdown Name", "Prefix", "Columns (JSON)", "Usages (JSON)", "Start Col", "Num Cols"]])
      .setBackground("#f1f5f9").setFontWeight("bold");

    // FIND LAST ROW SPECIFICALLY FOR COLUMN A
    const aValues = sheet.getRange("A:A").getValues();
    let lastMetaRow = 1;
    for (let i = aValues.length - 1; i >= 0; i--) {
      if (aValues[i][0] && aValues[i][0].toString().trim() !== "") {
        lastMetaRow = i + 1; break;
      }
    }

    let metaValues = [];
    if (lastMetaRow >= 2) metaValues = sheet.getRange(2, 1, lastMetaRow - 1, 7).getValues();

    let rowIndexToUpdate = -1;
    let existingSchema = null;
    let maxUsedCol = 8; // Columns A through H are reserved

    for (let i = 0; i < metaValues.length; i++) {
      let sCol = Number(metaValues[i][5]);
      let nCol = Number(metaValues[i][6]);
      if (sCol + nCol - 1 > maxUsedCol) {
        maxUsedCol = sCol + nCol - 1;
      }

      if (metaValues[i][0] === schemaObj.key) {
        rowIndexToUpdate = i + 2;
        existingSchema = { startCol: sCol, numCols: nCol };
      }
    }

    schemaObj.numCols = schemaObj.columns.length;

    if (rowIndexToUpdate > -1) {
      schemaObj.startCol = existingSchema.startCol;
      let delta = schemaObj.numCols - existingSchema.numCols;

      if (delta !== 0) {
        try { sheet.getRange(1, existingSchema.startCol, 1, existingSchema.numCols).breakApart(); } catch (e) { }

        if (delta > 0) {
          sheet.insertColumnsAfter(existingSchema.startCol + existingSchema.numCols - 1, delta);
        } else if (delta < 0) {
          sheet.deleteColumns(existingSchema.startCol + schemaObj.numCols, Math.abs(delta));
        }

        // Update tracking metadata for shifted neighbors
        for (let i = 0; i < metaValues.length; i++) {
          let loopSchemaStart = Number(metaValues[i][5]);
          if (loopSchemaStart > existingSchema.startCol) {
            metaValues[i][5] = loopSchemaStart + delta;
            sheet.getRange(i + 2, 6).setValue(metaValues[i][5]);
          }
        }
      }
    } else {
      rowIndexToUpdate = lastMetaRow + 1;
      schemaObj.startCol = maxUsedCol + 2;
    }

    const metaRow = [
      schemaObj.key,
      schemaObj.name,
      schemaObj.prefix,
      JSON.stringify(schemaObj.columns),
      JSON.stringify(schemaObj.usages),
      schemaObj.startCol,
      schemaObj.numCols
    ];
    sheet.getRange(rowIndexToUpdate, 1, 1, 7).setValues([metaRow]);

    if (schemaObj.startCol && schemaObj.numCols) {
      // Clear previous formatting in the exact target block
      sheet.getRange(1, schemaObj.startCol, 2, schemaObj.numCols).clearFormat().clearContent();

      // CRITICAL FIX: Force Apps Script to execute the clearing BEFORE we paint new formats
      SpreadsheetApp.flush();

      const startColIndex = schemaObj.startCol - 1;
      const endColIndex = startColIndex + schemaObj.numCols;
      const headers = schemaObj.columns.map(c => c.label);
      const titleString = schemaObj.name.replace(/\s+/g, '_') + "_Options";

      const requests = [];

      requests.push({
        mergeCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: 0, endRowIndex: 1, startColumnIndex: startColIndex, endColumnIndex: endColIndex }, mergeType: "MERGE_ALL" }
      });

      requests.push({
        repeatCell: {
          range: { sheetId: sheet.getSheetId(), startRowIndex: 0, endRowIndex: 1, startColumnIndex: startColIndex, endColumnIndex: endColIndex },
          cell: {
            userEnteredFormat: { backgroundColor: { red: 153 / 255, green: 0, blue: 0 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }, horizontalAlignment: "CENTER" },
            userEnteredValue: { stringValue: titleString }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment),userEnteredValue"
        }
      });

      const headerCells = headers.map(h => ({
        userEnteredValue: { stringValue: h },
        userEnteredFormat: { backgroundColor: { red: 1, green: 242 / 255, blue: 204 / 255 }, textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: true }, horizontalAlignment: "CENTER" }
      }));

      requests.push({
        updateCells: { rows: [{ values: headerCells }], fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)", start: { sheetId: sheet.getSheetId(), rowIndex: 1, columnIndex: startColIndex } }
      });

      requests.push({
        autoResizeDimensions: { dimensions: { sheetId: sheet.getSheetId(), dimension: "COLUMNS", startIndex: startColIndex, endIndex: endColIndex } }
      });

      Sheets.Spreadsheets.batchUpdate({ requests: requests }, SPREADSHEET_ID);
    }

    return { success: true, message: "Schema saved successfully." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_saveDropdownOptions(categoryKey, optionsArray) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('DROP_DOWN');
    if (!sheet) throw new Error("DROP_DOWN sheet is missing.");

    const aValues = sheet.getRange("A:A").getValues();
    let lastMetaRow = 1;
    for (let i = aValues.length - 1; i >= 0; i--) {
      if (aValues[i][0] && aValues[i][0].toString().trim() !== "") {
        lastMetaRow = i + 1; break;
      }
    }

    if (lastMetaRow < 2) throw new Error("No schemas found.");

    const metaValues = sheet.getRange(2, 1, lastMetaRow - 1, 7).getValues();
    let schema = null;

    for (let i = 0; i < metaValues.length; i++) {
      if (metaValues[i][0] === categoryKey) {
        schema = {
          key: metaValues[i][0],
          columns: metaValues[i][3] ? JSON.parse(metaValues[i][3]) : [],
          startCol: Number(metaValues[i][5]),
          numCols: Number(metaValues[i][6])
        };
        break;
      }
    }

    if (!schema || !schema.startCol) throw new Error("Schema mapping not found.");

    const startLetter = _colToLetter(schema.startCol);
    const endLetter = _colToLetter(schema.startCol + schema.numCols - 1);

    const clearRange = `'DROP_DOWN'!${startLetter}3:${endLetter}200`;
    Sheets.Spreadsheets.Values.clear({}, SPREADSHEET_ID, clearRange);

    if (optionsArray && optionsArray.length > 0) {
      const writeData = optionsArray.map(opt => {
        let row = new Array(schema.numCols).fill('');
        schema.columns.forEach((col, idx) => {
          row[idx] = opt[col.key] || '';
        });
        return row;
      });

      Sheets.Spreadsheets.Values.update({
        values: writeData
      }, SPREADSHEET_ID, `'DROP_DOWN'!${startLetter}3`, { valueInputOption: 'USER_ENTERED' });
    }

    return { success: true, message: "Options synced to sheet." };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// --- GENERAL INFO / APP SETTINGS ---

function api_getGeneralSettings() {
  try {
    const data = DB.read('SETTINGS') || [];
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function api_saveGeneralSettings(settingsArray) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('SETTINGS');
    
    if (!sheet) throw new Error("SETTINGS sheet is missing from the database.");

    // CRITICAL FIX: Block the save if the array is completely empty to prevent wiping the sheet
    if (!settingsArray || settingsArray.length === 0) {
        throw new Error("No settings provided. Save aborted to prevent data loss.");
    }

    var uploadedLogoId = null;
    var uploadedLogoUrl = null;

    // Check if a logo image upload is provided (key === 'LOGO_ID' with base64Image)
    for (var i = 0; i < settingsArray.length; i++) {
      var item = settingsArray[i];
      var k = String((item && (item.key || item.Key)) || '').toUpperCase();
      if (item && k === 'LOGO_ID' && item.base64Image) {
        if (typeof api_uploadImageToDrive === 'function') {
          var uploadRes = api_uploadImageToDrive(item.base64Image, item.imageName || ('Gym_Logo_' + new Date().getTime()));
          if (uploadRes && uploadRes.success) {
            uploadedLogoId = uploadRes.fileId;
            uploadedLogoUrl = uploadRes.url;
            item.value = uploadRes.fileId || uploadRes.url;
          } else {
            throw new Error("Failed to upload logo to Google Drive: " + ((uploadRes && uploadRes.error) || "Unknown error"));
          }
        }
        delete item.base64Image;
        delete item.imageName;
      }
    }

    // Clear everything from Row 2 down safely
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
       sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    }
    
    // Write new array mapping safely
    const writeData = settingsArray.map(s => [
      s.key || s.Key || '',
      s.value !== undefined ? s.value : (s.Value !== undefined ? s.Value : '')
    ]);
    sheet.getRange(2, 1, writeData.length, 2).setValues(writeData);

    let triggerSync = null;
    if (typeof syncNotificationTriggers_ === 'function') {
      const settingsMap = {};
      settingsArray.forEach(item => {
        const key = String((item && (item.key || item.Key)) || '').trim().toUpperCase();
        if (key) settingsMap[key] = String(item.value !== undefined ? item.value : '').trim();
      });
      triggerSync = syncNotificationTriggers_(settingsMap);
    }
    
    return { 
      success: true, 
      message: "General Settings saved successfully.",
      logoId: uploadedLogoId,
      logoUrl: uploadedLogoUrl,
      notificationTrigger: triggerSync
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}