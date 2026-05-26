import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { probeGeminiCliHealth, runGeminiReview } from './gemini.ts';

test('probeGeminiCliHealth records health-version and health-probe observations with checkpoint telemetry', async () => {
  const recorded: Array<Record<string, unknown>> = [];
  const repoRoot = mkdtempSync(join(tmpdir(), 'gemini-provider-health-'));

  try {
    const health = await probeGeminiCliHealth(
      {
        model: 'gemini-3.5-flash-high',
        repoRoot,
        telemetryContext: {
          callsite: 'checkpoint-review',
          checkpoint: 'test',
        },
      },
      {
        acquireLock: async () => () => undefined,
        loadRateLimitState: () => ({ models: {} }),
        recordObservation(observation) {
          recorded.push(observation as unknown as Record<string, unknown>);
          return observation;
        },
        recordRequestStart() {
          return undefined;
        },
        runCommand: (input) => {
          if (input.args[0] === '--version') {
            return { status: 0, stdout: '1.0.0', stderr: '' };
          }

          return { status: 0, stdout: 'OK.', stderr: '' };
        },
        sleep: async () => undefined,
      },
    );

    assert.equal(health.available, true);
    assert.equal(recorded.length, 2);
    assert.equal(recorded[0]?.operation, 'health-version');
    assert.equal(recorded[1]?.operation, 'health-probe');
    assert.equal(recorded[1]?.checkpoint, 'test');
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test('runGeminiReview records a successful first attempt with wait-before-start metadata', async () => {
  const recorded: Array<Record<string, unknown>> = [];

  const review = await runGeminiReview(
    {
      model: 'gemini-3.5-flash-high',
      prompt: 'Review this diff.',
      repoRoot: 'C:/repo',
      telemetryContext: {
        callsite: 'checkpoint-review',
        checkpoint: 'implementation',
      },
    },
    {
      acquireLock: async () => () => undefined,
      getInterRequestDelay: () => 1_500,
      loadRateLimitState: () => ({ models: {} }),
      recordObservation(observation) {
        recorded.push(observation as unknown as Record<string, unknown>);
        return observation;
      },
      recordRequestStart() {
        return undefined;
      },
      runCommand: () => ({
        error: undefined,
        status: 0,
        stderr: '',
        stdout: 'Reviewed.',
      }),
      sleep: async () => undefined,
    },
  );

  assert.equal(review, 'Reviewed.');
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.operation, 'review-attempt');
  assert.equal(recorded[0]?.attempt, 0);
  assert.equal(recorded[0]?.waitBeforeStartMs, 1_500);
  assert.equal(recorded[0]?.success, true);
});

test('runGeminiReview wraps prompts with the selected reviewer profile', async () => {
  const recorded: Array<Record<string, unknown>> = [];
  const repoRoot = mkdtempSync(join(tmpdir(), 'gemini-reviewer-profile-'));
  let capturedInput = '';

  try {
    mkdirSync(join(repoRoot, '.github', 'agents'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.github', 'agents', 'test-reviewer.agent.md'),
      ['---', 'name: test-reviewer', '---', '', 'Test profile text.'].join(
        '\n',
      ),
    );

    const review = await runGeminiReview(
      {
        checkpoint: 'test',
        focus: 'tests',
        model: 'gemini-3.5-flash-high',
        prompt: 'Original test context.',
        repoRoot,
      },
      {
        acquireLock: async () => () => undefined,
        getInterRequestDelay: () => 0,
        loadRateLimitState: () => ({ models: {} }),
        recordObservation(observation) {
          recorded.push(observation as unknown as Record<string, unknown>);
          return observation;
        },
        recordRequestStart() {
          return undefined;
        },
        runCommand: (input) => {
          capturedInput = input.input ?? input.args.at(-1) ?? '';
          return {
            error: undefined,
            status: 0,
            stderr: '',
            stdout: 'Reviewed.',
          };
        },
        sleep: async () => undefined,
      },
    );

    assert.equal(review, 'Reviewed.');
    assert.match(
      capturedInput,
      /Use the gemini reviewer specialist lens: test-reviewer/,
    );
    assert.match(capturedInput, /Test profile text\./);
    assert.match(capturedInput, /Original test context\./);
    assert.equal(recorded[0]?.promptChars, capturedInput.length);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test('runGeminiReview records capacity-triggered retries with retry delay metadata', async () => {
  const recorded: Array<Record<string, unknown>> = [];
  let attempt = 0;

  const review = await runGeminiReview(
    {
      model: 'gemini-3.5-flash-high',
      prompt: 'Review this diff.',
      repoRoot: 'C:/repo',
      telemetryContext: {
        callsite: 'checkpoint-review',
        checkpoint: 'implementation',
      },
    },
    {
      acquireLock: async () => () => undefined,
      getInterRequestDelay: () => 0,
      getRetryDelay: () => 20_000,
      loadRateLimitState: () => ({ models: {} }),
      recordObservation(observation) {
        recorded.push(observation as unknown as Record<string, unknown>);
        return observation;
      },
      recordRequestStart() {
        return undefined;
      },
      runCommand: () => {
        attempt += 1;
        return attempt === 1
          ? {
              error: undefined,
              status: 1,
              stderr: '429 MODEL_CAPACITY_EXHAUSTED',
              stdout: '',
            }
          : {
              error: undefined,
              status: 0,
              stderr: '',
              stdout: 'Reviewed.',
            };
      },
      sleep: async () => undefined,
    },
  );

  assert.equal(review, 'Reviewed.');
  assert.equal(recorded.length, 2);
  assert.equal(recorded[0]?.capacityError, true);
  assert.equal(recorded[0]?.retryDelayMs, 20_000);
  assert.equal(recorded[1]?.success, true);
  assert.equal(recorded[0]?.sessionId, recorded[1]?.sessionId);
});

test('runGeminiReview records timeout retries before succeeding', async () => {
  const previous = process.env.GX_LAW_PREP_REVIEW_GOOGLE_CLI;
  process.env.GX_LAW_PREP_REVIEW_GOOGLE_CLI = 'gemini';
  const recorded: Array<Record<string, unknown>> = [];
  let attempt = 0;
  const timeoutError = new Error('timed out');
  timeoutError.name = 'TimeoutError';

  try {
    const review = await runGeminiReview(
      {
        model: 'gemini-3.5-flash-high',
        prompt: 'Review this diff.',
        repoRoot: 'C:/repo',
      },
      {
        acquireLock: async () => () => undefined,
        getInterRequestDelay: () => 0,
        getRetryDelay: () => 35_000,
        loadRateLimitState: () => ({ models: {} }),
        recordObservation(observation) {
          recorded.push(observation as unknown as Record<string, unknown>);
          return observation;
        },
        recordRequestStart() {
          return undefined;
        },
        runCommand: () => {
          attempt += 1;
          return attempt === 1
            ? {
                error: timeoutError,
                signal: 'SIGTERM',
                status: null,
                stderr: '',
                stdout: '',
              }
            : {
                error: undefined,
                status: 0,
                stderr: '',
                stdout: 'Reviewed.',
              };
        },
        sleep: async () => undefined,
      },
    );

    assert.equal(review, 'Reviewed.');
    assert.equal(recorded.length, 2);
    assert.equal(recorded[0]?.timedOut, true);
    assert.equal(recorded[0]?.retryDelayMs, 35_000);
    assert.equal(recorded[1]?.success, true);
  } finally {
    if (previous === undefined) {
      delete process.env.GX_LAW_PREP_REVIEW_GOOGLE_CLI;
    } else {
      process.env.GX_LAW_PREP_REVIEW_GOOGLE_CLI = previous;
    }
  }
});

test('runGeminiReview does not mark successful timeout-themed output as a timeout', async () => {
  const recorded: Array<Record<string, unknown>> = [];

  const review = await runGeminiReview(
    {
      model: 'gemini-3.5-flash-high',
      prompt: 'Review timeout handling.',
      repoRoot: 'C:/repo',
    },
    {
      acquireLock: async () => () => undefined,
      getInterRequestDelay: () => 0,
      loadRateLimitState: () => ({ models: {} }),
      recordObservation(observation) {
        recorded.push(observation as unknown as Record<string, unknown>);
        return observation;
      },
      recordRequestStart() {
        return undefined;
      },
      runCommand: () => ({
        error: undefined,
        status: 0,
        stderr: '',
        stdout: 'Timeout handling review completed successfully.',
      }),
      sleep: async () => undefined,
    },
  );

  assert.equal(review, 'Timeout handling review completed successfully.');
  assert.equal(recorded[0]?.timedOut, false);
});
