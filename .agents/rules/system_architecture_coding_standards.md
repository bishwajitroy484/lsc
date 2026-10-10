# System Architecture and Coding Standards

These standards describe the current Project LSC implementation. Preserve established patterns unless a migration is explicitly part of the task.

## Technology and dependencies

- **Backend:** Google Apps Script (GAS) and its native services, such as `SpreadsheetApp` and `DriveApp`.
- **Frontend:** HTML5, CSS, and vanilla JavaScript. External frontend libraries may be loaded from approved CDN URLs.
- **Dependencies:** Do not add runtime NPM dependencies. Development and test dependencies are allowed when needed; the project currently uses Jest for tests.

## Files and frontend organization

- Clasp is configured to accept backend `.js` and `.gs` files. Existing backend files use `.js`; retain that convention unless an approved migration requires otherwise.
- Frontend files use `.html`, including files containing only scripts or styles.
- Use the established role-prefix and feature-name convention for new files: `API_<Feature>.js`, `View_<Feature>.html`, and `Script_<Feature>.html`. Use `Comp_<Name>.html` for reusable UI components and `Global_<Name>.html` for shared frontend state or styles. Keep `Code.js` as the web-app entry point and use `Utils_<Domain>.js` for backend utilities.
- Shared singleton files may retain a concise established role name (for example, `Index.html` or `Toast.html`); use `Config_<Domain>.html` for new shared frontend configuration. Do not create a new generic file if its responsibilities belong in an existing module.
- Use clear, descriptive names without spaces, duplicate suffixes such as `(1)`, or unexplained abbreviations. Do not rename existing files solely to make their casing uniform; update references and Clasp behavior safely if a file rename is part of a task.
- Keep responsibilities clear:
  - `View_*.html` contains feature markup.
  - `Script_*.html` contains client-side feature logic.
  - `Comp_*.html` contains reusable UI components.
  - `Global_*.html` contains shared state or styles.
  - `Index.html` is the application entry template.

## Naming conventions

- **Backend API functions:** Use a named global function with the `api_` prefix, followed by a `lowerCamelCase` action-and-entity name, such as `api_getMembers`, `api_saveStaff`, or `api_deleteExpense`. Use an action that clearly describes the operation.
- **Helper functions:** Use `lowerCamelCase` and a name that describes the result or action. Keep helpers local to a module unless they are genuinely shared.
- **Variables and object properties:** Use `lowerCamelCase` with meaningful nouns; use plural names for collections. Avoid single-letter names outside short, obvious callbacks.
- **Constants:** Use `UPPER_SNAKE_CASE` for module-wide values that are true constants. Use `const` by default, and use `let` only when reassignment is required.
- **Frontend module objects:** Use `PascalCase` for module-level app/controller objects, matching the existing pattern (for example, `MembersApp`).
- **HTML IDs and CSS classes:** Use lowercase `kebab-case`; prefix new feature-specific selectors with the feature name to reduce collisions.
- **Tests:** Use descriptive lowercase `<feature>.test.js` filenames and test names that state the behavior being checked.
- **Spreadsheet sheet names, headers, API payload fields, and persisted IDs** are integration contracts. Preserve their exact existing spelling and casing unless the data migration and all affected consumers are intentionally updated together.

## Coding quality and modularity

- Prefer small, cohesive functions with one clear responsibility. Extract a helper when it removes meaningful duplication or clarifies complex logic; avoid abstractions used only once that obscure the flow.
- Keep UI rendering, event handling, API calls, persistence, and business calculations separated according to the existing module structure.
- Reuse existing utilities and established API response patterns rather than duplicating logic or inventing a parallel convention.
- Make state changes and side effects explicit. Avoid hidden global state, unnecessary mutation of caller-owned data, and order-dependent behavior.
- Validate untrusted input at API boundaries. Check required fields, types, ranges, dates, and allowed values before performing writes or calculations.
- Handle errors explicitly and consistently. Do not swallow exceptions, return success-shaped fallback values, or expose sensitive data in logs or user-facing errors.
- Treat all browser input and client-side checks as untrusted. Enforce authorization and business rules in server-side API functions for every operation that reads or changes protected data; hiding a button or view is not authorization.
- Protect member, staff, payment, and other sensitive data. Do not commit credentials, tokens, or private personal data; do not log secrets or return internal exception details to the browser.
- Render untrusted text as text (for example, with `textContent`) rather than inserting it as HTML. If HTML insertion is necessary, use a reviewed sanitization approach and keep the allowed markup narrow.
- Handle both success and failure callbacks for asynchronous `google.script.run` calls. Present actionable, non-sensitive errors and restore UI state after failure; prevent accidental duplicate submissions while a write is in progress.
- Optimize measured or evident bottlenecks, especially repeated Spreadsheet service calls; batch reads and writes where appropriate. Do not trade correctness or clarity for speculative micro-optimizations.
- Keep code compatible with the Google Apps Script runtime and the project's supported browser environment. Do not introduce runtime NPM dependencies.

## Do

- Read the relevant module, callers, utilities, and tests before changing behavior.
- Follow existing naming, formatting, data contracts, and UI/API patterns; make new code consistent with the conventions above.
- Add or update focused tests for changed behavior, including validation and important boundary cases.
- Verify all callers before changing or removing a `google.script.run` endpoint, HTML include, sheet field, or shared helper.
- Keep changes focused and update the relevant documentation for behavior or architecture changes.

## Do not

- Do not create oversized files or functions that combine unrelated responsibilities.
- Do not duplicate business rules, hard-code environment-specific values, or add dependencies without a justified and approved need.
- Do not silently ignore invalid data, errors, failed API responses, or failing tests.
- Do not trust frontend-provided role, identity, price, amount, or authorization decisions when enforcing server-side access or business rules.
- Do not interpolate untrusted values into HTML, script, CSS, or URLs without context-appropriate validation and encoding.
- Do not remove code or change persisted/API naming contracts based only on a local search if dynamic references or external spreadsheet data may depend on them.
- Do not perform unrelated cleanup, broad formatting churn, or speculative refactoring as part of a focused change.
- Do not claim a test, deployment, or verification succeeded unless it was actually performed and passed.

## Backend APIs and maintenance

- Declare functions exposed to `google.script.run` using named function declarations, such as `function api_getMembers() {}`. Avoid arrow functions for exposed global entry points; arrows remain suitable for local callbacks and helpers.
- Search HTML callers, including `google.script.run`, and check dynamic references before removing or renaming a backend function.
- Remove confirmed dead code and temporary debugging logs when in scope; avoid unrelated cleanup.
- Handle and report errors using the existing API response and UI conventions.

## Financial calculations

- For accrual and revenue-recognition reports, use the established daily-proration logic rather than dividing annual amounts into equal monthly amounts.
- Use UTC-based calendar-day arithmetic. Treat start and end dates as inclusive, and test month boundaries, year boundaries, leap days, and single-day periods when changing proration behavior.
- Follow the configured accrual mode and existing calculation helpers. Do not make a broad claim of GAAP compliance unless the accounting treatment has been verified for the specific report.
- Dashboard actual net-in-hand uses recognized collections less recognized operating expenses. Its forecast is computed from the same batched member, payment, expense, salary, and settings data: expected dues follow active members' next due dates and plan frequency, while expected expenses use trailing-12-month expense and paid-salary averages. Apply the configured recognition mode to both actuals and forecast collections.
- Member payments store `cashAmount` and `upiAmount`; `amount` is their sum and must be a non-negative number. `expectedAmount` and `pendingAmount` record a partial cycle. A payment covers the cycle when it is Paid or Completed, or when money was received and a pending balance remains. Dashboard collected KPIs still use Paid/Completed only. Member insights include the cash and UPI actually received, including partial receipts, and exclude overdue rows. Receipt images are Drive file IDs stored in `receiptUrl`. Do not read or write a `notes` column.
- If the correct accounting treatment or date interpretation is unclear, ask for clarification rather than inventing a policy.
