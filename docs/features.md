# Project LSC Features

This guide documents user-visible behavior. Keep it focused on what users can do and what to expect; use `.agents/rules/project_runbook_workflow.md` for engineering and release procedures.

Update the relevant section whenever a feature is added or its user-visible behavior changes. Include the user goal, key workflows, important validation or limitations, and related modules where useful.

## Local environment IDs (dev / prod)

Developers keep spreadsheet, Drive folder, Apps Script, and **stable web-app deployment** IDs in a local file that is **not** committed:

1. Copy `config/env.example.json` → `config/env.json`
2. Fill `dev` and `prod` blocks (`scriptId`, `spreadsheetId`, `driveId`, `deploymentId`)
3. Run `npm run use:dev` or `npm run use:prod` before push/deploy

Those commands write `.clasp.json` (script target) and `src/Config_Env.js` (runtime `SPREADSHEET_ID` / drive defaults). Then `npm run push:dev` / `push:prod` use the selected environment’s IDs.

**Stable web app URL:** `npm run deploy:dev` / `deploy:prod` updates the existing `deploymentId` so the `/exec` link does **not** change. Share that URL once. If `deploymentId` is empty, the first deploy creates one and saves it into `config/env.json` automatically. `prepare-env` also writes `LSC_DEPLOYMENT_ID` into `Config_Env.js` so Settings can publish against that stable deployment.

### Publish latest code from Settings (Dev & Prod)

After `clasp push` / `npm run push:dev` / `push:prod`, owners can open **Settings → General → Web app version** and click **Publish latest code**. That creates a new Apps Script version from the project HEAD and updates the existing web-app deployment (same `/exec` URL). Mail and Calendar keep the deployer account because the app still runs as `Execute as: Me`.

- Status chips show environment (Dev/Prod), live version, and deployment ID readiness.
- Owners can paste/save a deployment ID if it is missing from config.
- **Publish latest code** opens a mobile-friendly confirmation modal (not a browser `confirm` dialog).
- Setup & Authorization status chips use a compact **3-column** grid and include a **Publish API** check (Apps Script deployments API / scopes). Authorize Google services also probes this path.
- One-time Cloud setup: enable **Apps Script API** on the script’s standard GCP project (Project Settings → GCP Project), then **Authorize Google services** again so project/deployments scopes are granted.
- Non-owners can view status; only owners can Save ID or Publish.

## Feature areas

The current application includes these feature modules:

- Calendar
- Dashboard
- Expenses (Operating expenses and Staff & Payroll tabs)
- Members
- Settings

Add or update a section for a feature when documenting a behavior change; do not infer unverified product behavior from a module name alone.

## Expenses hub (Operating + Staff)

Expenses & Staff is a single page: shared year/period filters, **six KPI cards** in one row on desktop and two per row on a phone (Total Outflow, period average, Staff Cost, Other Expenses, Staff, and Action Needed), then Expenses Trend and the category donut share one row on a tablet or desktop, about 65% and 35%. Staff Cost is violet on both charts. View Misc switches the category donut to misc details. Phones stack the charts. Below that, list tabs are **All Records** (salaries, pending salary cycles, and expenses with type/status), **Staff** (staff member list with the existing detail drawer for Overview and Salary), and **Expenses** (operating expense records). **Add Record** asks Staff vs Expenses, then opens the existing add-staff or add-expense form. A new staff member is always **Active**; the status field appears only when editing that person. Salary payments still happen from the staff detail drawer. The record form leads with coverage start and end. Amount and paid date share one row, and credit type and payment mode share the next. It saves the row as Paid. Saving or deleting that salary refreshes the expense KPIs and charts without a page reload. It does not ask for payment status or a receipt link. Permission keys remain separate (`expenses` and `staff`); the page is visible with either View permission. Legacy `#staff` opens the Staff list tab. Sheets and APIs stay separate (`EXPENSES` vs `STAFF`/`SALARY`).

## Calendar year selection

The Calendar year selector is a dropdown populated from years found in member, payment, expense, staff, and salary records. The current year is included even when no records exist for it. Dashboard, Members, and Expenses (including Staff & Payroll) use the same available-year list, so their year selectors stay consistent.

## Calendar ops month planner

Calendar is the gym’s **operations month planner** (what happens on which day), not a second finance dashboard. It shows **Active** members only:

- **Renewals / Overdue** — next due is the latest covering payment’s **`endDate`** (Paid / Completed, or a partial payment that still has a pending balance). Overdue rows do not move the due date. The same rule is used by Members, Dashboard, and Google Calendar due events. Ad-hoc and trial plans never get a renewal due.
- **Exits** — ad-hoc and trial members appear on their **exit date** only.
- KPI strip: Overdue | Due ≤2 | Due 3–7 | This month. Urgency for side lists uses a **≤7 day** window; the month grid still shows the full selected month.
- Filter chips: Renewals · Overdue · Exits. Tap a day for a drawer (bottom sheet on mobile) with Open member and WhatsApp renewal reminder. Optional **Synced to Google Calendar** badge when a quarterly due event id is stored.

## Payment insights and dashboard collections

Dashboard collected-revenue KPIs and dashboard collection charts count only payments with a Paid or Completed status. Overdue, unpaid, and failed payments stay out of those totals. The same status handling applies whether a payment status is stored as its display label or as a dropdown ID.

Member Payment Insights are separate. They show **Cash** and **UPI** as two bars for each month or quarter of the selected year. **Amount** shows rupees. **Percent** shows each mode’s share as its own bar. **Monthly** and **Quarterly** use the same Anchor or Split recognition as the rest of the app. The chart includes money actually received on Paid/Completed payments and on partial Pending payments. It does not include the unpaid remainder, and it does not include Overdue rows.

## Member payments (cash, UPI, partial, receipt)

Record Payment and Edit Payment use one compact form. Coverage start and end sit at the top. Saving or deleting a payment shimmers the member list and the open detail (history, due date, and insights) immediately, then paints the latest values. The previous totals are not left on screen while the save is in progress.

- Cash and UPI must be numbers, 0 or more. Amount paid is their sum.
- There is no payment-status field, transaction ID, or receipt URL. Status is set automatically: **Paid** when the amount covers the cycle fee, **Pending** when it does not. The pending amount is the cycle fee minus the amount paid.
- An optional receipt image is uploaded to Drive, the same way as a member photo. Payment history links that image.
- On a new member, leave both amounts at 0 to skip the first payment. On Record or Edit, at least one amount must be greater than 0.
- Payment mode is stored as the dropdown key: Cash, UPI, or Split. History shows the mode name plus the cash and UPI amounts.
- A partial payment still covers that cycle, so the next due date moves to the cycle end. The member list, member detail, and payment history show **Partial** and the pending amount. The top Pay button and that history row collect the remaining balance on the same start and end. The next cycle is offered only after that balance is fully paid. Adding the rest on that same payment clears the balance. On Edit Member, Account Status includes **Pause** beside Active and In-Active. The first time the status list is loaded, Pause is added to that dropdown if it is missing. Choosing Pause asks how many days, starting today. While that pause is open the gap is not an overdue quarter and renewal reminders stay quiet. Pay then opens a short form on **Ad hoc**. The visit fee is the Ad hoc daily price from the price dropdown, for that member’s batch, multiplied by the days from start through end. An ad hoc payment keeps the pause. A new Quarter payment ends it. When the pause days pass, the next renewal is due from the pause end. The first save adds `holdStatus`, `holdStart`, `holdDays`, and `holdEnd` on MEMBERS, and `coverageKind` on PAYMENTS, when those columns are missing. An ad hoc receipt says thank you for the visit and names the dates. A quarter receipt stays a renewal. A pause email goes out when notifications are on and the member has an email.
- A new member is always **Active**. Member status is edited later, not on create. Trial and Ad hoc (including Ad-hoc) require an exit date. The add form keeps initial payment open under membership. Personal details sit in three rows: image and name, date of birth and phone, then gender and email.

## Notes fields

The app does not read or write a notes column on members, payments, staff, salary, or expenses. Forms do not collect notes. If a notes header is still present on a sheet, reads and writes skip it.

## Modal form validation

Member, staff, expense, payment, staff salary, and Settings add/edit forms validate every visible required field when Save is clicked. Missing or invalid fields are highlighted and show an inline message; the form is not submitted until those fields are corrected. Conditional fields, such as expense misc details, exit dates, salary coverage dates, and optional initial-payment details, are validated when their corresponding form state makes them visible and required. Expense amount edits use the same validation as the expense form.

## Mobile modal clearance

On phones, dialogs and bottom sheets (login/access, Settings user editor and notification editors, schema/option modals, member/staff/expense/payment forms, delete confirms, WhatsApp notify, chart expand, and side drawers) keep padding and max-height above the bottom navigation and safe-area inset so actions are not cut off or covered by the nav. Overlays scroll when content is taller than the remaining viewport.

## Mobile layout and type scale

The app is meant for portrait and landscape phones of any common width without page-level horizontal scrolling. Narrow viewports use a slightly smaller root type scale (further reduced under ~380px and in landscape), KPI labels truncate instead of forcing width, metric tips stay within the viewport, and wide tables scroll inside their own containers. Charts and module roots are constrained to the available width. On a phone, member Payment Insights keeps Amount, Monthly/Quarterly, and year on one row, and the cash/UPI chart stays inside the card for both month and quarter. Payment history is a stacked list on the phone, so the date, amount, status, and actions do not scroll sideways.

## Member filters, payments, and exit dates

The Members module's status, batch, and membership filters keep their selected values visible while filtering the member list. Member phone numbers must contain exactly 10 digits when adding or editing a record. Editing a member preserves existing optional values (email, DOB, exit date, profile image, batch, amount, and similar) when those form fields are left blank — only fields you change are overwritten. A new member is always Active. The add form, Record Payment, and Edit Payment ask for a mode (Cash or UPI) and that amount. Add another line when the payment used both modes, or the same mode again. The sheet stores one cash total and one UPI total, so reopening the payment shows one row per mode that has money. Leave the amount at 0 to skip the first payment. Paying less than the fee saves a Pending partial payment and the remaining balance. Ad hoc and trial members require an exit date. They stay Active on the member list and member detail while that date is today or later, and become In-Active with Account Closed once the date has passed. They do not show a renewal due date. The member detail shows Exit Date whenever the member has one. Trial fees use the configured daily rate multiplied by the inclusive number of days between join and exit dates, and recalculate when the plan or dates change. A partial payment on a recurring plan still covers that cycle: the due date moves to the cycle end, and the list shows the pending amount.

## Dashboard Net-In-Hand forecast

The Dashboard Net-In-Hand Prediction chart always uses an area chart, showing recognized actual collection less actual expenses through the current period, followed by an estimated trend for amounts not yet collected. The green dotted line always continues from the last actual point into later months. When a month has both money already received and money still expected, that line starts at the received amount and rises by the expected amount, so a 20k receipt with 10k still due is drawn from 20k up to 30k. In Quarterly view the current quarter stays one point for what is already in hand, and the months still ahead get their own label, such as Nov–Dec. That point is drawn at the forecast amount, so a negative forecast sits below zero instead of looking like a fifth quarter. Over time keeps the same months and adds them into a running total: a solid line for what is already in hand, then a dotted line for the forecast. Remaining includes unpaid renewals whose next due date is still today or later, including later this month, plus later months in the selected year, and open partial-payment balances still owed by active members. It does not wait for the next calendar month. Projected net-in-hand accounts for both recognized revenue from active prepaid subscriptions extending into future periods (essential in Split/Accrual mode) and forecasted renewal collections based on active members' next payment due dates and amounts. Overdue members and ad-hoc or trial plans are not counted as upcoming renewal payments. Forecast expenses use the trailing 12 completed months of recorded operating expenses, combined with the nominal monthly salary run rate of all active staff members (with fallback to the trailing 12-month salary average if nominal staff salaries are unavailable). Both actuals and forecasts respect the configured Anchor (cash) or Split (accrual) revenue-recognition mode and the selected year and period filters. Actual, Projected, and Total are calculated from those calendar months, then drawn as months or as quarters. Switching Monthly and Quarterly keeps the same covered months, so the three numbers stay the same for both Anchor and Split: all months match all quarters, and a quarter matches its three months. A slow reply from the previous view is ignored. A green dotted line and Forecast label identify projected values; tooltips distinguish actual from predicted points.

To eliminate manual calculations, cumulative projected sums are surfaced in two complementary locations:
- **Net-In Hand KPI Card:** Displays Actual net-in-hand till today, with a Projected badge for what is still expected. The tooltip splits Actual and Projected.
- **Net-In-Hand Chart Summary Bar:** Above the chart, Actual, Projected, and Total use those same three numbers. They do not change between Monthly and Quarterly when the covered months are the same.

## Dashboard metric info tips

Each Dashboard and Expenses info icon shows a short plain tip, about ten words, for what that number means.

## Dashboard period filters

On a tablet or desktop, the two chart rows use a 40% / 20% / 40% split. Revenue vs Expenses and Net-In-Hand Forecast are the wider cards, with Members by Batch as a narrower bar chart between them. Cash vs UPI and Upcoming birthdays are the wider cards, with Expense Breakdown narrower between them. Upcoming birthdays stays open through four names, then the list scrolls inside the card. Phones keep one card per row. The Dashboard year, monthly/quarterly mode, and selected months or quarters filter the KPI totals and charts. Revenue vs Expenses compares money already received with operating expenses for each selected period, and a summary bar on that chart shows the Revenue and Expenses totals for those periods only. Cash vs UPI uses those same periods as two bars, one for Cash and one for UPI, with a summary bar of the Cash and UPI totals for the same periods. Amount shows rupees. Percentage shows each mode’s share as its own bar, and switching that control redraws only this chart. The summary totals stay in rupees. The label icon shows or hides the values. Expense Breakdown uses the same white value labels as the other charts. Staff Cost is violet. Members by Batch is a bar chart of member counts by batch time. The axis shows the time only. Kids batches are amber and other batches stay blue. A kids batch and another batch at the same time stay as two bars so the color shows which one is the kids batch. Misc details use the same period selection, and View Misc switches only that donut. Expanding a chart uses the chart that is on the current dashboard, so a leftover overlay from an earlier view does not leave a dark screen with no panel. Net-In-Hand Forecast can show Period, each month or quarter after expenses, or Over time, the running total with a solid line for money already in hand and a dotted line for the forecast. Switching Period or Over time redraws only that chart. The Overdue Amount is the sum of the Overdue table. That table lists each member who still owes money: a renewal whose due date has passed, an open partial balance, or an Ad hoc or Trial fee that has not been paid. A partial whose coverage end is in a later year still appears when the current month is part of the selected period, matching the member list. A partial balance due within the next 7 days stays on the Upcoming table until it is fully paid. The member list marks people who still owe as Overdue and shows the pending amount.

## WhatsApp notify (Dashboard and Members)

The Dashboard Overdue and Upcoming member tables, the Calendar renewal drawer, and the Members payment-history rows include a compact Notify/WA action with a WhatsApp icon. Tapping it opens a mobile-friendly preview sheet with a prefilled message that can be edited, copied, or opened in WhatsApp via a `wa.me` link with the member’s phone number. The payment receipt email and the paid WhatsApp message say thank you for the renewal, with the renewed-on date and the validity date. A partial payment uses its own wording: the amount received and the balance still due, on both the receipt email and WhatsApp. The upcoming WhatsApp reminder names the due date and how many days are left, and a partial balance due in that window names the remaining amount. The overdue WhatsApp reminder stays a short note of the due date and how many days it is overdue, and names the remaining balance when the payment is partial. Email paragraphs use a single small gap between lines. The weekly renewal report greets the owner by first name and lists members by first name. Members without a phone number show a disabled action. No WhatsApp Business API is used; sending still happens in the WhatsApp app after the user confirms.

## Sign-in, authorization, and multi-user access

The web app is published with `Anyone` access and executes as the deployer. Data reads/writes through the deploying account’s Spreadsheet, Drive, Mail, and triggers, so invited users never need access to those files. Users get in through a personal link sent by email.

- **First-run setup:** Owners use **Settings → Setup & Authorization** and click **Authorize Google services** in the UI (no Apps Script editor). Status checks cover Spreadsheet, Settings, Drive, Mail, ScriptApp, **Google Calendar**, and the weekly trigger. If Calendar scope was newly added, Authorize opens Google consent; allow Calendar, then click Authorize again. **Mark setup complete** stores `SETUP_COMPLETE=YES`.
- **USERS sheet:** A dedicated `USERS` spreadsheet tab stores `userId`, email, name, status (`Active` / `Invited` / `Disabled`), owner flag, role preset, and a JSON permissions matrix (View / Create / Edit / Delete) for dashboard, members, expenses/staff (stored as both keys, edited as one **Expenses & Staff** row), calendar, and settings.
- **Users & Access:** Settings tab to add people, apply Admin / Manager / Viewer presets, and edit the per-page permission matrix. The matrix shows a single **Expenses & Staff** row for the merged Expenses hub (saving keeps `expenses` and `staff` keys aligned for API checks). Saving a new user can email them a professional message saying they have been given access, with a button to open the app and the list of pages they can use. Nothing about the underlying Sheet, Drive, or script is shared or mentioned.
- **How invitees sign in:** No password or one-time code. Each user has a **personal link** (`?t=…`). Opening it signs them in, and the device remembers them. Disabling or deleting a user stops the link; **New link** replaces it.
- **Link / QR:** Each user in the Users tab has a mail icon (send or resend the email) and a QR icon (personal link, QR code, copy, share, new link). Do not share the Apps Script editor or `/dev` URL.
- **Enforcement:** View only opens the page and hides add, edit, and delete. Create, Edit, and Delete each do only that action, and ticking one of them also requires View. Dashboard and Calendar are view-only. On Settings, create adds a user or dropdown option, edit saves changes, and delete removes a user or option. Factory reset stays owner-only. The server checks every action.

### Client handover checklist

1. Share ownership of the Spreadsheet, Apps Script project, and Drive folder with the client.
2. Client creates a **new web app deployment** (`Execute as: Me`, `Who has access: Anyone`). `clasp push` alone does not change live access — redeploy after changing access.
3. Client opens the **/exec** URL, signs in, authorizes Google services, completes gym settings, and adds staff users.
4. Each invited user receives an email with their personal link (or the client shares the link/QR from the Users tab).
5. Developer may keep Editor access for clasp pushes; the client remains the deployer for Mail/triggers.
6. Later releases: developer runs `npm run push:prod`, then an owner (often the client, or the developer if they are an owner) clicks **Settings → Web app version → Publish latest code** so the stable URL picks up the new code without flipping Mail/Calendar identity. Avoid `npm run deploy:prod` from the developer account if client email/calendar must stay.

## Settings and dropdown configuration

The Settings module provides a responsive, device-compatible interface organized into four main tabs:

- **General:** Opens with **Setup & Authorization** expanded. Every other section (web app version, gym identity, financial policies, database, notifications, calendar reminders) starts collapsed; tap a heading to open it. On a tablet or desktop every section stays in two columns, whether it is open or closed, and each section keeps its colored border on a white background, including when the section is collapsed. Inside Notifications, payment receipt and both WhatsApp messages sit in one column and the weekly renewal report sits in the other. Dropdowns use a side category list from tablet width up. Configures gym identity (gym name, owner name, owner email, and gym logo upload with LSC fallback), setup/authorization, **Web app version** (publish latest pushed code to the stable `/exec` deployment), financial policies (revenue recognition and currency numbering), database IDs (Spreadsheet and Drive folder with compact copy/open actions), automated notifications, and Google Calendar due reminders. Mobile general settings use denser two-column rows and a single header Save. Notifications support editable receipt/weekly templates, sample HTML previews, **Test** (delivers a sample receipt or weekly report to the signed-in admin inbox, without emailing members or CC), weekly CC recipients, day/time/days-ahead schedule, and selectable report table columns. **Calendar due reminders** (opt-in) create a timed event on the deployer/owner Google Calendar when a **quarterly** payment covers the cycle (Paid/Completed, or a partial payment that still has a pending balance). The event is placed **2 days before** the payment **`endDate`**, at a configured start hour/duration. Each covering quarterly payment **deletes the previous due event** (if any) and creates the next one — a cyclic replace stored as `MEMBERS.dueCalendarEventId`. Turning the feature off clears leftover events. Trial/Ad-hoc/Monthly/Annual are excluded; no backfill of existing members. Requires Calendar OAuth (re-authorize in Setup after first deploy). Email payment receipts still send only for new Paid/Completed payments.
- **Users:** Add people and configure per-page View / Create / Edit / Delete access stored in the `USERS` sheet. Invitees only need their personal link; they are never given access to the Spreadsheet, Drive folder, or Apps Script project, because the app reads and writes data on their behalf. After adding someone in Settings → Users, also add their Gmail under Cloud Console → [Audience → Test users](https://console.cloud.google.com/auth/audience?project=lakshya-strength-conditioning) (the LSC Users tab cannot do this). The Users tab shows a short 1–2–3 checklist with that direct link.
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

To deliver an instantaneous and smooth user experience across large record volumes, the Members and Expenses (Operating and Staff & Payroll tabs) modules use a progressive lazy loading rendering strategy:

- **Batch Size:** Renders records in performant chunks of 50 items.
- **Progressive Bottom Loading:** Scrolling down on both desktop table views and mobile card containers dynamically detects when the user nears the bottom, appends a lightweight shimmer/skeleton row or card placeholder, and seamlessly loads the next batch without clearing or re-rendering existing items at the top.
- **Filtering & Search:** Instant debounced search and multi-criteria filters reset the viewport and immediately render the first 50 matching results.

## Chart Styling and Mobile Toolbar Ergonomics

All ApexCharts throughout the application (Dashboard, Expenses Operating/Staff tabs, and Members) follow unified visual and typographic standards:

- **Consistent Data-Labels & Axes:** Data labels use styled badge containers (`11px font-size`, semi-bold weight, contrasting dark text `#0f172a`, and subtle rounded pill backgrounds `#ffffff` with 0.92 opacity). Axes and legend text are scaled to a readable `11px` to ensure effortless legibility across devices.
- **Mobile Toolbar Ergonomics:** Toolbar buttons (zoom-in, zoom-out, pan/range, and reset) feature top clearance and scaled mobile padding on small screens (`max-width: 640px`) to prevent any visual overlap with peak chart data points and labels.

## Currency Numbering Styles and Chart Data Points

The application provides configurable currency numbering styles under **Settings > General Config**, allowing users to tailor how amounts are displayed across all modules (KPIs, tables, summary bars, quick-view drawers, transaction modals, and tooltips):

- **Indian System:** Formats amounts using standard Indian comma grouping and terminology (`₹10,000`, `₹1.3Lakhs`, `₹1.2Crore`).
- **Standard Metric System:** Formats amounts using international compact metric notations (`₹10k`, `₹1.3M`, `₹1B`).
- **Charts Data Points Exception:** To prevent visual clutter and overlapping labels on dense chart bars and points, chart data labels (`dataLabels`) plotted directly on ApexChart series always render using compact metric format (e.g. `₹30k`, `₹18.6k`), while chart tooltips, y-axis labels, KPI cards, and summary bars display the user-selected format.
- **Client Caching & Persistence:** The selected format is persisted to Google Sheets and mirrored locally in browser storage (`localStorage`) so formatting applies immediately across all pages without layout shift or waiting for network round-trips.
