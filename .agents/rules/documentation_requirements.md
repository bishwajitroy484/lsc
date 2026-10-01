# Documentation Requirements

Whenever codebase changes are made, update the relevant documentation to reflect the current state of the project. Do not wait for the user to request documentation updates.

- **Architecture:** Update [System Architecture and Coding Standards](./system_architecture_coding_standards.md) for structural changes, data-flow changes, diagrams, or component additions.
- **Engineering workflow:** Update [Project Runbook and Workflow](./project_runbook_workflow.md) for development, testing, review, and deployment process changes.
- **User-facing features:** Update the project feature guide at [`docs/features.md`](../../docs/features.md) for new features and user-visible functionality changes. Keep implementation and release procedure out of the feature guide.
- **In-app Product Guide (required with user-facing changes):** When you add a new user-visible feature or change existing user-visible behavior (modules, metrics/formulas, auth/setup, notifications, money rules, Settings, UX patterns), update the in-app Guide content in [`src/View_Guide.html`](../../src/View_Guide.html) in the **same change set** as [`docs/features.md`](../../docs/features.md). Keep Guide language plain and accurate (architecture, connections, module how-to, KPI formulas). If `Script_Guide.html` navigation chips/sections change, keep them in sync with the sections in `View_Guide.html`. Skipping the Guide update for a user-facing change is a documentation failure.

The architecture rules and runbook are the project equivalents of `Architecture.md` and `RunBook.md`. Keep diagrams and workflow descriptions accurate when the related project changes. If no documentation change is needed, state why in the task summary.
