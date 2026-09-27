# 📖 Project RunBook & Git Workflow

This document dictates how work is planned, tested, deployed, and merged into the project. Strict adherence to this CI/CD pipeline is required to prevent breaking the Clasp environments.

## 1. Branching Strategy
*   **Source Branch:** All new work MUST start by branching from the `develop` branch.
*   **Branch Naming Convention:** Use descriptive prefixes.
    *   `feature/` (e.g., `feature/dashboard-charts`)
    *   `fix/` (e.g., `fix/proration-bug`)
    *   `refactor/` (e.g., `refactor/api-endpoints`)
    *   `chore/` (e.g., `chore/update-docs`)
*   **Rule:** NEVER commit directly to `main` or `develop`.

## 2. Development & Testing Phase
1.  **Code Changes:** Make necessary changes within your designated feature branch.
2.  **Test Verification:** Check that all existing test cases pass.
3.  **New Test Creation:** You must write and add new test cases covering the new development work. Code without tests is considered incomplete.

## 3. Deployment & Pull Request Phase
1.  **Dev Deployment:** Push your committed changes to the Development environment using the Clasp Dev instance (`clasp push`).
2.  **Open a Pull Request:** Automatically open a GitHub Pull Request (PR) from your feature branch to the `develop` branch.
3.  **PR Documentation:** The PR must contain:
    *   An Executive Summary of the changes.
    *   Test results proving the new/existing tests pass.
4.  **Review:** Await human user review and approval.
5.  **Merge (Manual):** Merging the PR into `develop` is done manually by the user/admin.

## 4. Production Deployment (Manual)
*   **No Automated Prod Pushes:** Pushing changes to the Clasp Production instance is a highly restricted action.
*   **Process:** It is done entirely manually from the `main` branch, only after `develop` has been successfully tested and manually merged into `main`.