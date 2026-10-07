const fs = require('fs');
const path = require('path');

function loadDeployApi(overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/API_Deploy.js'), 'utf8');
  const settingsMap = overrides.settingsMap || {
    WEBAPP_DEPLOYMENT_ID: 'AKfycbTESTDEPLOYMENTID1234567890',
    WEBAPP_LAST_VERSION: '3',
    WEBAPP_LAST_PUBLISHED_AT: '2026-04-01T10:00:00.000Z',
    WEBAPP_LAST_PUBLISHED_BY: 'owner@gym.com'
  };

  const calls = [];
  const UrlFetchApp = {
    fetch: jest.fn((url, options) => {
      calls.push({ url, options });
      const handler = overrides.fetchHandler || (() => ({
        code: 200,
        body: {
          deploymentConfig: {
            scriptId: 'SCRIPT123',
            versionNumber: 3,
            manifestFileName: 'appsscript',
            description: 'prev'
          }
        }
      }));
      const res = handler(url, options) || { code: 200, body: {} };
      return {
        getResponseCode: () => res.code,
        getContentText: () => JSON.stringify(res.body || {})
      };
    })
  };

  const ScriptApp = {
    getOAuthToken: jest.fn(() => 'token-abc'),
    getScriptId: jest.fn(() => 'SCRIPT123')
  };

  const upserts = [];
  const api = new Function(
    'UrlFetchApp',
    'ScriptApp',
    'LSC_ENV',
    'LSC_SCRIPT_ID',
    'LSC_DEPLOYMENT_ID',
    'readSettingsMapForAccess_',
    'getCurrentUserContext_',
    'requirePermission_',
    'getAuthorizationUrlIfNeeded_',
    'upsertSettingKey_',
    'getWebAppUrl_',
    source + '\n; return {' +
      'api_getWebAppDeployStatus, api_saveWebAppDeploymentId, api_publishWebAppVersion,' +
      'getConfiguredDeploymentId_, getDeployScriptId_, formatAppsScriptApiError_' +
    '};'
  )(
    UrlFetchApp,
    ScriptApp,
    overrides.env || 'dev',
    overrides.scriptId || 'SCRIPT123',
    overrides.configDeploymentId || '',
    () => settingsMap,
    () => overrides.context || { email: 'owner@gym.com', isOwner: true, allowed: true },
    () => overrides.permGate || { ok: true, context: { email: 'owner@gym.com', isOwner: true, allowed: true } },
    () => overrides.authUrl || '',
    (key, value) => { upserts.push({ key, value }); },
    () => 'https://script.google.com/macros/s/AKfycbTEST/exec'
  );

  return { api, UrlFetchApp, ScriptApp, calls, upserts, settingsMap };
}

describe('Web app version publish', () => {
  const deploySrc = fs.readFileSync(path.join(__dirname, '../src/API_Deploy.js'), 'utf8');
  const appsScript = fs.readFileSync(path.join(__dirname, '../src/appsscript.json'), 'utf8');
  const viewSettings = fs.readFileSync(path.join(__dirname, '../src/View_Settings.html'), 'utf8');
  const scriptSettings = fs.readFileSync(path.join(__dirname, '../src/Script_Settings.html'), 'utf8');
  const prepareEnv = fs.readFileSync(path.join(__dirname, '../scripts/prepare-env.js'), 'utf8');
  const features = fs.readFileSync(path.join(__dirname, '../docs/features.md'), 'utf8');

  test('manifest includes Apps Script API scopes for publish', () => {
    const config = JSON.parse(appsScript);
    expect(config.oauthScopes).toContain('https://www.googleapis.com/auth/script.external_request');
    expect(config.oauthScopes).toContain('https://www.googleapis.com/auth/script.projects');
    expect(config.oauthScopes).toContain('https://www.googleapis.com/auth/script.deployments');
  });

  test('Settings UI exposes Web app version publish controls', () => {
    expect(viewSettings).toContain('id="deploy-section"');
    expect(viewSettings).toContain('id="btn-publish-webapp"');
    expect(viewSettings).toContain('id="deploy-deployment-id"');
    expect(scriptSettings).toContain('refreshDeployStatus');
    expect(scriptSettings).toContain('api_publishWebAppVersion');
    expect(scriptSettings).toContain('api_getWebAppDeployStatus');
  });

  test('prepare-env writes LSC_DEPLOYMENT_ID into Config_Env', () => {
    expect(prepareEnv).toContain('LSC_DEPLOYMENT_ID');
    expect(prepareEnv).toContain('deploymentId');
  });

  test('features docs describe in-app publish for Dev and Prod', () => {
    expect(features).toMatch(/Publish latest code from Settings/i);
    expect(features).toContain('Web app version');
  });

  test('API module exposes status, save id, and publish helpers', () => {
    expect(deploySrc).toContain('function api_getWebAppDeployStatus');
    expect(deploySrc).toContain('function api_saveWebAppDeploymentId');
    expect(deploySrc).toContain('function api_publishWebAppVersion');
    expect(deploySrc).toContain('function probeDeployApiAccess_');
  });

  test('Settings UI uses a publish confirmation modal instead of window.confirm', () => {
    expect(viewSettings).toContain('id="publish-webapp-modal"');
    expect(viewSettings).toContain('id="btn-publish-modal-confirm"');
    expect(scriptSettings).toContain('openPublishModal');
    expect(scriptSettings).toContain('confirmPublishWebAppVersion');
    expect(scriptSettings).toContain('Publish API');
    const publishFn = scriptSettings.slice(
      scriptSettings.indexOf('publishWebAppVersion: function'),
      scriptSettings.indexOf('openPublishModal: function')
    );
    expect(publishFn).not.toMatch(/confirm\(/);
  });

  test('owner can read deploy status from settings deployment id', () => {
    const { api } = loadDeployApi();
    const res = api.api_getWebAppDeployStatus();
    expect(res.success).toBe(true);
    expect(res.data.deploymentId).toContain('AKfycb');
    expect(res.data.env).toBe('Dev');
    expect(res.data.currentVersion).toBe(3);
    expect(res.data.apiReady).toBe(true);
  });

  test('non-owner cannot publish', () => {
    const { api } = loadDeployApi({
      context: { email: 'staff@gym.com', isOwner: false, allowed: true }
    });
    const res = api.api_publishWebAppVersion('test');
    expect(res.success).toBe(false);
    expect(res.code).toBe('FORBIDDEN');
  });

  test('publish creates version then updates deployment', () => {
    let step = 0;
    const { api, upserts } = loadDeployApi({
      fetchHandler: (url, options) => {
        step += 1;
        const method = String(options.method || 'get').toLowerCase();
        if (method === 'post' && /\/versions$/.test(url)) {
          return { code: 200, body: { versionNumber: 4, description: 'new' } };
        }
        if (method === 'get' && /\/deployments\//.test(url)) {
          return {
            code: 200,
            body: {
              deploymentConfig: {
                scriptId: 'SCRIPT123',
                versionNumber: step === 1 ? 3 : 4,
                manifestFileName: 'appsscript',
                description: 'prev'
              }
            }
          };
        }
        if (method === 'put' && /\/deployments\//.test(url)) {
          const payload = JSON.parse(options.payload);
          expect(payload.deploymentConfig.versionNumber).toBe(4);
          return { code: 200, body: { deploymentId: 'AKfycbTESTDEPLOYMENTID1234567890' } };
        }
        return { code: 200, body: {} };
      }
    });

    const res = api.api_publishWebAppVersion('release notes');
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/version 4/i);
    expect(upserts.some(u => u.key === 'WEBAPP_LAST_VERSION' && u.value === '4')).toBe(true);
    expect(upserts.some(u => u.key === 'WEBAPP_DEPLOYMENT_ID')).toBe(true);
  });

  test('save deployment id validates AKfycb prefix', () => {
    const { api } = loadDeployApi();
    const bad = api.api_saveWebAppDeploymentId('not-valid');
    expect(bad.success).toBe(false);
    const good = api.api_saveWebAppDeploymentId('AKfycbVALIDDEPLOYMENTIDVALUE0001');
    expect(good.success).toBe(true);
  });

  test('API disabled error is explained clearly', () => {
    const { api } = loadDeployApi();
    const message = api.formatAppsScriptApiError_({
      code: 403,
      json: { error: { message: 'Apps Script API has not been used in project', status: 'PERMISSION_DENIED' } }
    }, 'fallback');
    expect(message).toMatch(/Apps Script API is not enabled/i);
  });
});
