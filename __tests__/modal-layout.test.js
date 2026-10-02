const fs = require('fs');
const path = require('path');

describe('Centered modal layout', () => {
  const styles = fs.readFileSync(path.join(__dirname, '../src/Global_Styles.html'), 'utf8');

  function rule(selector) {
    const start = styles.indexOf(selector + ' {');
    expect(start).toBeGreaterThan(-1);
    return styles.slice(start, styles.indexOf('}', start));
  }

  test('shared modal overlay centers panels horizontally', () => {
    expect(rule('.lsc-modal-overlay')).toMatch(/justify-content:\s*center\s*!important/);
  });

  test('shared modal panel centers itself with auto margins on both axes', () => {
    expect(rule('.lsc-modal-panel')).toMatch(/margin:\s*auto/);
  });

  test('spinner/percent progress dialog is centered on the full screen', () => {
    const block = rule('#action-progress-overlay');
    expect(block).toMatch(/align-items:\s*center\s*!important/);
    expect(block).toMatch(/justify-content:\s*center\s*!important/);
  });
});
