/**
 * Access control: Google sign-in identity, USERS sheet, and per-module CRUD permissions.
 */

var ACCESS_MODULES = ['dashboard', 'members', 'staff', 'expenses', 'calendar', 'settings'];

var ACCESS_ACTIONS = ['view', 'create', 'edit', 'delete'];

var FULL_PERMISSIONS_ = {
  dashboard: { view: true, create: true, edit: true, delete: true },
  members: { view: true, create: true, edit: true, delete: true },
  staff: { view: true, create: true, edit: true, delete: true },
  expenses: { view: true, create: true, edit: true, delete: true },
  calendar: { view: true, create: true, edit: true, delete: true },
  settings: { view: true, create: true, edit: true, delete: true }
};

var VIEWER_PERMISSIONS_ = {
  dashboard: { view: true, create: false, edit: false, delete: false },
  members: { view: true, create: false, edit: false, delete: false },
  staff: { view: true, create: false, edit: false, delete: false },
  expenses: { view: true, create: false, edit: false, delete: false },
  calendar: { view: true, create: false, edit: false, delete: false },
  settings: { view: false, create: false, edit: false, delete: false }
};

var MANAGER_PERMISSIONS_ = {
  dashboard: { view: true, create: false, edit: true, delete: false },
  members: { view: true, create: true, edit: true, delete: false },
  staff: { view: true, create: true, edit: true, delete: false },
  expenses: { view: true, create: true, edit: true, delete: false },
  calendar: { view: true, create: false, edit: false, delete: false },
  settings: { view: false, create: false, edit: false, delete: false }
};

var USERS_HEADERS_ = [
  'userId',
  'email',
  'name',
  'status',
  'isOwner',
  'rolePreset',
  'permissions',
  'invitedBy',
  'loginToken',
  'createdAt',
  'updatedAt'
];

/** Request-scoped email for invitee sessions (Execute-as-Me hides Session.getActiveUser email). */
var REQUEST_AUTH_EMAIL_ = '';

function clonePermissions_(source) {
  const out = {};
  ACCESS_MODULES.forEach(function(mod) {
    const row = (source && source[mod]) || {};
    out[mod] = {
      view: !!row.view,
      create: !!row.create,
      edit: !!row.edit,
      delete: !!row.delete
    };
  });
  return out;
}

function getPresetPermissions_(preset) {
  const key = String(preset || '').trim().toLowerCase();
  if (key === 'admin') return clonePermissions_(FULL_PERMISSIONS_);
  if (key === 'manager') return clonePermissions_(MANAGER_PERMISSIONS_);
  if (key === 'viewer') return clonePermissions_(VIEWER_PERMISSIONS_);
  return clonePermissions_(VIEWER_PERMISSIONS_);
}

function parsePermissionsJson_(raw, fallbackPreset) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return clonePermissions_(Object.assign(getPresetPermissions_(fallbackPreset || 'viewer'), raw));
  }
  const text = String(raw || '').trim();
  if (!text) return getPresetPermissions_(fallbackPreset || 'viewer');
  try {
    const parsed = JSON.parse(text);
    return clonePermissions_(Object.assign(getPresetPermissions_(fallbackPreset || 'viewer'), parsed));
  } catch (error) {
    return getPresetPermissions_(fallbackPreset || 'viewer');
  }
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function isYes_(value) {
  const v = String(value || '').trim().toUpperCase();
  return v === 'YES' || v === 'Y' || v === 'TRUE' || v === '1';
}

function googleActiveEmail_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function getTemporaryUserKey_() {
  try {
    return String(Session.getTemporaryActiveUserKey() || '').trim();
  } catch (error) {
    return '';
  }
}

function bindIdentityToTemporaryKey_(email) {
  const normalized = normalizeEmail_(email);
  const key = getTemporaryUserKey_();
  if (!normalized || !key) return false;
  try {
    PropertiesService.getScriptProperties().setProperty('lsc_uid_' + key, normalized);
  } catch (error) {
    // non-fatal
  }
  try {
    authCache_().put('lsc_uid_' + key, normalized, 21600);
  } catch (error) {
    // non-fatal
  }
  return true;
}

function emailFromTemporaryKey_() {
  const key = getTemporaryUserKey_();
  if (!key) return '';
  try {
    const cached = authCache_().get('lsc_uid_' + key);
    if (cached) return normalizeEmail_(cached);
  } catch (error) {
    // continue to properties
  }
  try {
    return normalizeEmail_(PropertiesService.getScriptProperties().getProperty('lsc_uid_' + key) || '');
  } catch (error) {
    return '';
  }
}

function getActiveUserEmail_() {
  const fromGoogle = googleActiveEmail_();
  if (fromGoogle) return fromGoogle;
  const fromRequest = normalizeEmail_(REQUEST_AUTH_EMAIL_);
  if (fromRequest) return fromRequest;
  return emailFromTemporaryKey_();
}

function getEffectiveUserEmail_() {
  try {
    return normalizeEmail_(Session.getEffectiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function authCache_() {
  return CacheService.getScriptCache();
}

function withRequestEmail_(email, fn) {
  const prev = REQUEST_AUTH_EMAIL_;
  REQUEST_AUTH_EMAIL_ = normalizeEmail_(email);
  try {
    return fn();
  } finally {
    REQUEST_AUTH_EMAIL_ = prev;
  }
}

function putAuthSession_(sessionToken, email) {
  const token = String(sessionToken || '').trim();
  const normalized = normalizeEmail_(email);
  if (!token || !normalized) return;
  authCache_().put('lsc_sess_' + token, normalized, 21600);
}

function getEmailFromAuthSession_(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) return '';
  return normalizeEmail_(authCache_().get('lsc_sess_' + token) || '');
}

function putLoginOtp_(email, code) {
  authCache_().put('lsc_otp_' + normalizeEmail_(email), String(code), 600);
}

function getLoginOtp_(email) {
  return authCache_().get('lsc_otp_' + normalizeEmail_(email)) || '';
}

function clearLoginOtp_(email) {
  authCache_().remove('lsc_otp_' + normalizeEmail_(email));
}

function newAuthToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function newInviteToken_() {
  return 'inv_' + Utilities.getUuid().replace(/-/g, '');
}

function ensureUserInviteToken_(userRow) {
  if (!userRow || !userRow.userId) return '';
  const existing = String(userRow.loginToken || '').trim();
  if (existing) return existing;
  const token = newInviteToken_();
  try {
    DB.update('USERS', userRow.userId, { loginToken: token });
    userRow.loginToken = token;
  } catch (error) {
    return '';
  }
  return token;
}

function buildSessionPayload_(context) {
  const effectiveEmail = getEffectiveUserEmail_();
  const needsLogin = !context.email;
  let setup = null;
  try {
    // Avoid expensive/auth-touching setup probes during anonymous bootstrap.
    setup = needsLogin ? null : getSetupStatus_();
  } catch (error) {
    setup = null;
  }
  const fix = needsLogin
    ? 'Enter the Google email the owner invited, tap Send code, then enter the emailed code. Or open the per-user invite link (Users → link icon).'
    : (!context.allowed
      ? 'Ask the gym owner to add this Google email under Settings → Users & Access (status Active/Invited).'
      : '');
  return {
    email: context.email,
    name: context.name,
    userId: context.userId,
    status: context.status,
    isOwner: context.isOwner,
    rolePreset: context.rolePreset,
    permissions: context.permissions,
    allowed: context.allowed,
    error: context.error,
    fix: fix,
    needsLogin: needsLogin,
    isDeployer: !!(context.email && effectiveEmail && context.email === effectiveEmail),
    setup: setup,
    webAppUrl: getWebAppUrl_(),
    modules: ACCESS_MODULES
  };
}

function issueSessionForEmail_(email) {
  const normalized = normalizeEmail_(email);
  if (!normalized) {
    return {
      success: false,
      error: 'Email is required.',
      fix: 'Enter the invited Google email address.'
    };
  }
  return withRequestEmail_(normalized, function() {
    let userRow = findUserByEmail_(normalized);
    if (!userRow) {
      return {
        success: false,
        error: 'This email is not on the Users list.',
        fix: 'Gym owner: Settings → Users → Add, enter this exact Google email, save, then share the invite link or ask the user to request a login code again.'
      };
    }
    const status = String(userRow.status || '').trim().toLowerCase();
    if (status === 'disabled') {
      return {
        success: false,
        error: 'This account is disabled.',
        fix: 'Gym owner: Settings → Users → edit this user → set Status to Active or Invited.'
      };
    }
    userRow = activateInvitedUser_(userRow);
    const context = buildUserContext_(userRow, normalized);
    if (!context.allowed) {
      return {
        success: false,
        error: context.error || 'Access denied.',
        fix: 'Gym owner: confirm this user exists in Settings → Users with Active/Invited status.'
      };
    }
    bindIdentityToTemporaryKey_(normalized);
    const sessionToken = newAuthToken_();
    putAuthSession_(sessionToken, normalized);
    const data = buildSessionPayload_(context);
    data.sessionToken = sessionToken;
    data.needsLogin = false;
    data.fix = '';
    data.identityBound = !!getTemporaryUserKey_();
    return { success: true, message: 'Signed in.', data: data };
  });
}

function readSettingsMapForAccess_() {
  if (typeof readSettingsMap_ === 'function') return readSettingsMap_();
  try {
    const rows = DB.read('SETTINGS') || [];
    const map = {};
    rows.forEach(function(row) {
      const key = String(row.key || row.Key || row.setting || row.Setting || '').trim().toUpperCase();
      if (!key) return;
      map[key] = String(row.value !== undefined ? row.value : (row.Value || '')).trim();
    });
    return map;
  } catch (error) {
    return {};
  }
}

function ensureUsersSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('USERS');
  if (!sheet) {
    sheet = ss.insertSheet('USERS');
  }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, Math.max(lastCol, USERS_HEADERS_.length)).getValues()[0] || [];
  const hasHeaders = existing.some(function(cell) { return String(cell || '').trim() !== ''; });
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, USERS_HEADERS_.length).setValues([USERS_HEADERS_]);
    sheet.setFrozenRows(1);
  } else {
    const present = {};
    existing.forEach(function(cell) {
      const key = String(cell || '').trim();
      if (key) present[key] = true;
    });
    USERS_HEADERS_.forEach(function(header) {
      if (present[header]) return;
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(header);
      present[header] = true;
    });
  }
  return sheet;
}

function listUsersRecords_() {
  ensureUsersSheet_();
  try {
    return DB.read('USERS') || [];
  } catch (error) {
    return [];
  }
}

function findUserByEmail_(email) {
  const target = normalizeEmail_(email);
  if (!target) return null;
  return listUsersRecords_().find(function(row) {
    return normalizeEmail_(row.email) === target;
  }) || null;
}

function nextUserId_(rows) {
  let max = 0;
  (rows || []).forEach(function(row) {
    const match = String(row.userId || '').match(/(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return 'USR-' + String(max + 1).padStart(3, '0');
}

function seedOwnerIfEmpty_(email) {
  const rows = listUsersRecords_();
  if (rows.length) return findUserByEmail_(email);

  const settings = readSettingsMapForAccess_();
  const ownerEmail = normalizeEmail_(settings.OWNER_EMAIL);
  const effective = getEffectiveUserEmail_();
  const active = normalizeEmail_(email);

  // Seed only when the signed-in user is the deployer and/or configured owner.
  const canSeed =
    !!active &&
    ((ownerEmail && active === ownerEmail) || (effective && active === effective));

  if (!canSeed) return null;

  const now = new Date().toISOString();
  const record = {
    userId: 'USR-001',
    email: active,
    name: String(settings.OWNER_NAME || active.split('@')[0] || 'Owner').trim(),
    status: 'Active',
    isOwner: 'YES',
    rolePreset: 'Admin',
    permissions: JSON.stringify(clonePermissions_(FULL_PERMISSIONS_)),
    invitedBy: active,
    createdAt: now,
    updatedAt: now
  };

  ensureUsersSheet_();
  DB.create('USERS', record);
  return record;
}

function activateInvitedUser_(userRow) {
  if (!userRow) return userRow;
  const status = String(userRow.status || '').trim().toLowerCase();
  if (status !== 'invited') return userRow;
  try {
    DB.update('USERS', userRow.userId, { status: 'Active' });
    userRow.status = 'Active';
  } catch (error) {
    // non-fatal
  }
  return userRow;
}

function buildUserContext_(userRow, email) {
  const isOwner = !!(userRow && isYes_(userRow.isOwner));
  const status = String((userRow && userRow.status) || '').trim().toLowerCase();
  const allowed = !!(userRow && (status === 'active' || status === 'invited'));
  const preset = (userRow && userRow.rolePreset) || (isOwner ? 'Admin' : 'Viewer');
  const permissions = isOwner
    ? clonePermissions_(FULL_PERMISSIONS_)
    : parsePermissionsJson_(userRow && userRow.permissions, preset);

  return {
    email: email,
    name: userRow ? String(userRow.name || '') : '',
    userId: userRow ? String(userRow.userId || '') : '',
    status: userRow ? String(userRow.status || '') : '',
    isOwner: isOwner,
    rolePreset: preset,
    permissions: permissions,
    allowed: allowed,
    error: allowed ? '' : (email ? 'Your Google account is not authorized to use this app.' : 'Sign in with Google to continue.')
  };
}

function getCurrentUserContext_() {
  const email = getActiveUserEmail_();
  if (!email) {
    return {
      email: '',
      name: '',
      userId: '',
      status: '',
      isOwner: false,
      rolePreset: '',
      permissions: getPresetPermissions_('viewer'),
      allowed: false,
      error: 'Sign-in required. Google does not share invitee emails to this app automatically.'
    };
  }

  ensureUsersSheet_();
  let userRow = findUserByEmail_(email);
  if (!userRow) {
    userRow = seedOwnerIfEmpty_(email);
  }
  if (userRow) {
    userRow = activateInvitedUser_(userRow);
  }
  const context = buildUserContext_(userRow, email);
  if (!context.allowed && email) {
    context.error = 'Your email (' + email + ') is not authorized for this app.';
  }
  return context;
}

function hasPermission_(context, moduleName, action) {
  if (!context || !context.allowed) return false;
  if (context.isOwner) return true;
  const mod = String(moduleName || '').toLowerCase();
  const act = String(action || '').toLowerCase();
  if (ACCESS_MODULES.indexOf(mod) < 0 || ACCESS_ACTIONS.indexOf(act) < 0) return false;
  const row = context.permissions && context.permissions[mod];
  return !!(row && row[act]);
}

function requirePermission_(moduleName, action) {
  const context = getCurrentUserContext_();
  if (!context.allowed) {
    return {
      ok: false,
      response: {
        success: false,
        error: context.error || 'Access denied.',
        code: 'FORBIDDEN'
      }
    };
  }
  if (!hasPermission_(context, moduleName, action)) {
    return {
      ok: false,
      response: {
        success: false,
        error: 'You do not have permission to ' + action + ' on ' + moduleName + '.',
        code: 'FORBIDDEN'
      }
    };
  }
  return { ok: true, context: context };
}

function requireAnyViewPermission_() {
  const context = getCurrentUserContext_();
  if (!context.allowed) {
    return {
      ok: false,
      response: {
        success: false,
        error: context.error || 'Access denied.',
        code: 'FORBIDDEN'
      }
    };
  }
  const canView = context.isOwner || ACCESS_MODULES.some(function(mod) {
    return hasPermission_(context, mod, 'view');
  });
  if (!canView) {
    return {
      ok: false,
      response: {
        success: false,
        error: 'You do not have permission to view app data.',
        code: 'FORBIDDEN'
      }
    };
  }
  return { ok: true, context: context };
}

function getSetupStatus_() {
  const settings = readSettingsMapForAccess_();
  const spreadsheetOk = !!SPREADSHEET_ID;
  let settingsOk = false;
  let driveOk = false;
  try {
    const rows = DB.read('SETTINGS') || [];
    settingsOk = rows.length > 0;
  } catch (error) {
    settingsOk = false;
  }
  driveOk = !!String(settings.DRIVE_ID || '').trim();

  let mailOk = false;
  let scriptAppOk = false;
  let triggerOk = false;
  let authError = '';

  try {
    MailApp.getRemainingDailyQuota();
    mailOk = true;
  } catch (error) {
    authError = error && error.message ? error.message : String(error);
  }

  try {
    const triggers = ScriptApp.getProjectTriggers() || [];
    scriptAppOk = true;
    triggerOk = triggers.some(function(t) {
      return t.getHandlerFunction() === 'runWeeklyMemberDueReport';
    });
  } catch (error) {
    scriptAppOk = false;
    if (!authError) authError = error && error.message ? error.message : String(error);
  }

  const setupComplete = isYes_(settings.SETUP_COMPLETE);
  const servicesAuthorized = mailOk && scriptAppOk;

  return {
    spreadsheetOk: spreadsheetOk,
    settingsOk: settingsOk,
    driveOk: driveOk,
    mailOk: mailOk,
    scriptAppOk: scriptAppOk,
    triggerOk: triggerOk,
    servicesAuthorized: servicesAuthorized,
    setupComplete: setupComplete,
    authError: authError,
    gymName: String(settings.GYM_NAME || '').trim(),
    ownerEmail: String(settings.OWNER_EMAIL || '').trim(),
    needsSetup: !setupComplete || !servicesAuthorized || !driveOk
  };
}

function upsertSettingKey_(key, value) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('SETTINGS');
  if (!sheet) throw new Error('SETTINGS sheet is missing.');
  const data = sheet.getDataRange().getValues();
  const target = String(key).toUpperCase();
  for (let i = 1; i < data.length; i++) {
    const rowKey = String(data[i][0] || '').trim().toUpperCase();
    if (rowKey === target) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

/**
 * Session bootstrap for the web app UI.
 */
function getWebAppUrl_() {
  try {
    const url = ScriptApp.getService().getUrl();
    return url ? String(url) : '';
  } catch (error) {
    return '';
  }
}

function api_getSession() {
  try {
    ensureUsersSheet_();
    const context = getCurrentUserContext_();
    return {
      success: true,
      data: buildSessionPayload_(context)
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Bridge for client calls that carry an invitee session token.
 * Needed because Execute-as-Me does not expose invitee Google emails.
 */
function resolveApiFunction_(name) {
  try {
    // Global Apps Script functions are visible to Function bodies.
    return new Function('return typeof ' + name + ' === "function" ? ' + name + ' : null;')();
  } catch (error) {
    return null;
  }
}

function api_invoke(sessionToken, functionName, args) {
  try {
    const name = String(functionName || '');
    if (!/^api_[A-Za-z0-9_]+$/.test(name) || name === 'api_invoke') {
      return { success: false, error: 'Invalid API call.', fix: 'Reload the app and try again.' };
    }

    const openApis = {
      api_requestLoginCode: true,
      api_verifyLoginCode: true,
      api_redeemInviteToken: true,
      api_getSession: true
    };

    const email = googleActiveEmail_() || getEmailFromAuthSession_(sessionToken) || emailFromTemporaryKey_();
    if (!email && !openApis[name]) {
      return {
        success: false,
        error: 'Sign in required.',
        code: 'AUTH_REQUIRED',
        fix: 'Open the app, enter your invited email, send/verify the login code, or use your personal invite link.'
      };
    }

    return withRequestEmail_(email, function() {
      if (email) bindIdentityToTemporaryKey_(email);
      const fn = resolveApiFunction_(name);
      if (typeof fn !== 'function') {
        return {
          success: false,
          error: 'Unknown API: ' + name,
          fix: 'Hard-refresh the app (or open the latest /exec deployment URL).'
        };
      }
      return fn.apply(null, Array.isArray(args) ? args : []);
    });
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      fix: 'Hard-refresh and sign in again. If this continues, ask the owner to redeploy the web app.'
    };
  }
}

function api_requestLoginCode(email) {
  try {
    const normalized = normalizeEmail_(email);
    if (!normalized || normalized.indexOf('@') < 0) {
      return {
        success: false,
        error: 'Enter a valid Google email.',
        fix: 'Use the exact Gmail/Google address the owner added in Users.'
      };
    }
    ensureUsersSheet_();
    const user = findUserByEmail_(normalized);
    if (!user) {
      return {
        success: false,
        error: 'This email is not on the Users list.',
        fix: 'Gym owner: Settings → Users → Add this exact email, then ask the user to try again (or share the user invite link).'
      };
    }
    const status = String(user.status || '').trim().toLowerCase();
    if (status === 'disabled') {
      return {
        success: false,
        error: 'This account is disabled.',
        fix: 'Gym owner: Settings → Users → set Status to Active or Invited.'
      };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    putLoginOtp_(normalized, code);
    const settings = readSettingsMapForAccess_();
    const gymName = settings.GYM_NAME || settings.CLUB_NAME || 'LSC';
    try {
      MailApp.sendEmail({
        to: normalized,
        subject: gymName + ' login code',
        htmlBody:
          '<p>Your ' + gymName + ' login code is:</p>' +
          '<p style="font-size:28px;font-weight:700;letter-spacing:4px;">' + code + '</p>' +
          '<p>This code expires in 10 minutes.</p>'
      });
    } catch (mailError) {
      clearLoginOtp_(normalized);
      const mailMsg = mailError && mailError.message ? mailError.message : String(mailError);
      return {
        success: false,
        error: 'Could not email the login code. ' + mailMsg,
        code: 'MAIL_SEND_FAILED',
        fix: 'Gym owner: sign in as the deployer account → Settings → Setup & Authorization → Authorize Google services. Then the invitee can request a code again. Or share the per-user invite link (Users → link icon) which does not need email.'
      };
    }
    return {
      success: true,
      message: 'Login code sent to ' + normalized + '. Check inbox/spam.',
      fix: 'If no email arrives in 1–2 minutes, ask the owner for your personal invite link instead.'
    };
  } catch (error) {
    return {
      success: false,
      error: (error && error.message) || 'Could not send login code.',
      fix: 'Gym owner: authorize Mail in Settings → Setup, or share the per-user invite link.'
    };
  }
}

function api_verifyLoginCode(email, code) {
  try {
    const normalized = normalizeEmail_(email);
    const entered = String(code || '').trim();
    if (!normalized || !entered) {
      return {
        success: false,
        error: 'Email and login code are required.',
        fix: 'Enter both fields, or request a new code.'
      };
    }
    const expected = String(getLoginOtp_(normalized) || '');
    if (!expected || entered !== expected) {
      return {
        success: false,
        error: 'Invalid or expired login code.',
        fix: 'Request a new code (codes expire in 10 minutes) and enter it carefully.'
      };
    }
    clearLoginOtp_(normalized);
    return issueSessionForEmail_(normalized);
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      fix: 'Request a new login code and try again.'
    };
  }
}

function api_redeemInviteToken(inviteToken) {
  try {
    const token = String(inviteToken || '').trim();
    if (!token) {
      return {
        success: false,
        error: 'Invite link is missing a token.',
        fix: 'Ask the owner to copy your invite link from Settings → Users (link icon).'
      };
    }
    ensureUsersSheet_();
    const user = listUsersRecords_().find(function(row) {
      return String(row.loginToken || '').trim() === token;
    });
    if (!user) {
      return {
        success: false,
        error: 'Invalid or revoked invite link.',
        fix: 'Ask the owner to open Settings → Users and copy a fresh invite link for your user.'
      };
    }
    return issueSessionForEmail_(user.email);
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      fix: 'Ask the owner for a fresh invite link, or use email + login code.'
    };
  }
}

function api_getUserInviteLink(userId) {
  try {
    const gate = requirePermission_('settings', 'edit');
    if (!gate.ok) return gate.response;
    if (!userId) return { success: false, error: 'User id is required.' };
    ensureUsersSheet_();
    const user = listUsersRecords_().find(function(row) {
      return String(row.userId) === String(userId);
    });
    if (!user) return { success: false, error: 'User not found.' };
    const token = ensureUserInviteToken_(user);
    if (!token) return { success: false, error: 'Could not create invite token.' };
    const base = getWebAppUrl_();
    if (!base) return { success: false, error: 'Publish the web app first.' };
    const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(token);
    return {
      success: true,
      data: {
        url: url,
        email: user.email,
        userId: user.userId
      }
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Shareable /exec web app URL for invite QR / copy link.
 * USERS-sheet invites only work when this published URL allows "Anyone" (Google sign-in).
 */
function api_getWebAppShareInfo() {
  try {
    const gate = requirePermission_('settings', 'view');
    if (!gate.ok) return { success: false, error: gate.error };
    const url = getWebAppUrl_();
    return {
      success: true,
      data: {
        url: url,
        hint: url
          ? 'Share the app link or a per-user invite link. Invitees verify with a login code emailed to them (Google does not expose their email to Execute-as-Me apps).'
          : 'No published web app URL found. Deploy the web app with Who has access: Anyone.'
      }
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Triggers Google OAuth consent for Mail / ScriptApp / Sheets / Drive by touching services.
 */
function api_authorizeServices() {
  try {
    const active = getActiveUserEmail_();
    const effective = getEffectiveUserEmail_();
    if (!active) {
      return { success: false, error: 'Sign in with Google to authorize services.' };
    }
    if (effective && active !== effective) {
      return {
        success: false,
        error: 'Only the Google account that deployed this app can grant Mail, Drive, and trigger permissions.'
      };
    }

    SpreadsheetApp.openById(SPREADSHEET_ID).getName();
    ensureUsersSheet_();
    MailApp.getRemainingDailyQuota();
    ScriptApp.getProjectTriggers();

    const settings = readSettingsMapForAccess_();
    if (settings.DRIVE_ID) {
      try {
        DriveApp.getFolderById(String(settings.DRIVE_ID).trim());
      } catch (driveError) {
        // Drive may still need config; do not fail authorization entirely
      }
    }

    upsertSettingKey_('SERVICES_AUTHORIZED', 'YES');
    return {
      success: true,
      message: 'Google services authorized successfully.',
      data: getSetupStatus_()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      data: getSetupStatus_()
    };
  }
}

function api_getSetupStatus() {
  try {
    const context = getCurrentUserContext_();
    if (!context.email) {
      return { success: false, error: 'Sign in with Google to continue.', code: 'FORBIDDEN' };
    }
    const isDeployer = context.email === getEffectiveUserEmail_();
    if (!context.allowed && !isDeployer) {
      return { success: false, error: context.error || 'Access denied.', code: 'FORBIDDEN' };
    }
    return { success: true, data: getSetupStatus_() };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function api_markSetupComplete() {
  try {
    const gate = requirePermission_('settings', 'edit');
    if (!gate.ok) {
      const context = getCurrentUserContext_();
      if (!context.isOwner && !context.allowed) return gate.response;
      if (!context.isOwner && !hasPermission_(context, 'settings', 'edit')) return gate.response;
    }
    upsertSettingKey_('SETUP_COMPLETE', 'YES');
    return { success: true, message: 'Setup marked complete.', data: getSetupStatus_() };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function api_listUsers() {
  try {
    const gate = requirePermission_('settings', 'edit');
    if (!gate.ok) {
      // Allow settings.view to list read-only
      const viewGate = requirePermission_('settings', 'view');
      if (!viewGate.ok) return viewGate.response;
    }
    ensureUsersSheet_();
    const base = getWebAppUrl_();
    const rows = listUsersRecords_().map(function(row) {
      const token = String(row.loginToken || '').trim() || ensureUserInviteToken_(row);
      const inviteUrl = (base && token)
        ? (base + (base.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(token))
        : '';
      return {
        userId: row.userId,
        email: row.email,
        name: row.name,
        status: row.status,
        isOwner: isYes_(row.isOwner),
        rolePreset: row.rolePreset || 'Viewer',
        permissions: parsePermissionsJson_(row.permissions, row.rolePreset || 'Viewer'),
        invitedBy: row.invitedBy || '',
        inviteUrl: inviteUrl,
        createdAt: row.createdAt || '',
        updatedAt: row.updatedAt || ''
      };
    });
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function api_saveUser(userData) {
  try {
    const gate = requirePermission_('settings', 'edit');
    if (!gate.ok) return gate.response;

    const payload = userData || {};
    const email = normalizeEmail_(payload.email);
    if (!email || email.indexOf('@') < 0) {
      return { success: false, error: 'A valid Google email is required.' };
    }

    ensureUsersSheet_();
    const rows = listUsersRecords_();
    const existing = payload.userId
      ? rows.find(function(r) { return String(r.userId) === String(payload.userId); })
      : findUserByEmail_(email);

    const rolePreset = String(payload.rolePreset || 'Viewer').trim() || 'Viewer';
    const permissions = payload.permissions
      ? clonePermissions_(payload.permissions)
      : getPresetPermissions_(rolePreset);
    const status = String(payload.status || (existing ? existing.status : 'Invited')).trim() || 'Invited';
    const name = String(payload.name || email.split('@')[0]).trim();
    const isOwner = payload.isOwner === true || isYes_(payload.isOwner);

    if (existing) {
      if (isYes_(existing.isOwner) && !isOwner) {
        const owners = rows.filter(function(r) { return isYes_(r.isOwner); });
        if (owners.length <= 1) {
          return { success: false, error: 'At least one owner is required.' };
        }
      }
      DB.update('USERS', existing.userId, {
        email: email,
        name: name,
        status: status,
        isOwner: isOwner ? 'YES' : 'NO',
        rolePreset: rolePreset,
        permissions: JSON.stringify(permissions),
        loginToken: String(existing.loginToken || '').trim() || newInviteToken_()
      });
      return { success: true, message: 'User updated.', data: { userId: existing.userId } };
    }

    if (findUserByEmail_(email)) {
      return { success: false, error: 'A user with this email already exists.' };
    }

    const record = {
      userId: nextUserId_(rows),
      email: email,
      name: name,
      status: status,
      isOwner: isOwner ? 'YES' : 'NO',
      rolePreset: rolePreset,
      permissions: JSON.stringify(permissions),
      invitedBy: gate.context.email,
      loginToken: newInviteToken_()
    };
    DB.create('USERS', record);
    return { success: true, message: 'User added.', data: { userId: record.userId } };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function api_deleteUser(userId) {
  try {
    const gate = requirePermission_('settings', 'edit');
    if (!gate.ok) return gate.response;
    if (!userId) return { success: false, error: 'User id is required.' };

    const rows = listUsersRecords_();
    const target = rows.find(function(r) { return String(r.userId) === String(userId); });
    if (!target) return { success: false, error: 'User not found.' };
    if (isYes_(target.isOwner)) {
      const owners = rows.filter(function(r) { return isYes_(r.isOwner); });
      if (owners.length <= 1) {
        return { success: false, error: 'Cannot remove the only owner.' };
      }
    }
    if (normalizeEmail_(target.email) === gate.context.email) {
      return { success: false, error: 'You cannot remove your own account.' };
    }

    DB.remove('USERS', userId);
    return { success: true, message: 'User removed.' };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function api_getPermissionPresets() {
  return {
    success: true,
    data: {
      Admin: clonePermissions_(FULL_PERMISSIONS_),
      Manager: clonePermissions_(MANAGER_PERMISSIONS_),
      Viewer: clonePermissions_(VIEWER_PERMISSIONS_)
    }
  };
}
