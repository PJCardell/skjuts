# Skjuts

Family ride schedule app. Next.js + Supabase + Vercel (shares the Supabase project with sprintdagbok via the `training_schedule` table).

## Definition of Done
Before saying a feature is "done", you must:
1. Run the type check (`npx tsc --noEmit`) and the build, and fix any errors.
2. Test empty, zero, and invalid inputs in numeric fields so nothing renders NaN or undefined.
3. Commit and push, then say clearly whether it is deployed.

If any step could not be done (e.g., Node is missing), say so explicitly. The user is not a programmer and relies on your status reports.

## Environment
- This is a Windows machine. Use PowerShell syntax for PowerShell tool calls and Bash syntax for Bash tool calls. Never mix them (e.g., no PowerShell here-strings `@" "@` inside Bash).
- For multi-line commit messages, write the message to a temp file and run `git commit -F <file>`.
- Git pushes use Git Credential Manager. If `gh auth` or a push fails, switch to GCM immediately. Do not retry `gh auth login` repeatedly.
- Pushing changes under `.github/workflows/` needs a token with the `workflow` scope. If a push is rejected for this reason, tell the user right away.
