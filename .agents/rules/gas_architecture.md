---
trigger: always_on
---

# Project LSC - Google Apps Script Rules

Follow the detailed [system architecture and coding standards](./system_architecture_coding_standards.md) and [project runbook and workflow](./project_runbook_workflow.md).

- Use GAS native services in backend code and do not add runtime NPM dependencies.
- Preserve the repository's existing `.js` backend files; Clasp accepts both `.js` and `.gs`. Frontend files use `.html`.
- Follow the naming, modularity, validation, testing, and do/don't standards in the system architecture rules.
- Declare backend functions called by `google.script.run` as named global functions, and verify all callers before removing or renaming them.
- Apply the documented daily-proration rules to accrual and revenue-recognition calculations.
- For each code-development task, follow the Dev deployment and pull request workflow in the runbook. Continue feedback changes on the same branch and pull request.
- Never deploy to Production or merge a pull request without explicit human approval.