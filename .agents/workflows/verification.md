# Verification Workflow

Use `qa-verification` when one of these is true:

- the task changes browser-visible UI behavior
- the task changes desktop-visible Tauri behavior that needs a human verification story
- the user explicitly asks for verification evidence, screenshots, or a QA pass
- smoke verification across backend, Tauri, or workspace tasks materially reduces risk

This workflow does not replace tests or review checkpoints. It chooses concrete evidence targets for completed work.

## Expected Workflow

1. Load `.agents/references/verification-targets.md`.
2. Choose the smallest browser-visible, desktop-visible, backend smoke, or workspace verification target that catches the likely failure mode.
3. Run the targeted check or capture the requested evidence.
4. Record what was verified, what was not verified, and any residual risk in the handoff or implementation review context.
