import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeJobs,
  parseCliArgs,
  writePrefilterOutput,
} from './cli.ts';

test('parseCliArgs accepts every public command', () => {
  assert.equal(parseCliArgs(['doctor']).command, 'doctor');
  assert.equal(parseCliArgs(['staged']).command, 'staged');
  assert.equal(parseCliArgs(['prefilter']).command, 'prefilter');
  assert.equal(parseCliArgs(['evaluate']).command, 'evaluate');
});

test('parseCliArgs reports user-facing command and flag errors', () => {
  assert.throws(() => parseCliArgs(['unknown']), /Usage:/);
  assert.throws(
    () => parseCliArgs(['evaluate', '--bogus']),
    /Unknown flag: --bogus/,
  );
  assert.throws(
    () => parseCliArgs(['evaluate', '--rounds']),
    /Missing value for --rounds/,
  );
  assert.throws(
    () => parseCliArgs(['evaluate', '--rounds', '-5']),
    /--rounds requires a non-negative integer/,
  );
  assert.throws(
    () => parseCliArgs(['evaluate', '--rounds', '5abc']),
    /--rounds requires a non-negative integer/,
  );
  assert.throws(
    () => parseCliArgs(['evaluate', '--repo']),
    /Missing value for --repo/,
  );
});

test('normalizeJobs clamps non-positive values to one', () => {
  assert.equal(normalizeJobs(0), 1);
  assert.equal(normalizeJobs(-1), 1);
  assert.equal(normalizeJobs(Number.NaN), 1);
  assert.equal(normalizeJobs(4), 4);
});

test('writePrefilterOutput includes all key-value fields and unknown GPT fallbacks', () => {
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
      decisionBasis: 'local-fallback',
      gptConfidence: null,
      gptProvider: 'copilot-gpt-5-mini',
      gptRisk: null,
      localMode: 'full',
      payload: {
        recommended_escalation: true,
      },
      recommendedEscalation: true,
      requestedProfiles: [],
      reviewContextMode: 'full-diff',
      smallDiffThresholdChars: 2048,
    });
  } finally {
    process.stdout.write = originalWrite;
  }

  const output = writes.join('');
  assert.match(output, /^recommended_escalation=true$/m);
  assert.match(output, /^report_path=\/repo\/report\.json$/m);
  assert.match(output, /^context_path=\/repo\/context\.md$/m);
  assert.match(output, /^review_context_path=\/repo\/review\.md$/m);
  assert.match(output, /^review_context_mode=full-diff$/m);
  assert.match(output, /^gpt_provider=copilot-gpt-5-mini$/m);
  assert.match(output, /^gpt_risk=unknown$/m);
  assert.match(output, /^gpt_confidence=unknown$/m);
  assert.match(output, /^local_mode=full$/m);
  assert.match(output, /^requested_profiles=none$/m);
  assert.match(output, /^decision_basis=local-fallback$/m);
  assert.match(output, /^small_diff_threshold_chars=2048$/m);
  assert.match(output, /"recommended_escalation": true/);
});

test('writePrefilterOutput joins multiple requested profiles with commas', () => {
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
      gptRisk: 'medium',
      localMode: 'targeted',
      payload: {},
      recommendedEscalation: false,
      requestedProfiles: ['typescript', 'angular'],
      reviewContextMode: 'prefilter-summary',
      smallDiffThresholdChars: 1024,
    });
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.match(writes.join(''), /^requested_profiles=typescript,angular$/m);
});
