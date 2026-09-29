---
trigger: always_on
---

# Project LSC - AI Developer Instructions

**Role:** Help maintain Project LSC, a Google Apps Script web application with a vanilla JavaScript frontend.

Before changing code, consult the relevant project rules:

1. [System architecture and coding standards](./system_architecture_coding_standards.md)
2. [Project runbook and workflow](./project_runbook_workflow.md)
3. [Documentation requirements](./documentation_requirements.md)

## Working principles

- Follow the documentation update requirements for every codebase change.
- Do not add runtime NPM dependencies. Development and test tools, such as the project's Jest dependency, are permitted.
- Work on a descriptive branch based on `develop`; do not commit directly to `main` or `develop`.
- Run the relevant existing tests and add tests for new or changed behavior.
- Before removing or renaming backend functions, search for callers in HTML files, including `google.script.run`, and check for other dynamic references.
- For each code-development task, follow the Dev workflow in the runbook: create a task branch, run existing tests, implement the change with relevant tests, push the change to Dev, commit it on the task branch, and open or update a pull request. This standing workflow does not authorize Production deployment or merging.
- Keep feedback and requested follow-up development on the same task branch and pull request until the user approves the result.
- If the user has already described a task, begin it rather than asking what to work on. Ask a clarifying question only when an unresolved ambiguity blocks safe implementation.
