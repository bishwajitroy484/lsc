/**
 * LSC Web App - Main Server Entry Point
 */

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
