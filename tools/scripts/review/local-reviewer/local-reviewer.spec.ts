import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNodeWorkerArgs,
  getUsageText,
  main,
  parseCliArgs,
  writePrefilterOutput,
  type ParsedLocalReviewerCliArgs,
} from '../local-reviewer.ts';

test('parseCliArgs keeps estimate-only defaults for evaluate', () => {
  const parsed = parseCliArgs(['evaluate']);

  assert.equal(parsed.abSamples, 0);
  assert.equal(parsed.command, 'evaluate');
  assert.equal(parsed.jobs > 0, true);
  assert.deepEqual(parsed.repos, []);
  assert.equal(parsed.rounds, 32);
  assert.equal(parsed.seed, 20260419);
  assert.equal(parsed.smallDiffThresholdChars, 1024);
});

test('parseCliArgs reads repeated repo flags and numeric overrides', () => {
  const parsed = parseCliArgs([
    'evaluate',
    '--rounds',
    '40',
    '--seed',
    '7',
    '--small-diff-threshold-chars',
    '2048',
    '--ab-samples',
    '4',
    '--jobs',
    '3',
    '--repo',
    'gx.go',
    '--repo',
    '../local-reviewer-cli',
  ]);

  assert.deepEqual(parsed, {
    abSamples: 4,
    command: 'evaluate',
    jobs: 3,
    repos: ['gx.go', '../local-reviewer-cli'],
    rounds: 40,
    seed: 7,
    smallDiffThresholdChars: 2048,
  } satisfies ParsedLocalReviewerCliArgs);
});

test('getUsageText stays path-agnostic', () => {
  const usage = getUsageText();

  assert.doesNotMatch(usage, /scripts[\\/]/i);
  assert.doesNotMatch(usage, /--experimental-strip-types/);
  assert.match(usage, /local-reviewer\.ts/);
});

test('buildNodeWorkerArgs omits the strip-types flag', () => {
  const args = buildNodeWorkerArgs('tools/scripts/review/local-reviewer.ts', [
    'evaluate',
    '--json',
  ]);

  assert.deepEqual(args, [
    'tools/scripts/review/local-reviewer.ts',
    'evaluate',
    '--json',
  ]);
  assert.doesNotMatch(args.join(' '), /--experimental-strip-types/);
});

test('writePrefilterOutput includes hybrid additive fields without breaking key=value output', () => {
  const writes: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(
      typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'),
    );
    return true;
  }) as typeof process.stdout.write;

  try {
    writePrefilterOutput({
      artifacts: {
        contextPath: '/repo/context.md',
        reportPath: '/repo/report.json',
        reviewContextPath: '/repo/review.md',
      },
      decisionBasis: 'gpt+local',
      gptConfidence: 'medium',
      gptProvider: 'copilot-gpt-5-mini',
      gptRisk: 'low',
      localMode: 'targeted',
      payload: {
        recommended_escalation: false,
      },
      recommendedEscalation: false,
      requestedProfiles: ['typescript'],
      reviewContextMode: 'prefilter-summary',
      smallDiffThresholdChars: 1024,
    });
  } finally {
    process.stdout.write = originalWrite;
  }

  const output = writes.join('');
  assert.match(output, /^recommended_escalation=false/m);
  assert.match(output, /^report_path=\/repo\/report\.json$/m);
  assert.match(output, /^context_path=\/repo\/context\.md$/m);
  assert.match(output, /^review_context_path=\/repo\/review\.md$/m);
  assert.match(output, /^review_context_mode=prefilter-summary$/m);
  assert.match(output, /^gpt_provider=copilot-gpt-5-mini$/m);
  assert.match(output, /^gpt_risk=low$/m);
  assert.match(output, /^gpt_confidence=medium$/m);
  assert.match(output, /^local_mode=targeted$/m);
  assert.match(output, /^requested_profiles=typescript$/m);
  assert.match(output, /^decision_basis=gpt\+local$/m);
  assert.match(output, /^small_diff_threshold_chars=1024$/m);
  assert.match(output, /"recommended_escalation": false/);
});

test('main dispatches internal worker commands with argv payloads', async () => {
  const calls: string[] = [];
  const handlers = {
    runCollectCandidatesWorker: async (argv: string[]) => {
      calls.push(`collect:${argv.join('|')}`);
    },
    runEvaluateSampleWorker: async (argv: string[]) => {
      calls.push(`evaluate:${argv.join('|')}`);
    },
    runHybridGptWorker: async (argv: string[]) => {
      calls.push(`gpt:${argv.join('|')}`);
    },
    runHybridLocalWorker: async (argv: string[]) => {
      calls.push(`local:${argv.join('|')}`);
    },
  };

  await main(['__collect-candidates', '--repo-name', 'gx.go'], handlers);
  await main(['__evaluate-sample', '--sample-base64', 'abc'], handlers);
  await main(['__hybrid-gpt-review', '--diff-base64', 'xyz'], handlers);
  await main(['__hybrid-local-review', '--local-mode', 'full'], handlers);

  assert.deepEqual(calls, [
    'collect:--repo-name|gx.go',
    'evaluate:--sample-base64|abc',
    'gpt:--diff-base64|xyz',
    'local:--local-mode|full',
  ]);
});
