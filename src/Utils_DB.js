/**
 * Utils_DB.gs
 * Generic CRUD operations utilizing Advanced Sheets Service (batchUpdate).
 * Safely ignores and preserves formula-driven columns marked with a '*' in the header.
 */

const SPREADSHEET_ID = "1Vev8UEoNi1M4a1aWX3bp0zJ8xUjd-gmXSrTorEXDXD0";

const DB = {

  /**
   * Reads all records and maps them to an array of objects.
   * Strips '*' from header names for clean frontend usage.
   */
  read: function (sheetName) {
    const range = `${sheetName}!A1:Z`;
    const response = Sheets.Spreadsheets.Values.get(SPREADSHEET_ID, range);
    const values = response.values;

    if (!values || values.length < 2) return [];

    const headers = values[0];
    const records = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row.join('').trim()) continue; // Skip blank rows

      let obj = {};
      headers.forEach((header, index) => {
        if (header) {
          // Remove the '*' so the frontend gets clean keys (e.g., 'year*' becomes 'year')
          const cleanKey = header.replace('*', '').trim();
          obj[cleanKey] = row[index] !== undefined ? row[index] : "";
        }
      });
      obj._rowNumber = i + 1;
      records.push(obj);
    }

    return records;
  },

   /**
   * Fetches multiple sheets in a single network batch call for high performance.
   * @param {string[]} sheetNames Array of sheet titles to fetch.
   * @returns {Object} An object mapping sheet names to arrays of record objects.
   */
  batchRead: function (sheetNames) {
    const ranges = sheetNames.map(name => `${name}!A1:AZ`);
    const response = Sheets.Spreadsheets.Values.batchGet(SPREADSHEET_ID, { ranges: ranges });
    const valueRanges = response.valueRanges || [];
    const result = {};
    
    sheetNames.forEach((sheetName, idx) => {
      const values = valueRanges[idx] ? valueRanges[idx].values : [];
      if (!values || values.length < 2) {
        result[sheetName] = [];
        return;
      }
      const headers = values[0];
      const records = [];
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        if (!row.join('').trim()) continue; // Skip blank rows

        let obj = {};
        headers.forEach((header, index) => {
          if (header) {
            const cleanKey = header.replace('*', '').trim();
            obj[cleanKey] = row[index] !== undefined ? row[index] : "";
          }
        });
        obj._rowNumber = i + 1;
        records.push(obj);
      }
      result[sheetName] = records;
    });
    
    return result;
  },

  /**
   * Creates a record targeting specific cells to preserve row formulas.
   */
  create: function (sheetName, recordObj) {
    const headers = this._getHeaders(sheetName);
    const newRow = this._getNextRow(sheetName);

    recordObj.createdAt = new Date().toISOString();
    recordObj.updatedAt = new Date().toISOString();

    const dataRanges = this._buildUpdateRanges(sheetName, newRow, headers, recordObj);

    Sheets.Spreadsheets.Values.batchUpdate({
      valueInputOption: 'USER_ENTERED',
      data: dataRanges
    }, SPREADSHEET_ID);

    recordObj._rowNumber = newRow;
    return recordObj;
  },

  /**
   * Updates an existing record by looking up its row number via ID.
   */
  update: function (sheetName, recordId, updateObj) {
    const records = this.read(sheetName);

    // Find the record matching the primary ID
    const target = records.find(r =>
      r.memberId === recordId ||
      r.staffId === recordId ||
      r.expenseId === recordId ||
      r.paymentId === recordId ||
      r.id === recordId
    );

    // Fallback if recordId was explicitly passed as a numeric row number
    let rowNumber = target ? target._rowNumber : Number(recordId);

    if (!rowNumber || isNaN(rowNumber)) {
      throw new Error(`Record with ID ${recordId} not found or invalid row for update in ${sheetName}.`);
    }

    const headers = this._getHeaders(sheetName);

    updateObj.updatedAt = new Date().toISOString();

    const dataRanges = this._buildUpdateRanges(sheetName, rowNumber, headers, updateObj);

    Sheets.Spreadsheets.Values.batchUpdate({
      valueInputOption: 'USER_ENTERED',
      data: dataRanges
    }, SPREADSHEET_ID);

    return true;
  },

  /**
   * Deletes a record from a sheet based on its unique ID field (e.g., memberId, staffId, expenseId).
   */
  remove: function (sheetName, recordId) {
    const records = this.read(sheetName);

    // Find the record matching the primary ID
    const target = records.find(r =>
      r.memberId === recordId ||
      r.staffId === recordId ||
      r.expenseId === recordId ||
      r.paymentId === recordId ||
      r.id === recordId
    );

    if (!target || !target._rowNumber) {
      throw new Error(`Record with ID ${recordId} not found in ${sheetName}.`);
    }

    const rowNumber = target._rowNumber;

    // 100% Advanced Sheets Service: Fetch sheet metadata directly via REST API
    const ssMeta = Sheets.Spreadsheets.get(SPREADSHEET_ID);
    const sheetObj = ssMeta.sheets.find(s => s.properties.title === sheetName);

    if (!sheetObj) {
      throw new Error(`Sheet ${sheetName} not found.`);
    }

    const sheetId = sheetObj.properties.sheetId;

    // Advanced Sheets Service (v4): DeleteDimensionRequest
    // API indices are 0-based. startIndex is inclusive, endIndex is exclusive.
    const requests = [
      {
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber
          }
        }
      }
    ];

    Sheets.Spreadsheets.batchUpdate({ requests: requests }, SPREADSHEET_ID);

    return true;
  },

  // --- INTERNAL HELPER FUNCTIONS ---

  _getHeaders: function (sheetName) {
    const range = `${sheetName}!A1:Z1`;
    const response = Sheets.Spreadsheets.Values.get(SPREADSHEET_ID, range);
    return response.values[0];
  },

  _getNextRow: function (sheetName) {
    const response = Sheets.Spreadsheets.Values.get(SPREADSHEET_ID, `${sheetName}!A:A`);
    const values = response.values || [];
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] && values[i][0]) return i + 2;
    }
    return 2;
  },

  _buildUpdateRanges: function (sheetName, rowNumber, headers, payloadObj) {
    const dataRanges = [];

    headers.forEach((header, index) => {
      // 1. If the header has a '*', skip it entirely to protect the formula
      if (header.includes('*')) return;

      // 2. Map the payload key (which won't have a '*')
      const cleanKey = header.trim();

      if (payloadObj.hasOwnProperty(cleanKey)) {
        const colLetter = this._indexToLetter(index + 1);
        dataRanges.push({
          range: `${sheetName}!${colLetter}${rowNumber}`,
          values: [[payloadObj[cleanKey]]]
        });
      }
    });

    return dataRanges;
  },

  _indexToLetter: colToLetter
};

/**
 * Universal 1-based column index to letter converter (e.g. 1 -> A, 27 -> AA).
 */
function colToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}
const _colToLetter = colToLetter;

/**
 * Robust date parser supporting DD-MMM-YYYY, ISO strings, and standard dates.
 */
function parseSafeDate(dStr) {
  if (!dStr || dStr === 'N/A') return new Date("");
  if (dStr instanceof Date && !isNaN(dStr)) return dStr;
  let d = new Date(dStr);
  if (!isNaN(d)) return d;
  if (typeof dStr === 'string') {
    const parts = dStr.trim().split(/[\s\-\/\.]+/);
    const mMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    if (parts.length >= 3) {
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = isNaN(parts[1]) ? mMap[parts[1].toLowerCase()] : parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (m !== undefined && !isNaN(m) && !isNaN(day)) return new Date(y, m, day);
      }
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      const m = isNaN(parts[1]) ? mMap[parts[1].toLowerCase()] : parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[0], 10);
      if (m !== undefined && !isNaN(m) && !isNaN(day)) return new Date(y, m, day);
    }
  }
  return new Date("");
}

/**
 * GAAP-compliant Daily Proration engine using UTC dates.
 * Distributes an amount across covered calendar months.
 *
 * @param {Date|string} sDateStr - Start date
 * @param {Date|string} eDateStr - End date
 * @param {Date|string} fallbackDateStr - Fallback date if start date is missing
 * @param {number} totalAmt - Total amount to distribute
 * @param {string} accrualMode - 'split' for daily proration, or 'anchor' for cash basis
 * @param {function(number, number, number)} onInterval - Callback receiving (year, monthIndex, intervalAmount)
 */
function distributeDailyProration(sDateStr, eDateStr, fallbackDateStr, totalAmt, accrualMode, onInterval) {
  let sDate = parseSafeDate(sDateStr);
  let eDate = parseSafeDate(eDateStr);
  if (isNaN(sDate)) sDate = parseSafeDate(fallbackDateStr);
  if (isNaN(sDate)) return;

  if (accrualMode === 'split' && !isNaN(eDate) && eDate >= sDate) {
    const start = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
    const end = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
    const msPerDay = 1000 * 60 * 60 * 24;
    const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

    let totalDays = Math.floor((utcEnd - utcStart) / msPerDay) + 1;
    if (totalDays <= 0) totalDays = 1;

    const dailyRate = totalAmt / totalDays;
    let current = new Date(start);

    while (current <= end) {
      let cYear = current.getFullYear();
      let cMonth = current.getMonth();
      let endOfMonth = new Date(cYear, cMonth + 1, 0);
      let intervalEnd = (end < endOfMonth) ? end : endOfMonth;

      let utcCurrent = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
      let utcIntervalEnd = Date.UTC(intervalEnd.getFullYear(), intervalEnd.getMonth(), intervalEnd.getDate());

      let daysInInterval = Math.floor((utcIntervalEnd - utcCurrent) / msPerDay) + 1;
      let intervalAmt = daysInInterval * dailyRate;

      onInterval(cYear, cMonth, intervalAmt);
      current = new Date(cYear, cMonth + 1, 1);
    }
  } else {
    // Anchor logic (cash basis)
    onInterval(sDate.getFullYear(), sDate.getMonth(), totalAmt);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    colToLetter,
    _colToLetter,
    parseSafeDate,
    distributeDailyProration,
    SPREADSHEET_ID,
    DB
  };
}

/**
 * API_Mutations.gs
 * Handles all CREATE and UPDATE operations from the frontend forms.
 */

function api_createRecord(sheetName, payload) {
  try {
    const newRecord = DB.create(sheetName, payload);
    return { success: true, data: newRecord };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Fully dynamic global dropdown API utility using Advanced Sheets Service.
 * Returns both the dropdown options and their exact structural usages (Tab/Column maps).
 */
function api_getGlobalDropdowns() {
  try {
    const sheetName = 'DROP_DOWN';

    // 1. Fetch metadata columns A through G to find schemas
    const metaResponse = Sheets.Spreadsheets.Values.get(SPREADSHEET_ID, `'${sheetName}'!A:G`);
    const metaValues = metaResponse.values;

    if (!metaValues || metaValues.length < 2) {
      return { success: true, data: { options: {}, schemas: {} } };
    }

    const schemas = [];
    const schemaMetaMap = {};

    // Skip header row (index 0)
    for (let i = 1; i < metaValues.length; i++) {
      const row = metaValues[i];
      if (row[0] && row[0].toString().trim() !== '') {
        const schemaObj = {
          key: row[0],                              // e.g., 'status', 'batch'
          name: row[1],                             // e.g., 'Status'
          prefix: row[2],                           // e.g., 'STA'
          columns: row[3] ? JSON.parse(row[3]) : [], // [{key: 'id', label: 'ID'}, ...]
          usages: row[4] ? JSON.parse(row[4]) : [],  // [{tab: 'MEMBERS', column: 'status'}, ...]
          startCol: Number(row[5]),                 // 1-based start column index
          numCols: Number(row[6])                   // Total columns for this block
        };

        schemas.push(schemaObj);
        schemaMetaMap[schemaObj.key] = schemaObj;
      }
    }

    if (schemas.length === 0) {
      return { success: true, data: { options: {}, schemas: {} } };
    }

    // 2. Build batched ranges to fetch all option data blocks simultaneously
    const ranges = schemas.map(sch => {
      const startLetter = _colToLetter(sch.startCol);
      const endLetter = _colToLetter(sch.startCol + sch.numCols - 1);
      return `'${sheetName}'!${startLetter}3:${endLetter}200`;
    });

    const response = Sheets.Spreadsheets.Values.batchGet(SPREADSHEET_ID, { ranges: ranges });
    const globalOptions = {};

    if (response.valueRanges) {
      response.valueRanges.forEach((vr, i) => {
        const sch = schemas[i];
        const list = [];

        if (vr.values) {
          vr.values.forEach(row => {
            if (row[0] && row[0].toString().trim() !== '') {
              let obj = {};
              sch.columns.forEach((col, colIdx) => {
                obj[col.key] = row[colIdx] !== undefined ? row[colIdx] : '';
              });
              list.push(obj);
            }
          });
        }

        globalOptions[sch.key] = list;
      });
    }

    return {
      success: true,
      data: {
        options: globalOptions,     // Use this to populate dropdown lists in UI forms
        schemas: schemaMetaMap      // Use this to check usages, column maps, and prefixes dynamically
      }
    };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}


/**
 * Generates a prefixed unique ID.
 * @param {string} prefix - The module prefix (e.g., 'MEM', 'EXP', 'STF')
 * @return {string} A unique ID like "EXP-4B2C9A"
 */
function generateId(prefix) {
  const uniquePart = Utilities.getUuid().substring(0, 6).toUpperCase();
  return `${prefix}-${uniquePart}`;
}

/**
 * Uploads a base64 encoded image to a Google Drive folder specified in the SETTINGS tab.
 * 
 * @param {string} base64Data - The base64 string (can include the "data:image/png;base64," prefix)
 * @param {string} filename - The desired name for the file (e.g., "MEM-1234.png")
 * @returns {object} { success: boolean, url: string, error: string }
 */
function api_uploadImageToDrive(base64Data, filename) {
  try {
    if (!base64Data) throw new Error("No image data provided.");

    // 1. Fetch the DRIVE_ID from the SETTINGS tab
    // Assuming you have the DB utility from your architecture
    const settingsRows = DB.read('SETTINGS') || [];
    let driveId = '';
    
    const driveSetting = settingsRows.find(s => {
      const k = String(s.key || s.setting || s.Name || '').toLowerCase();
      return k === 'drive_id' || k === 'drive id';
    });

    if (driveSetting) {
      driveId = String(driveSetting.value || driveSetting.Value || '').trim();
    }

    if (!driveId) {
      throw new Error("DRIVE_ID is missing or not configured in the SETTINGS tab.");
    }

    // 2. Parse and decode the Base64 string
    let data = base64Data;
    let contentType = 'image/png'; // Fallback default
    
    if (data.indexOf('data:') === 0) {
      const parts = data.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match && match.length > 1) contentType = match[1];
      data = parts[1]; 
    }

    const decodedData = Utilities.base64Decode(data);
    const safeFilename = filename ? filename : ('Upload_' + new Date().getTime());
    const blob = Utilities.newBlob(decodedData, contentType, safeFilename);

    // 3. Save to Google Drive
    const folder = DriveApp.getFolderById(driveId);
    const file = folder.createFile(blob);

    // 4. Set permissions so the frontend can render the image URL
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 5. Generate a direct view URL suitable for <img> tags
    const fileId = file.getId();
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

    return { 
      success: true, 
      url: directUrl, 
      fileId: fileId, 
      message: "Image uploaded successfully." 
    };

  } catch (error) {
    return { success: false, error: error.toString() };
  }
}