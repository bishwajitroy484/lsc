const { colToLetter, _colToLetter, parseSafeDate, distributeDailyProration } = require('../src/Utils_DB');

describe('Universal Column Converter (colToLetter)', () => {
  test('correctly converts 1-based indices to column letters', () => {
    expect(colToLetter(1)).toBe('A');
    expect(colToLetter(26)).toBe('Z');
    expect(colToLetter(27)).toBe('AA');
    expect(colToLetter(52)).toBe('AZ');
    expect(colToLetter(53)).toBe('BA');
    expect(colToLetter(702)).toBe('ZZ');
    expect(colToLetter(703)).toBe('AAA');
    expect(_colToLetter(1)).toBe('A');
  });
});

describe('Date Parser (parseSafeDate)', () => {
  test('parses ISO format correctly', () => {
    const d = parseSafeDate('2024-06-15');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  test('parses DD-MMM-YYYY format with diverse casing', () => {
    const d1 = parseSafeDate('15-Jan-2024');
    expect(d1.getFullYear()).toBe(2024);
    expect(d1.getMonth()).toBe(0);
    expect(d1.getDate()).toBe(15);

    const d2 = parseSafeDate('28-FEB-2024');
    expect(d2.getFullYear()).toBe(2024);
    expect(d2.getMonth()).toBe(1);
    expect(d2.getDate()).toBe(28);
  });

  test('parses 2-digit year DD-MMM-YY correctly (safe 2000s conversion)', () => {
    const d = parseSafeDate('01-MAR-24');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(1);
  });

  test('returns invalid date for empty, null, or N/A inputs', () => {
    expect(isNaN(parseSafeDate(''))).toBe(true);
    expect(isNaN(parseSafeDate(null))).toBe(true);
    expect(isNaN(parseSafeDate('N/A'))).toBe(true);
    expect(isNaN(parseSafeDate('invalid-date'))).toBe(true);
  });
});

describe('GAAP-Compliant Daily Proration (distributeDailyProration)', () => {
  test('anchor mode (cash basis) assigns full amount to start month', () => {
    const intervals = [];
    distributeDailyProration('2024-03-10', '2024-06-10', null, 3000, 'anchor', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({ year: 2024, month: 2, amt: 3000 });
  });

  test('split mode within a single month attributes 100% to that month', () => {
    const intervals = [];
    distributeDailyProration('2024-01-05', '2024-01-25', null, 2100, 'split', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(1);
    expect(intervals[0].year).toBe(2024);
    expect(intervals[0].month).toBe(0);
    expect(intervals[0].amt).toBeCloseTo(2100, 2);
  });

  test('split mode prorates daily amounts across month boundaries', () => {
    const intervals = [];
    // 2024 is leap year: Jan 16 to Jan 31 is 16 days; Feb 1 to Feb 15 is 15 days; Total = 31 days.
    const totalAmt = 3100;
    distributeDailyProration('2024-01-16', '2024-02-15', null, totalAmt, 'split', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(2);
    // Jan (16 days @ 100/day) = 1600
    expect(intervals[0].year).toBe(2024);
    expect(intervals[0].month).toBe(0);
    expect(intervals[0].amt).toBeCloseTo(1600, 2);

    // Feb (15 days @ 100/day) = 1500
    expect(intervals[1].year).toBe(2024);
    expect(intervals[1].month).toBe(1);
    expect(intervals[1].amt).toBeCloseTo(1500, 2);

    // Total distributed matches totalAmt
    const sum = intervals.reduce((acc, cur) => acc + cur.amt, 0);
    expect(sum).toBeCloseTo(totalAmt, 2);
  });

  test('split mode prorates across year boundaries (e.g. Dec to Jan)', () => {
    const intervals = [];
    // Dec 16 to Jan 15: Dec 16-31 is 16 days; Jan 1-15 is 15 days; Total = 31 days.
    const totalAmt = 6200;
    distributeDailyProration('2023-12-16', '2024-01-15', null, totalAmt, 'split', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(2);
    expect(intervals[0].year).toBe(2023);
    expect(intervals[0].month).toBe(11); // December
    expect(intervals[0].amt).toBeCloseTo(3200, 2); // 16 * 200

    expect(intervals[1].year).toBe(2024);
    expect(intervals[1].month).toBe(0); // January
    expect(intervals[1].amt).toBeCloseTo(3000, 2); // 15 * 200
  });

  test('fallback date is used when start date is missing or invalid', () => {
    const intervals = [];
    distributeDailyProration(null, null, '2024-07-20', 1500, 'anchor', (year, month, amt) => {
      intervals.push({ year, month, amt });
    });

    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({ year: 2024, month: 6, amt: 1500 });
  });
});

const fs = require('fs');
const path = require('path');

describe('Client Shared Utilities (AppUtils in Global_State.html)', () => {
  let AppUtils;

  beforeAll(() => {
    const htmlContent = fs.readFileSync(path.join(__dirname, '../src/Global_State.html'), 'utf8');
    const match = htmlContent.match(/const AppUtils = ({[\s\S]*?\n  };)/);
    if (match) {
      const fn = new Function(`return ${match[1]};`);
      AppUtils = fn();
    }
  });

  test('formatCurrency correctly formats values in Indian number system by default', () => {
    AppUtils.currencyFormat = 'Indian';
    expect(AppUtils.formatCurrency(0)).toBe('₹0');
    expect(AppUtils.formatCurrency(1)).toBe('₹1');
    expect(AppUtils.formatCurrency(10)).toBe('₹10');
    expect(AppUtils.formatCurrency(100)).toBe('₹100');
    expect(AppUtils.formatCurrency(1000)).toBe('₹1,000');
    expect(AppUtils.formatCurrency(10000)).toBe('₹10,000');
    expect(AppUtils.formatCurrency(25000)).toBe('₹25,000');
    expect(AppUtils.formatCurrency(80500)).toBe('₹80,500');
    expect(AppUtils.formatCurrency(100000)).toBe('₹1Lakhs');
    expect(AppUtils.formatCurrency(130000)).toBe('₹1.3Lakhs');
    expect(AppUtils.formatCurrency(135000)).toBe('₹1.35Lakhs');
    expect(AppUtils.formatCurrency(10000000)).toBe('₹1Crore');
    expect(AppUtils.formatCurrency(12000000)).toBe('₹1.2Crore');
    expect(AppUtils.formatCurrency(-11500)).toBe('-₹11,500');
    expect(AppUtils.formatCurrency(-130000)).toBe('-₹1.3Lakhs');
    expect(AppUtils.formatCurrency(null)).toBe('₹0');
  });

  test('formatCurrency correctly formats values as standard compact metric when configured', () => {
    AppUtils.currencyFormat = 'Standard';
    expect(AppUtils.formatCurrency(0)).toBe('₹0');
    expect(AppUtils.formatCurrency(1)).toBe('₹1');
    expect(AppUtils.formatCurrency(500)).toBe('₹500');
    expect(AppUtils.formatCurrency(1000)).toBe('₹1k');
    expect(AppUtils.formatCurrency(1500)).toBe('₹1.5k');
    expect(AppUtils.formatCurrency(1540)).toBe('₹1.5k');
    expect(AppUtils.formatCurrency(1560)).toBe('₹1.6k');
    expect(AppUtils.formatCurrency(25000)).toBe('₹25k');
    expect(AppUtils.formatCurrency('₹25,400')).toBe('₹25.4k');
    expect(AppUtils.formatCurrency(1000000)).toBe('₹1M');
    expect(AppUtils.formatCurrency(1200000)).toBe('₹1.2M');
    expect(AppUtils.formatCurrency(-5000)).toBe('-₹5k');
    expect(AppUtils.formatCurrency(null)).toBe('₹0');
    // Reset back to Indian
    AppUtils.currencyFormat = 'Indian';
  });

  test('parseAmount safely cleans formatted amount strings', () => {
    expect(AppUtils.parseAmount('₹1,500')).toBe(1500);
    expect(AppUtils.parseAmount('12,345.50')).toBe(12345.5);
    expect(AppUtils.parseAmount('')).toBe(0);
    expect(AppUtils.parseAmount(null)).toBe(0);
  });

  test('formatDateDDMMMYYYY formats standard, uppercase, and short year', () => {
    expect(AppUtils.formatDateDDMMMYYYY('2024-03-05')).toBe('05-Mar-2024');
    expect(AppUtils.formatDateDDMMMYYYY('2024-03-05', true, true)).toBe('05-MAR-24');
    expect(AppUtils.formatDateDDMMMYYYY('')).toBe('');
  });

  test('parseToISODate parses diverse date string formats to YYYY-MM-DD', () => {
    expect(AppUtils.parseToISODate('05-Mar-2024')).toBe('2024-03-05');
    expect(AppUtils.parseToISODate('05-MAR-24')).toBe('2024-03-05');
    expect(AppUtils.parseToISODate('2024-03-05')).toBe('2024-03-05');
    expect(AppUtils.parseToISODate('')).toBe('');
  });

  test('debounce delays execution and only fires once after wait period', (done) => {
    let callCount = 0;
    const fn = AppUtils.debounce(() => {
      callCount++;
    }, 50);

    fn();
    fn();
    fn();
    expect(callCount).toBe(0);

    setTimeout(() => {
      expect(callCount).toBe(1);
      done();
    }, 100);
  });

  describe('required-field validation', () => {
    const originalDocument = global.document;
    const originalToast = global.Toast;

    afterEach(() => {
      if (originalDocument === undefined) delete global.document;
      else global.document = originalDocument;
      if (originalToast === undefined) delete global.Toast;
      else global.Toast = originalToast;
    });

    function createField({ id, value = '', required = true, valid, tagName = 'INPUT', hidden = false, disabled = false, relative = true, nextSibling = null }) {
      const classes = new Set();
      const listeners = {};
      const container = {
        nextElementSibling: nextSibling,
        insertAdjacentElement(position, message) {
          if (position !== 'afterend') throw new Error(`Unexpected insertion position: ${position}`);
          message.container = this;
          message.nextElementSibling = this.nextElementSibling;
          this.nextElementSibling = message;
        }
      };
      const field = {
        id,
        value,
        required,
        disabled,
        tagName,
        validity: { valid: valid === undefined ? Boolean(value) : valid },
        dataset: {},
        nextElementSibling: nextSibling,
        classList: {
          add: name => classes.add(name),
          remove: name => classes.delete(name),
          contains: name => classes.has(name)
        },
        closest(selector) {
          if (selector === '.hidden') return hidden ? {} : null;
          if (selector === '.relative') return relative ? container : null;
          return null;
        },
        setAttribute: jest.fn(),
        removeAttribute: jest.fn(),
        checkValidity: () => field.validity.valid,
        addEventListener(event, listener) {
          listeners[event] = listener;
        },
        insertAdjacentElement(position, message) {
          if (position !== 'afterend') throw new Error(`Unexpected insertion position: ${position}`);
          message.container = this;
          message.nextElementSibling = this.nextElementSibling;
          this.nextElementSibling = message;
        },
        scrollIntoView: jest.fn(),
        dispatch(event) {
          listeners[event]();
        },
        container
      };
      return field;
    }

    function createForm(fields) {
      const errors = [];
      const form = {
        querySelectorAll(selector) {
          if (selector === '[required]') return fields.filter(field => field.required);
          if (selector === '.field-validation-invalid') return fields.filter(field => field.classList.contains('field-validation-invalid'));
          if (selector === '[data-validation-error]') return errors.filter(error => error.hasAttribute('data-validation-error'));
          throw new Error(`Unexpected selector: ${selector}`);
        }
      };
      global.document = {
        createElement: jest.fn(() => {
          const attributes = new Set();
          const message = {
            dataset: {},
            setAttribute: (name) => attributes.add(name),
            hasAttribute: name => attributes.has(name) || (name === 'data-validation-error' && message.dataset.validationError === 'true'),
            removeAttribute: name => {
              attributes.delete(name);
              if (name === 'data-validation-error') delete message.dataset.validationError;
            },
            remove() {
              if (this.container.nextElementSibling === this) {
                this.container.nextElementSibling = this.nextElementSibling;
              }
              const errorIndex = errors.indexOf(this);
              if (errorIndex !== -1) errors.splice(errorIndex, 1);
            }
          };
          errors.push(message);
          return message;
        })
      };
      return form;
    }

    beforeEach(() => {
      global.Toast = { error: jest.fn() };
    });

    test('highlights every missing or invalid required field and skips hidden fields', () => {
      const missingText = createField({ id: 'name', value: '' });
      const invalidSelect = createField({ id: 'category', value: 'All', tagName: 'SELECT' });
      const hiddenField = createField({ id: 'conditional', value: '', hidden: true });
      const form = createForm([missingText, invalidSelect, hiddenField]);

      expect(AppUtils.validateRequiredFields(form)).toBe(false);
      expect(missingText.classList.contains('field-validation-invalid')).toBe(true);
      expect(invalidSelect.classList.contains('field-validation-invalid')).toBe(true);
      expect(hiddenField.classList.contains('field-validation-invalid')).toBe(false);
      expect(form.querySelectorAll('[data-validation-error]')).toHaveLength(2);
      expect(form.querySelectorAll('[data-validation-error]').map(error => error.textContent)).toEqual([
        'This field is required.',
        'This field is required.'
      ]);
      expect(missingText.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
      expect(global.Toast.error).toHaveBeenCalledWith('Please complete the highlighted fields.');
    });

    test('clears only the corrected field error without removing its neighboring element', () => {
      const neighbor = { id: 'following-element' };
      const field = createField({ id: 'name', value: '', valid: false, relative: false, nextSibling: neighbor });
      const form = createForm([field]);

      expect(AppUtils.validateRequiredFields(form)).toBe(false);
      expect(field.nextElementSibling.hasAttribute('data-validation-error')).toBe(true);
      field.value = 'Completed';
      field.validity.valid = true;
      field.dispatch('input');

      expect(field.classList.contains('field-validation-invalid')).toBe(false);
      expect(field.nextElementSibling).toBe(neighbor);
      expect(form.querySelectorAll('[data-validation-error]')).toHaveLength(0);
    });

    test('all add/edit modal forms route Save through the shared validator', () => {
      const forms = [
        ['src/Script_Members.html', 'member-form'],
        ['src/Script_Members.html', 'payment-form'],
        ['src/Script_Staff.html', 'staff-form'],
        ['src/Script_Staff.html', 'txn-form'],
        ['src/Script_Expenses.html', 'expense-form'],
        ['src/Script_Settings.html', 'schema-form'],
        ['src/Script_Settings.html', 'option-form']
      ];

      forms.forEach(([file, formId]) => {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        expect(source).toContain(`AppUtils.validateRequiredFields('${formId}')`);
      });
    });
  });
});
