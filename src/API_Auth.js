const AUTH_TOKEN_CACHE_SECONDS = 300;
const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readAuthSettings_() {
  const rows = DB.read('SETTINGS') || [];
  const values = {};
  rows.forEach(row => {
    const key = String(row.key || row.Key || row.setting || row.Setting || '').trim().toUpperCase();
    if (key) values[key] = String(row.value !== undefined ? row.value : row.Value || '').trim();
  });
  return { rows, values };
}

function writeAuthSetting_(key, value, authSettings) {
  const row = authSettings.rows.findIndex(item =>
    String(item.key || item.Key || item.setting || item.Setting || '').trim().toUpperCase() === key
  );
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('SETTINGS');
  if (!sheet) throw new Error('SETTINGS sheet is missing from the database.');

  if (row >= 0) {
    sheet.getRange(authSettings.rows[row]._rowNumber || row + 2, 2).setValue(value);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
  }
  authSettings.values[key] = String(value);
}

function verifyGoogleIdToken_(idToken, expectedClientId) {
  if (typeof idToken !== 'string' || idToken.length > 10000) {
    throw new Error('Sign-in failed. Please sign in with Google again.');
  }

  const cache = CacheService.getScriptCache();
  const tokenHash = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)
  );
  const cached = cache.get(`google-id:${tokenHash}`);
  let claims = cached ? JSON.parse(cached) : null;

  if (!claims) {
    const response = UrlFetchApp.fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { muteHttpExceptions: true }
    );
    if (response.getResponseCode() !== 200) {
      throw new Error('Sign-in failed. Please sign in with Google again.');
    }
    claims = JSON.parse(response.getContentText());
    cache.put(`google-id:${tokenHash}`, JSON.stringify(claims), AUTH_TOKEN_CACHE_SECONDS);
  }

  const expiresAt = Number(claims.exp) * 1000;
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') {
    throw new Error('Sign-in failed. Please sign in with Google again.');
  }
  if (!claims.email || String(claims.email_verified).toLowerCase() !== 'true' ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
      (expectedClientId && claims.aud !== expectedClientId)) {
    throw new Error('Sign-in failed. Please sign in with Google again.');
  }

  return {
    email: String(claims.email).trim().toLowerCase(),
    clientId: String(claims.aud || '')
  };
}

function getAuthorizedIdentity_(idToken) {
  const authSettings = readAuthSettings_();
  const clientId = authSettings.values.AUTH_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured. Contact the app administrator.');

  const identity = verifyGoogleIdToken_(idToken, clientId);
  const ownerEmail = String(authSettings.values.OWNER_EMAIL || '').trim().toLowerCase();
  let allowedUsers = [];
  try {
    allowedUsers = JSON.parse(authSettings.values.ACCESS_USERS || '[]');
  } catch (error) {
    throw new Error('Access control settings are invalid. Contact the app administrator.');
  }
  if (!Array.isArray(allowedUsers)) throw new Error('Access control settings are invalid. Contact the app administrator.');

  const isAdmin = Boolean(ownerEmail && identity.email === ownerEmail);
  const isAllowed = isAdmin || allowedUsers.some(user =>
    String(user && user.email || '').trim().toLowerCase() === identity.email &&
    user.enabled !== false
  );
  if (!isAllowed) throw new Error('This Google account has not been granted access.');

  identity.isAdmin = isAdmin;
  return identity;
}

function requireApiAccess_(idToken, adminOnly) {
  const identity = getAuthorizedIdentity_(idToken);
  if (adminOnly && !identity.isAdmin) throw new Error('Only the app administrator can manage access.');
  return identity;
}

function api_getAuthConfig() {
  try {
    const authSettings = readAuthSettings_();
    return { success: true, data: { clientId: authSettings.values.AUTH_CLIENT_ID || '' } };
  } catch (error) {
    return { success: false, error: 'Unable to load sign-in configuration.' };
  }
}

function api_getAppBranding(authToken) {
  try {
    requireApiAccess_(authToken);
    const rows = DB.read('SETTINGS') || [];
    const branding = {};
    rows.forEach(row => {
      const key = String(row.key || row.Key || '').trim().toUpperCase();
      if (['GYM_NAME', 'LOGO_ID', 'CURRENCY_FORMAT', 'CURRENCY_STYLE'].includes(key)) {
        branding[key] = String(row.value !== undefined ? row.value : row.Value || '');
      }
    });
    return { success: true, data: branding };
  } catch (error) {
    return { success: false, error: 'Unable to load app branding.' };
  }
}

function api_authenticate(idToken, bootstrapClientId) {
  try {
    const authSettings = readAuthSettings_();
    const ownerEmail = String(authSettings.values.OWNER_EMAIL || '').trim().toLowerCase();
    if (!ownerEmail || !AUTH_EMAIL_PATTERN.test(ownerEmail)) {
      throw new Error('The app administrator email must be configured in General Settings.');
    }

    let clientId = authSettings.values.AUTH_CLIENT_ID || '';
    if (!clientId) {
      const proposedClientId = String(bootstrapClientId || '').trim();
      if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(proposedClientId)) {
        throw new Error('Enter a valid Google OAuth client ID to set up sign-in.');
      }
      const identity = verifyGoogleIdToken_(idToken, proposedClientId);
      if (identity.email !== ownerEmail) throw new Error('Only the configured administrator can set up sign-in.');
      writeAuthSetting_('AUTH_CLIENT_ID', proposedClientId, authSettings);
      clientId = proposedClientId;
    }

    const identity = getAuthorizedIdentity_(idToken);
    if (identity.isAdmin) ensureMemberExitDateTrigger_();
    return {
      success: true,
      data: { email: identity.email, isAdmin: identity.isAdmin }
    };
  } catch (error) {
    return { success: false, error: error.message || 'Google sign-in failed.' };
  }
}

function api_getAccessControl(idToken) {
  try {
    requireApiAccess_(idToken, true);
    const authSettings = readAuthSettings_();
    let users = [];
    try {
      users = JSON.parse(authSettings.values.ACCESS_USERS || '[]');
    } catch (error) {
      throw new Error('Access control settings are invalid.');
    }
    if (!Array.isArray(users)) throw new Error('Access control settings are invalid.');
    return { success: true, data: users, adminEmail: authSettings.values.OWNER_EMAIL || '' };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to load access control.' };
  }
}

function api_saveAccessControl(idToken, userEmail) {
  try {
    requireApiAccess_(idToken, true);
    const email = String(userEmail || '').trim().toLowerCase();
    const authSettings = readAuthSettings_();
    const ownerEmail = String(authSettings.values.OWNER_EMAIL || '').trim().toLowerCase();
    if (!AUTH_EMAIL_PATTERN.test(email)) throw new Error('Enter a valid email address.');
    if (email === ownerEmail) throw new Error('The administrator already has access.');

    let users = JSON.parse(authSettings.values.ACCESS_USERS || '[]');
    if (!Array.isArray(users)) throw new Error('Access control settings are invalid.');
    if (users.some(user => String(user && user.email || '').trim().toLowerCase() === email)) {
      throw new Error('This email already has access.');
    }
    users.push({ email, enabled: true, addedAt: new Date().toISOString() });
    writeAuthSetting_('ACCESS_USERS', JSON.stringify(users), authSettings);
    return { success: true, data: users, message: 'Access granted.' };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to grant access.' };
  }
}

function api_removeAccessControl(idToken, userEmail) {
  try {
    requireApiAccess_(idToken, true);
    const email = String(userEmail || '').trim().toLowerCase();
    const authSettings = readAuthSettings_();
    let users = JSON.parse(authSettings.values.ACCESS_USERS || '[]');
    if (!Array.isArray(users)) throw new Error('Access control settings are invalid.');
    const updatedUsers = users.filter(user => String(user && user.email || '').trim().toLowerCase() !== email);
    if (updatedUsers.length === users.length) throw new Error('Authorized email was not found.');
    writeAuthSetting_('ACCESS_USERS', JSON.stringify(updatedUsers), authSettings);
    return { success: true, data: updatedUsers, message: 'Access removed.' };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to remove access.' };
  }
}
