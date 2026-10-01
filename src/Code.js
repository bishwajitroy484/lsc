/**
 * LSC Web App - Main Server Entry Point
 */

/**
 * Run once from the Apps Script editor (as the deployer), then click Allow.
 * Grants ScriptApp trigger + MailApp permissions used by notifications.
 */
function authorizeLscScriptPermissions() {
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
 * Universal HTML include helper for modular components
 * Supports nesting: <?!= include('View_Dashboard'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
