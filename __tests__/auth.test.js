const fs = require('fs');
const path = require('path');

function loadAuthApi() {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Auth.js'), 'utf8');
  const settings = [
    { key: 'OWNER_EMAIL', value: 'owner@example.com', _rowNumber: 2 }
  ];
  const tokenClaims = {
    'owner-token': {
      email: 'owner@example.com',
      email_verified: true,
      aud: '123456-client.apps.googleusercontent.com',
      iss: 'https://accounts.google.com',
      exp: String(Math.floor(Date.now() / 1000) + 3600)
    },
    'user-token': {
      email: 'user@example.com',
      email_verified: true,
      aud: '123456-client.apps.googleusercontent.com',
      iss: 'https://accounts.google.com',
      exp: String(Math.floor(Date.now() / 1000) + 3600)
    },
    'stranger-token': {
      email: 'stranger@example.com',
      email_verified: true,
      aud: '123456-client.apps.googleusercontent.com',
      iss: 'https://accounts.google.com',
      exp: String(Math.floor(Date.now() / 1000) + 3600)
    },
    'other-client-token': {
      email: 'user@example.com',
      email_verified: true,
      aud: 'different-client.apps.googleusercontent.com',
      iss: 'https://accounts.google.com',
      exp: String(Math.floor(Date.now() / 1000) + 3600)
    }
  };
  const cache = new Map();
  const sheet = {
    getLastRow: jest.fn(() => settings.length + 1),
    getRange: jest.fn((row, column) => ({
      setValue: jest.fn(value => {
        if (column === 2 && settings[row - 2]) settings[row - 2].value = value;
      }),
      setValues: jest.fn(values => {
        settings.push({ key: values[0][0], value: values[0][1], _rowNumber: row });
      })
    }))
  };
  const db = { read: jest.fn(() => settings) };
  const cacheService = { getScriptCache: () => ({
    get: key => cache.get(key),
    put: (key, value) => cache.set(key, value)
  }) };
  const utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (algorithm, value) => Buffer.from(value),
    base64EncodeWebSafe: value => Buffer.from(value).toString('base64url')
  };
  const urlFetch = {
    fetch: jest.fn(url => {
      const token = new URL(url).searchParams.get('id_token');
      const claims = tokenClaims[token];
      return {
        getResponseCode: () => claims ? 200 : 401,
        getContentText: () => JSON.stringify(claims || {})
      };
    })
  };
  const ensureExitDateTrigger = jest.fn(() => ({ success: true }));

  const api = new Function(
    'DB',
    'SPREADSHEET_ID',
    'SpreadsheetApp',
    'CacheService',
    'Utilities',
    'UrlFetchApp',
    'ensureMemberExitDateTrigger_',
    `
      ${source};
      return {
        api_getAuthConfig,
        api_authenticate,
        api_getAccessControl,
        api_saveAccessControl,
        api_removeAccessControl,
        api_getAppBranding,
        requireApiAccess_
      };
    `
  )(
    db,
    'spreadsheet-id',
    { openById: () => ({ getSheetByName: () => sheet }) },
    cacheService,
    utilities,
    urlFetch,
    ensureExitDateTrigger
  );

  return { api, settings, urlFetch, ensureExitDateTrigger };
}

describe('Google sign-in and app access control', () => {
  test('only the configured admin can bootstrap OAuth sign-in and grant app access', () => {
    const { api, settings, ensureExitDateTrigger } = loadAuthApi();
    const clientId = '123456-client.apps.googleusercontent.com';

    const bootstrap = api.api_authenticate('owner-token', clientId);
    expect(bootstrap).toEqual({
      success: true,
      data: { email: 'owner@example.com', isAdmin: true }
    });
    expect(settings.find(row => row.key === 'AUTH_CLIENT_ID').value).toBe(clientId);
    expect(ensureExitDateTrigger).toHaveBeenCalledTimes(1);

    const grant = api.api_saveAccessControl('owner-token', 'User@Example.com');
    expect(grant.success).toBe(true);
    expect(grant.data).toEqual([
      expect.objectContaining({ email: 'user@example.com', enabled: true })
    ]);
    expect(api.api_authenticate('user-token').data).toEqual({
      email: 'user@example.com',
      isAdmin: false
    });
    expect(api.requireApiAccess_('user-token').email).toBe('user@example.com');
    expect(() => api.requireApiAccess_('user-token', true)).toThrow(
      'Only the app administrator can manage access.'
    );
    expect(() => api.requireApiAccess_('stranger-token')).toThrow(
      'This Google account has not been granted access.'
    );
    expect(api.api_getAccessControl('user-token').success).toBe(false);
    expect(api.api_getAccessControl('owner-token').data).toHaveLength(1);

    expect(api.api_authenticate('stranger-token').success).toBe(false);
    expect(api.api_authenticate('other-client-token').success).toBe(false);
  });

  test('removing an allowlisted email immediately denies sign-in', () => {
    const { api, settings } = loadAuthApi();
    const clientId = '123456-client.apps.googleusercontent.com';
    api.api_authenticate('owner-token', clientId);
    api.api_saveAccessControl('owner-token', 'user@example.com');

    expect(api.api_removeAccessControl('owner-token', 'USER@example.com').success).toBe(true);
    expect(JSON.parse(settings.find(row => row.key === 'ACCESS_USERS').value)).toHaveLength(0);
    expect(api.api_authenticate('user-token')).toEqual({
      success: false,
      error: 'This Google account has not been granted access.'
    });
  });

  test('a different Google account cannot initialize the OAuth client', () => {
    const { api, settings } = loadAuthApi();
    const response = api.api_authenticate(
      'user-token',
      '123456-client.apps.googleusercontent.com'
    );

    expect(response).toEqual({
      success: false,
      error: 'Only the configured administrator can set up sign-in.'
    });
    expect(settings.some(row => row.key === 'AUTH_CLIENT_ID')).toBe(false);
  });

  test('invalid ID tokens fail closed', () => {
    const { api } = loadAuthApi();
    const response = api.api_authenticate('invalid-token', '123456-client.apps.googleusercontent.com');
    expect(response.success).toBe(false);
    expect(response.error).toBe('Sign-in failed. Please sign in with Google again.');
  });
});
