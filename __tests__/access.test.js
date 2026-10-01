const fs = require('fs');
const path = require('path');

describe('Access control foundation', () => {
  const accessSrc = fs.readFileSync(path.join(__dirname, '../src/API_Access.js'), 'utf8');
  const appsScript = fs.readFileSync(path.join(__dirname, '../src/appsscript.json'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../src/Index.html'), 'utf8');
  const globalState = fs.readFileSync(path.join(__dirname, '../src/Global_State.html'), 'utf8');
  const viewSettings = fs.readFileSync(path.join(__dirname, '../src/View_Settings.html'), 'utf8');

  test('web app requires Google sign-in (ANYONE) while executing as deployer', () => {
    const config = JSON.parse(appsScript);
    expect(config.webapp.access).toBe('ANYONE');
    expect(config.webapp.executeAs).toBe('USER_DEPLOYING');
  });

  test('API_Access exposes session, authorize, and user management APIs', () => {
    expect(accessSrc).toContain('function api_getSession');
    expect(accessSrc).toContain('function api_authorizeServices');
    expect(accessSrc).toContain('function api_listUsers');
    expect(accessSrc).toContain('function api_saveUser');
    expect(accessSrc).toContain('function api_getWebAppShareInfo');
    expect(accessSrc).toContain('function api_requestLoginCode');
    expect(accessSrc).toContain('function api_verifyLoginCode');
    expect(accessSrc).toContain('function api_redeemInviteToken');
    expect(accessSrc).toContain('function api_invoke');
    expect(accessSrc).toContain('webAppUrl');
    expect(accessSrc).toContain('function requirePermission_');
    expect(accessSrc).toContain("insertSheet('USERS')");
  });

  test('Index exposes invitee login panel when Google email is unavailable', () => {
    expect(indexHtml).toContain('id="access-login-panel"');
    expect(indexHtml).toContain('id="btn-send-login-code"');
    expect(globalState).toContain('installAuthScriptRunBridge');
    expect(globalState).toContain('requestLoginCode');
  });

  test('permission presets include Admin Manager Viewer module CRUD', () => {
    expect(accessSrc).toContain('FULL_PERMISSIONS_');
    expect(accessSrc).toContain('MANAGER_PERMISSIONS_');
    expect(accessSrc).toContain('VIEWER_PERMISSIONS_');
    expect(accessSrc).toMatch(/dashboard[\s\S]*members[\s\S]*settings/);
  });

  test('Index and Global_State include access gate UI and AccessControl', () => {
    expect(indexHtml).toContain('id="app-access-denied"');
    expect(indexHtml).toContain('id="app-boot-overlay"');
    expect(indexHtml).toContain('id="app-setup-banner"');
    expect(globalState).toContain('const AccessControl');
    expect(globalState).toContain('api_getSession');
    expect(globalState).toContain('applyNavVisibility');
  });

  test('Settings includes Setup authorization and Users & Access UI', () => {
    expect(viewSettings).toContain('id="setup-section"');
    expect(viewSettings).toContain('id="btn-authorize-services"');
    expect(viewSettings).toContain('id="tab-btn-users"');
    expect(viewSettings).toContain('id="pane-users"');
    expect(viewSettings).toContain('id="user-perm-matrix"');
    expect(viewSettings).toContain('id="users-share-card"');
    expect(viewSettings).toContain('id="users-share-qr"');
  });
});
