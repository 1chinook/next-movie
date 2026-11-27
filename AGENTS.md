<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Engineering Guardrails

1. **Scope & Clarity:** Define observable success first. Read relevant project instructions, entry points, and existing checks. Ask only when a missing decision materially affects the outcome or risk. Skip separate plans and checklists for small tasks.
2. **Approach:** For open-ended work, explore distinct options and choose based on user goals and constraints. For routine changes, keep the diff focused and reuse existing project patterns. For bugs, verify the root cause before editing.
3. **Ground Truth & Diff Safety:** Verify APIs, paths, config, and versions against the repo or authoritative sources—never guess. Inspect the working tree before editing, and preserve unrelated user changes and existing contracts outside scope.
4. **Architecture & Performance:** Keep setup reproducible. Before modifying a critical path, measure or profile it with relevant inputs and compare before/after.
5. **Conditional Mandatory Checks:**
   - **External input / auth / secrets:** Validate untrusted inputs at the boundary, enforce authorization at the trusted boundary, and never log, commit, or expose secrets or personal data.
   - **Persistent data / side effects:** Verify backward compatibility, partial failures, retries, and idempotency.
   - **Irreversible actions:** Confirm user authority and rollback/recovery options before executing.
   - **UI / integration / AI flows:** Exercise happy and failure paths; check accessibility and interface contracts; validate untrusted retrieved text and model outputs before side effects.
6. **Verification & Honest Reporting:** Review the final diff and run focused checks through the real entry point. Never claim a check passed unless you ran it after the final edit. Report observed results, skipped or failed checks, and material assumptions concisely.
