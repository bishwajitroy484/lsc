# 🏗️ System Architecture & Coding Standards

This document outlines the technical foundation of the project. Any AI or developer contributing to this codebase must conform to these architectural rules.

## 1. Technology Stack
*   **Backend:** Google Apps Script (GAS) Native Classes (e.g., `SpreadsheetApp`, `DriveApp`).
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript.
*   **Dependencies:** **ZERO** NPM packages. External frontend libraries may only be imported via CDN links.

## 2. File Structure & Extensions
*   **Backend Files:** Must strictly use the `.gs` extension.
*   **Frontend Files:** Must strictly use the `.html` extension. This applies even to files that contain purely `<script>` tags or `<style>` tags.

## 3. Frontend Separation of Concerns
To maintain a clean and scalable UI layer, the frontend must be split structurally:
*   `View_*.html`: Used exclusively for HTML markup and UI structure.
*   `Script_*.html`: Used exclusively for client-side Vanilla JavaScript logic.

## 4. Backend Coding Standards
*   **No Global Arrow Functions:** Do not use arrow functions for top-level backend Google Apps Script functions. They must be declared using the standard `function api_myFunction() {}` syntax to ensure they are properly exposed to the frontend via `google.script.run`.
*   **Dead Code Management:** Proactively identify unused variables, orphaned functions, and `console.log` statements.
    *   *Critical Check:* Before deleting any backend function, verify it is not being called asynchronously from the frontend.

## 5. Business Logic & Math Standards
*   **GAAP-Compliant Financials:** All financial charting and revenue recognition logic must be mathematically rigorous.
*   **Daily Proration:** You must use daily proration arrays based on UTC dates. 
*   **Strict Prohibition:** Do NOT use or suggest blunt monthly division (e.g., dividing an annual contract by 12) for financial accruals or metrics.