# Project LSC Features

This guide documents user-visible behavior. Keep it focused on what users can do and what to expect; use `.agents/rules/project_runbook_workflow.md` for engineering and release procedures.

Update the relevant section whenever a feature is added or its user-visible behavior changes. Include the user goal, key workflows, important validation or limitations, and related modules where useful.

## Local environment IDs (dev / prod)

Developers keep spreadsheet, Drive folder, Apps Script, and **stable web-app deployment** IDs in a local file that is **not** committed:

1. Copy `config/env.example.json` → `config/env.json`
2. Fill `dev` and `prod` blocks (`scriptId`, `spreadsheetId`, `driveId`, `deploymentId`)
3. Run `npm run use:dev` or `npm run use:prod` before push/deploy

Those commands write `.clasp.json` (script target) and `src/Config_Env.js` (runtime `SPREADSHEET_ID` / drive defaults). Then `npm run push:dev` / `push:prod` use the selected environment’s IDs.

**Stable web app URL:** `npm run deploy:dev` / `deploy:prod` updates the existing `deploymentId` so the `/exec` link does **not** change. Share that URL once. If `deploymentId` is empty, the first deploy creates one and saves it into `config/env.json` automatically.

## Feature areas

The current application includes these feature modules:

- Calendar
- Dashboard
- Expenses
- Members
- Settings
- Staff

Add or update a section for a feature when documenting a behavior change; do not infer unverified product behavior from a module name alone.

## Calendar year selection

The Calendar year selector is a dropdown populated from years found in member, payment, expense, staff, and salary records. The current year is included even when no records exist for it. Dashboard, Members, Staff, and Expenses use the same available-year list, so their year selectors stay consistent.

## Payment insights and dashboard collections

Member Payment Insights, Dashboard collected-revenue KPIs, and collection charts count only payments with a Paid or Completed status. Overdue, unpaid, pending, and failed payments remain visible in payment history where applicable, but are not counted as collected revenue or member earnings. The same status handling applies whether a payment status is stored as its display label or as a dropdown ID.

## Modal form validation

Member, staff, expense, payment, staff salary, and Settings add/edit forms validate every visible required field when Save is clicked. Missing or invalid fields are highlighted and show an inline message; the form is not submitted until those fields are corrected. Conditional fields, such as expense misc details, exit dates, salary coverage dates, and optional initial-payment details, are validated when their corresponding form state makes them visible and required. Expense amount edits use the same validation as the expense form.

## Mobile modal clearance

On phones, dialogs and bottom sheets (login/access, Settings user editor and notification editors, schema/option modals, member/staff/expense/payment forms, delete confirms, WhatsApp notify, chart expand, and side drawers) keep padding and max-height above the bottom navigation and safe-area inset so actions are not cut off or covered by the nav. Overlays scroll when content is taller than the remaining viewport.

## Member filters, payments, and exit dates

The Members module's status, batch, and membership filters keep their selected values visible while filtering the member list. Member phone numbers must contain exactly 10 digits when adding or editing a record. Adding a member can optionally capture an initial payment; its payment mode and status choices are populated from the configured dropdown options and shown when Record Now is selected. Ad-hoc and trial members require an exit date and are changed to Inactive when that date is reached, both during member-list loading and by a daily scheduled check. Trial fees use the configured daily rate multiplied by the inclusive number of days between join and exit dates, and recalculate when the plan or dates change.

## Dashboard Net-In-Hand forecast

The Dashboard Net-In-Hand Prediction chart always uses an area chart, showing recognized actual collection less actual expenses through the current period, followed by an estimated trend for future periods. For future periods, projected net-in-hand accounts for both recognized revenue from active prepaid subscriptions extending into those periods (essential in Split/Accrual mode) as well as forecasted renewal collections based on active members' next payment due dates and amounts. Overdue members and ad-hoc or trial plans are not counted as upcoming renewal payments. Forecast expenses use the trailing 12 completed months of recorded operating expenses, combined with the nominal monthly salary run rate of all active staff members (with fallback to the trailing 12-month salary average if nominal staff salaries are unavailable). Both actuals and forecasts respect the configured Anchor (cash) or Split (accrual) revenue-recognition mode and the selected year and period filters. A green dotted line and Forecast label identify projected values; tooltips distinguish actual from predicted points.

To eliminate manual calculations, cumulative projected sums are surfaced in two complementary locations:
- **Net-In Hand KPI Card:** Displays the primary Actual Net In Hand achieved to date alongside an integrated bottom summary badge showing the remaining forecast (`Remaining: ₹XX.Xk`), with a tooltip breakdown of actual and remaining forecast.
- **Net-In-Hand Chart Summary Bar:** Directly above the chart curve, a persistent metrics strip breaks down `Actual: ₹XX.Xk`, `Remaining: ±₹YY.Yk`, and `Total: ₹ZZ.Zk`, allowing instantaneous analysis of upcoming cash flow and final bottom-line earnings without summing individual chart points.

## Dashboard metric info tips

Each Dashboard KPI, chart, and overdue/upcoming table title includes a small info icon. Hover or tap it for a short plain-language explanation of what the metric means and how it is calculated (respecting year/period filters and Anchor/Split recognition where relevant).

## Dashboard period filters

The Dashboard year, monthly/quarterly mode, and selected months or quarters filter the KPI totals and charts. Expense Breakdown follows those same selected periods, grouping recognized operating expenses and paid staff costs by category; misc expense details use the same period selection.

## Dashboard WhatsApp renewal notify

The Dashboard Overdue and Upcoming member tables include a compact Notify/WA action with a WhatsApp icon. Tapping it opens a mobile-friendly preview sheet with a prefilled overdue or upcoming renewal message (gym name, member, plan, amount, due date, and days). The message can be edited, copied, or opened in WhatsApp via a `wa.me` link with the member’s phone number and the edited text prefilled. Members without a phone number show a disabled action. No WhatsApp Business API is used; sending still happens in the WhatsApp app after the user confirms.

## Sign-in, authorization, and multi-user access

The web app requires a Google sign-in (`Anyone` access, execute as the deployer). Data still reads/writes through the deploying account’s Spreadsheet, Drive, Mail, and triggers.

- **First-run setup:** Owners use **Settings → Setup & Authorization** and click **Authorize Google services** in the UI (no Apps Script editor). Status checks cover Spreadsheet, Settings, Drive, Mail, ScriptApp, and the weekly trigger. **Mark setup complete** stores `SETUP_COMPLETE=YES`.
- **USERS sheet:** A dedicated `USERS` spreadsheet tab stores `userId`, email, name, status (`Active` / `Invited` / `Disabled`), owner flag, role preset, and a JSON permissions matrix (View / Create / Edit / Delete) for dashboard, members, staff, expenses, calendar, and settings.
- **Users & Access:** Settings tab to invite Google emails, apply Admin / Manager / Viewer presets, and edit the permission matrix.
- **Why invitees see a login screen:** With **Execute as: Me**, Google does **not** give the app the visitor’s email for consumer Gmail accounts. Adding someone in USERS is not enough by itself — they must verify identity via a **login code** emailed to that address, or open a **per-user invite link** (`?t=…`).
- **Share link / QR:** Users tab shows the published `/exec` URL (copy / share / QR). Each user also has a **copy invite link** action. Do not share the Apps Script editor or `/dev` URL.
- **Enforcement:** Navigation and write actions hide when denied; every server API also checks permissions.

### Client handover checklist

1. Share ownership of the Spreadsheet, Apps Script project, and Drive folder with the client.
2. Client creates a **new web app deployment** (`Execute as: Me`, `Who has access: Anyone`). `clasp push` alone does not change live access — redeploy after changing access.
3. Client opens the **/exec** URL, signs in, authorizes Google services, completes gym settings, and adds staff users.
4. Share the Users-tab QR / copy link with invitees (same `/exec` URL). They must use the invited Google account.
5. Developer may keep Editor access for clasp pushes; the client remains the deployer for Mail/triggers.

## Settings and dropdown configuration

The Settings module provides a responsive, device-compatible interface organized into four main tabs:

- **General:** Configures gym identity (gym name, owner name, owner email, and gym logo upload with LSC fallback), setup/authorization, financial policies (revenue recognition and currency numbering), database IDs (Spreadsheet and Drive folder with compact copy/open actions), and automated notifications. Mobile general settings use denser two-column rows and a single header Save. Notifications support editable receipt/weekly templates, sample HTML previews, weekly CC recipients, day/time/days-ahead schedule, and selectable report table columns.
- **Users:** Invite Google accounts and configure per-module View / Create / Edit / Delete access stored in the `USERS` sheet.
- **Dropdowns:** Manages schema-driven dropdown categories across the application. On mobile devices, categories can be selected via touch-friendly chips or dropdown selector, and options are rendered as mobile-friendly cards with dedicated reorder, edit, and delete buttons. On tablet and desktop screens, a category sidebar and data table layout are displayed. Reorder modifications trigger a floating action toolbar positioned above mobile navigation to save or discard changes. Modals for schema editing and option values adapt responsively with required field validation.
- **Guide:** In-app product walkthrough (`View_Guide.html`) with search, sticky section chips, and expand/collapse cards. Covers architecture (web app ↔ Sheets ↔ Drive ↔ Mail), getting started, sign-in/invites/roles, every module, Dashboard metric formulas, money rules (Anchor/Split, currency, Paid status), notifications, everyday UX, and admin notes. Readable on mobile and desktop. No Save action — documentation only. When user-facing behavior changes, update this Guide in the same change as `docs/features.md`.

## Mock Data Generator

The backend includes a dedicated mock data generator (`src/MockDataGenerator.gs`) that cleans and generates synchronized, realistic mock data spanning from 1-Jan-2025 to the present date for development and testing.

- **Data scope:** Populates `MEMBERS`, `PAYMENTS`, `STAFF`, `SALARY`, and `EXPENSES` with comprehensive test scenarios while preserving `SETTINGS` and `DROP_DOWN` configurations.
- **Member renewal scenarios:** Covers upcoming renewals (due in 2 days, due in 10 days, due today), overdue members (overdue by 5, 15, and 35 days), active members with comfortable runways, and inactive/left members with exit dates.
- **Batch and plan variety:** Incorporates adult and kids morning/evening batches across monthly, quarterly, annual, ad-hoc, and trial memberships.
- **Staff and payroll:** Covers multiple gym roles (Head Coach, Personal Trainers, Kids Coach, Nutritionist, Front Desk, Housekeeping, and resigned staff), monthly salary disbursements, festive and performance bonuses, and pending salary cycles for Action Needed indicators.
- **Operational expenses:** Generates chronological recurring facility lease/rent, seasonal electricity and power utilities, cleaning and hygiene supplies, equipment servicing, broadband/software, marketing campaigns, and miscellaneous expenses with item details.
- **Clean and re-run safety:** Wipes existing data rows (rows 2+) across the target sheets and batch-inserts the new dataset in seconds, preserving row 1 headers and formula columns marked with `*`.

## Lazy Loading and High-Performance Data Tables

To deliver an instantaneous and smooth user experience across large record volumes, the Members, Staff, and Expenses modules use a progressive lazy loading rendering strategy:

- **Batch Size:** Renders records in performant chunks of 50 items.
- **Progressive Bottom Loading:** Scrolling down on both desktop table views and mobile card containers dynamically detects when the user nears the bottom, appends a lightweight shimmer/skeleton row or card placeholder, and seamlessly loads the next batch without clearing or re-rendering existing items at the top.
- **Filtering & Search:** Instant debounced search and multi-criteria filters reset the viewport and immediately render the first 50 matching results.

## Chart Styling and Mobile Toolbar Ergonomics

All ApexCharts throughout the application (Dashboard, Expenses, Staff, and Members) follow unified visual and typographic standards:

- **Consistent Data-Labels & Axes:** Data labels use styled badge containers (`11px font-size`, semi-bold weight, contrasting dark text `#0f172a`, and subtle rounded pill backgrounds `#ffffff` with 0.92 opacity). Axes and legend text are scaled to a readable `11px` to ensure effortless legibility across devices.
- **Mobile Toolbar Ergonomics:** Toolbar buttons (zoom-in, zoom-out, pan/range, and reset) feature top clearance and scaled mobile padding on small screens (`max-width: 640px`) to prevent any visual overlap with peak chart data points and labels.

## Currency Numbering Styles and Chart Data Points

The application provides configurable currency numbering styles under **Settings > General Config**, allowing users to tailor how amounts are displayed across all modules (KPIs, tables, summary bars, quick-view drawers, transaction modals, and tooltips):

- **Indian System:** Formats amounts using standard Indian comma grouping and terminology (`₹10,000`, `₹1.3Lakhs`, `₹1.2Crore`).
- **Standard Metric System:** Formats amounts using international compact metric notations (`₹10k`, `₹1.3M`, `₹1B`).
- **Charts Data Points Exception:** To prevent visual clutter and overlapping labels on dense chart bars and points, chart data labels (`dataLabels`) plotted directly on ApexChart series always render using compact metric format (e.g. `₹30k`, `₹18.6k`), while chart tooltips, y-axis labels, KPI cards, and summary bars display the user-selected format.
- **Client Caching & Persistence:** The selected format is persisted to Google Sheets and mirrored locally in browser storage (`localStorage`) so formatting applies immediately across all pages without layout shift or waiting for network round-trips.
