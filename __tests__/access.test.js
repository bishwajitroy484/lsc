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
    expect(accessSrc).toContain('calendarOk');
    expect(accessSrc).toContain('deployApiOk');
    expect(accessSrc).toContain('probeCalendarAccess_');
    expect(accessSrc).toContain('getAuthorizationUrlIfNeeded_');
    expect(accessSrc).toContain('authorizationUrl');
    expect(accessSrc).toContain('function api_listUsers');
    expect(accessSrc).toContain('function api_saveUser');
    expect(accessSrc).toContain('function api_deleteUser');
    expect(accessSrc).toContain('function api_sendInvitation');
    expect(accessSrc).toContain('function api_redeemInviteToken');
    expect(accessSrc).toContain('function api_invoke');
    expect(accessSrc).toContain('bindIdentityToTemporaryKey_');
    expect(accessSrc).toContain('getTemporaryActiveUserKey');
    expect(accessSrc).toContain('webAppUrl');
    expect(accessSrc).toContain('function requirePermission_');
    expect(accessSrc).toContain("insertSheet('USERS')");
  });

  test('Index shows a simple access screen without a code login form', () => {
    expect(indexHtml).not.toContain('access-login-panel');
    expect(indexHtml).not.toContain('login-code');
    expect(indexHtml).toContain('id="access-denied-fix"');
    expect(indexHtml).toContain('id="action-progress-overlay"');
    expect(globalState).toContain('installAuthScriptRunBridge');
    expect(globalState).toContain('redeemInvite');
    expect(globalState).not.toContain('requestLoginCode');
    expect(globalState).toContain('ActionProgress');
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
    expect(viewSettings).toContain('id="deploy-section"');
    expect(viewSettings).toContain('id="btn-publish-webapp"');
    expect(viewSettings).toContain('id="publish-webapp-modal"');
    expect(viewSettings).toContain('grid-cols-3 gap-1.5 md:gap-2 text-[10px]');
    expect(viewSettings).toContain('id="tab-btn-users"');
    expect(viewSettings).toContain('id="pane-users"');
    expect(viewSettings).toContain('id="user-perm-matrix"');
    expect(viewSettings).toContain('id="user-invite-modal"');
    expect(viewSettings).toContain('id="user-edit-send"');
    expect(viewSettings).not.toMatch(/Spreadsheet, Drive folder, and Script/i);
  });

  test('inviting a user never shares the Sheet, Drive folder, or script', () => {
    expect(accessSrc).not.toMatch(/addEditor|addViewer|removeEditor|removeViewer/);
    expect(accessSrc).not.toContain('syncUserGoogleResources_');
    expect(accessSrc).not.toContain('putLoginOtp_');
    expect(accessSrc).not.toContain('api_requestLoginCode');
    expect(accessSrc).not.toContain('api_verifyLoginCode');
  });

  describe('invitation email', () => {
    const vm = require('vm');
    let ctx;
    beforeAll(() => {
      ctx = vm.createContext({ console });
      vm.runInContext(accessSrc, ctx);
    });

    test('lists only viewable pages with their level', () => {
      const rows = ctx.describeAccess_(ctx.getPresetPermissions_('manager'));
      const byPage = Object.fromEntries(rows.map(r => [r.page, r.level]));
      expect(byPage.Members).toBe('View, add, edit');
      expect(byPage.Calendar).toBe('View only');
      expect(byPage.Settings).toBeUndefined();
    });

    test('email greets the user, links to the app, and never mentions Sheet/Drive/Script', () => {
      const mail = ctx.buildInvitationEmail_({
        appName: 'Acme Gym',
        name: 'Riya <b>',
        invitedBy: 'Sam',
        url: 'https://script.google.com/macros/s/ID/exec?t=inv_abc',
        access: ctx.describeAccess_(ctx.getPresetPermissions_('viewer'))
      });
      expect(mail.subject).toBe('You now have access to Acme Gym');
      expect(mail.html).toContain('href="https://script.google.com/macros/s/ID/exec?t=inv_abc"');
      expect(mail.html).toContain('Riya &lt;b&gt;');
      expect(mail.html).toContain('Sam has granted you access to the <strong>Acme Gym</strong> application');
      expect(mail.html).toContain('View only');
      expect(mail.text).toContain('Dashboard: View only');
      expect(mail.html + mail.text).not.toMatch(/spreadsheet|google sheet|drive|script editor|code/i);
    });
  });
});
