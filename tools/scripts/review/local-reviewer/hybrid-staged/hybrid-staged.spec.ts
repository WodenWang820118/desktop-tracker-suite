import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_HYBRID_GPT_DIFF_CHARS,
  type HybridGptReview,
  type HybridLocalMode,
  type HybridLocalReviewResult,
  type HybridReviewProfileName,
} from '../../local-reviewer-support.ts';
import {
  runHybridStagedReview,
  type HybridStagedWorkerRunners,
} from './hybrid-staged.ts';

test('runHybridStagedReview short-circuits clean staged diffs', async () => {
  const report = await runHybridStagedReview({
    changedFiles: [],
    diffText: '',
    repoRoot: '/repo',
    scriptPath: 'tools/scripts/review/local-reviewer.ts',
    toolRepoRoot: '/tool-repo',
  });

  assert.equal(report.strategy, 'gpt-gate');
  assert.equal(report.heuristics.file_count, 0);
  assert.equal(report.gpt_review.overall_risk, 'low');
  assert.equal(report.gpt_review.summary, 'No staged changes were detected.');
  assert.equal(report.recommended_escalation, false);
  assert.equal(report.local_review, null);
});

test('runHybridStagedReview skips local review after confident low-risk GPT triage', async () => {
  const calls: string[] = [];
  const report = await runHybridStagedReview(
    {
      changedFiles: ['src/utils.ts'],
      diffText: '@@\n+export const value = 1;\n',
      repoRoot: '/repo',
      scriptPath: 'tools/scripts/review/local-reviewer.ts',
      toolRepoRoot: '/tool-repo',
    },
    fakeRunners({
      calls,
      gptReview: hybridGptReview({
        confidence: 'high',
        needs_local_deep_review: false,
        overall_risk: 'low',
      }),
    }),
  );

  assert.deepEqual(calls, ['gpt:src/utils.ts']);
  assert.equal(report.local_mode, 'skipped');
  assert.equal(report.local_review, null);
  assert.equal(report.recommended_escalation, false);
});

test('runHybridStagedReview runs targeted local review when GPT requests depth', async () => {
  const calls: string[] = [];
  const report = await runHybridStagedReview(
    {
      changedFiles: ['src/utils.ts', 'README.md'],
      diffText: '@@\n+docs and code\n',
      repoRoot: '/repo',
      scriptPath: 'tools/scripts/review/local-reviewer.ts',
      toolRepoRoot: '/tool-repo',
    },
    fakeRunners({
      calls,
      gptReview: hybridGptReview({
        confidence: 'low',
        focus_profiles: ['repo-habits'],
        needs_local_deep_review: true,
        overall_risk: 'medium',
      }),
    }),
  );

  assert.deepEqual(calls, ['gpt:src/utils.ts,README.md', 'local:targeted:repo-habits']);
  assert.equal(report.local_mode, 'targeted');
  assert.deepEqual(report.requested_profiles, ['repo-habits']);
});

test('runHybridStagedReview bypasses GPT and forces full local review for oversized diffs', async () => {
  const calls: string[] = [];
  const report = await runHybridStagedReview(
    {
      changedFiles: ['src/utils.ts'],
      diffText: `@@\n+${'x'.repeat(MAX_HYBRID_GPT_DIFF_CHARS + 1)}\n`,
      repoRoot: '/repo',
      scriptPath: 'tools/scripts/review/local-reviewer.ts',
      toolRepoRoot: '/tool-repo',
    },
    fakeRunners({ calls }),
  );

  assert.deepEqual(calls, ['local:full:typescript']);
  assert.equal(report.gpt_review.status, 'runtime-error');
  assert.equal(report.local_mode, 'full');
  assert.deepEqual(report.requested_profiles, ['typescript']);
  assert.equal(report.recommended_escalation, false);
});

test('runHybridStagedReview starts full local review for sensitive diffs before GPT narrows focus', async () => {
  const calls: string[] = [];
  const report = await runHybridStagedReview(
    {
      changedFiles: ['src/auth.service.ts'],
      diffText: '@@\n+const token = process.env.API_KEY;\n',
      repoRoot: '/repo',
      scriptPath: 'tools/scripts/review/local-reviewer.ts',
      toolRepoRoot: '/tool-repo',
    },
    fakeRunners({
      calls,
      gptReview: hybridGptReview({
        confidence: 'high',
        focus_profiles: ['general'],
        needs_local_deep_review: false,
        overall_risk: 'low',
      }),
    }),
  );

  assert.deepEqual(calls, ['gpt:src/auth.service.ts', 'local:full:angular']);
  assert.equal(report.local_mode, 'full');
  assert.deepEqual(report.requested_profiles, ['angular']);
  assert.equal(report.recommended_escalation, true);
});

test('runHybridStagedReview forces full local review for diffs over fifteen files', async () => {
  const calls: string[] = [];
  const changedFiles = Array.from(
    { length: 16 },
    (_, index) => `src/file-${index}.ts`,
  );
  const report = await runHybridStagedReview(
    {
      changedFiles,
      diffText: '@@\n+const value = 1;\n',
      repoRoot: '/repo',
      scriptPath: 'tools/scripts/review/local-reviewer.ts',
      toolRepoRoot: '/tool-repo',
    },
    fakeRunners({
      calls,
      gptReview: hybridGptReview({
        confidence: 'high',
        needs_local_deep_review: false,
        overall_risk: 'low',
      }),
    }),
  );

  assert.deepEqual(calls, [
    `gpt:${changedFiles.join(',')}`,
    'local:full:typescript',
  ]);
  assert.equal(report.local_mode, 'full');
  assert.deepEqual(report.requested_profiles, ['typescript']);
});

test('runHybridStagedReview propagates GPT worker failures to command handlers', async () => {
  await assert.rejects(
    () =>
      runHybridStagedReview(
        {
          changedFiles: ['src/utils.ts'],
          diffText: '@@\n+const value = 1;\n',
          repoRoot: '/repo',
          scriptPath: 'tools/scripts/review/local-reviewer.ts',
          toolRepoRoot: '/tool-repo',
        },
        fakeRunners({
          calls: [],
          gptError: new Error('GPT worker failed'),
        }),
      ),
    /GPT worker failed/,
  );
});

function fakeRunners(input: {
  calls: string[];
  gptError?: Error;
  gptReview?: HybridGptReview;
}): HybridStagedWorkerRunners {
  return {
    async runHybridGptWorkerProcess(runInput) {
      input.calls.push(`gpt:${runInput.changedFiles.join(',')}`);
      if (input.gptError) {
        throw input.gptError;
      }
      return input.gptReview ?? hybridGptReview({});
    },
    async runHybridLocalWorkerProcess(runInput) {
      input.calls.push(
        `local:${runInput.localMode}:${runInput.requestedProfiles.join(',')}`,
      );
      return localReviewResult({
        localMode: runInput.localMode,
        requestedProfiles: runInput.requestedProfiles,
      });
    },
  };
}

function hybridGptReview(overrides: Partial<HybridGptReview>): HybridGptReview {
  return {
    provider: 'copilot-gpt-5-mini',
    model: 'gpt-5-mini',
    status: 'completed',
    overall_risk: 'low',
    confidence: 'high',
    needs_local_deep_review: false,
    focus_profiles: [],
    findings: [],
    summary: 'Low-risk change.',
    error: null,
    ...overrides,
  };
}

function localReviewResult(input: {
  localMode: Exclude<HybridLocalMode, 'skipped'>;
  requestedProfiles: ReadonlyArray<HybridReviewProfileName>;
}): HybridLocalReviewResult {
  return {
    local_mode: input.localMode,
    requested_profiles: [...input.requestedProfiles],
    report: null,
    error: null,
  };
}
