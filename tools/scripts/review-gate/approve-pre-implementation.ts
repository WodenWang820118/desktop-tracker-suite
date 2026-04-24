import {
  createApproval,
  getRepoContext,
  parseArgs,
  saveState,
  validateReviewerId,
} from './shared.ts';

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    [
      'Usage: node --experimental-strip-types tools/scripts/review-gate/approve-pre-implementation.ts [options]',
      '',
      'Options:',
      '  --reviewer <id>   Reviewer id: copilot-claude | copilot-gpt-5-mini | gemini-2.5-pro | codex-subagent',
      '  --focus <area>    Approval focus label. Default: general',
      '  --summary <text>  Approval summary text.',
      '  --force           Allow writing approval state even when the worktree is dirty.',
      '  --help, -h        Show this help message.',
    ].join('\n'),
  );
  process.exit(0);
}

const repoContext = getRepoContext();
const reviewer = validateReviewerId(options.reviewer);

if (repoContext.dirty && !options.force) {
  console.error(
    'Cannot open the pre-implementation gate while the worktree is dirty. Clean or reset the worktree first, or rerun with --force if you intentionally need to override this.',
  );
  process.exit(1);
}

const state = createApproval({
  reviewer,
  focus: options.focus,
  summary: options.summary,
  repoContext,
});

saveState(state, repoContext.root);

console.log('Pre-implementation review approved.');
console.log(`Reviewer: ${state.approval.reviewer}`);
console.log(`Focus: ${state.approval.focus}`);
console.log(`Branch: ${state.approval.branch ?? 'unknown'}`);
console.log(`HEAD: ${state.approval.head ?? 'unknown'}`);
console.log(`Expires: ${state.approval.expiresAt}`);
