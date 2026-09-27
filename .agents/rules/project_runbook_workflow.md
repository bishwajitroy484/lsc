# Project Runbook and Git Workflow

Use this workflow for every code-development task. The user's standing instruction authorizes Dev deployment, branch commits, and pull request creation or updates as part of that task. It does not authorize Production deployment or merging.

## Branching

- Check the worktree before starting. Preserve unrelated user changes; do not stage, overwrite, or discard them. Reuse the current task branch if it is already the correct branch for the work; otherwise create a descriptive branch from the latest `develop`.
- Use prefixes such as `feature/`, `fix/`, `refactor/`, or `chore/`.
- Never commit directly to `main` or `develop`.

## Development and tests

- Run the relevant existing tests before editing to establish a baseline.
- Follow existing code and test patterns; `npm test` runs the project's Jest suite.
- Implement the requested changes and write or update tests for changed behavior, then run the existing and new relevant tests.
- Resolve test failures introduced by the change before deployment or PR creation. If baseline failures, unavailable dependencies, or environment problems prevent a meaningful pass, document the exact blocker and ask the user before treating Dev deployment or PR creation as complete.
- Documentation-only changes do not require an application deployment or app test run; validate the documentation and state which app checks were not applicable.

## Dev deployment and pull requests

For every code-development task, complete these steps in order:

1. Inspect the Dev Clasp configuration and verify that it targets the intended development project. If Dev and Prod IDs are identical when the environments should be separate, stop and ask the user to resolve the configuration; never guess or push to an ambiguous target.
2. Push the tested code to the verified Dev Apps Script instance.
3. Commit the changes on the task branch with a descriptive message.
4. Create a pull request from the task branch to `develop`, including a concise summary and actual test results. For follow-up work, push the updated change, add a commit to the same task branch, and update the existing pull request rather than creating a new branch or PR.
5. Report the branch, Dev validation, commit, pull request, and test results so the user can review the changes.

The user verifies the changes and provides feedback. Continue requested fixes or additions on the same branch and pull request until the user approves the result.

If a required action is blocked (for example, branch creation, Dev access, push, or PR creation), stop before claiming the workflow is complete. Preserve the branch and all changes, report the failed step and its output, and ask how the user wants to proceed. Never silently skip a required step or switch to another environment.

## Production

- Production pushes and deployments are restricted and require explicit user approval for that specific action. The standing Dev workflow is not Production approval.
- Deploy production only from the approved release state on `main`, after the changes have been reviewed and merged through the project's release process.
- Merging a pull request remains a manual user or maintainer action; never merge it on the user's behalf.
