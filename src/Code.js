/**
 * LSC Web App - Main Server Entry Point
 */

/**
 * Legacy editor helper — prefer api_authorizeServices from the web app UI.
 */
function authorizeLscScriptPermissions() {
  if (typeof api_authorizeServices === 'function') {
    const result = api_authorizeServices();
    if (result && result.success) {
      return result.message || 'LSC permissions authorized.';
    }
  }
  ScriptApp.getProjectTriggers();
  MailApp.getRemainingDailyQuota();
  return 'LSC permissions authorized. Save Settings again to create the weekly report trigger.';
}

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  
  // Pass query params or initial flags if needed
  template.pageParams = e.parameter || {};
  
  return template.evaluate()
    .setTitle('LSC - Gym Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Universal HTML include helper for modular components.
 * Evaluates the file as a template so nested includes work, e.g.
 * View_Settings → <?!= include('View_Guide'); ?>
 */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
