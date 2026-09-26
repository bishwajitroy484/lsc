---
trigger: always_on
---

# Gym App - Architecture Rules

1. **No External Dependencies:** Do not import NPM packages for the frontend or backend. The backend must rely purely on Google Apps Script native classes (e.g., SpreadsheetApp, DriveApp). The frontend uses CDN links.
2. **Strict File Extension Rules:** Backend files must be `.gs`. Frontend files must be `.html` (even if they contain purely `<script>` or `<style>` tags).
3. **Dead Code Removal:** Proactively identify and remove unused variables, orphaned functions, and console.logs. Before deleting, verify the function is not being called from the HTML frontend via `google.script.run`.
4. **GAAP-Compliant Math:** All financial charting and revenue recognition logic must use daily proration arrays based on UTC dates. Do not suggest blunt monthly division for accruals.
5. **No Arrow Functions in Global GAS:** Do not use arrow functions for top-level backend Google Apps Script functions. They must be standard `function api_myFunction() {}` so they are exposed to `google.script.run`.
6. **Frontend Separation:** Maintain the structural separation of `View_*.html` (UI markup) and `Script_*.html` (Vanilla JS logic).