import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNodeWorkerArgs,
  collectEvaluationSamplesInParallel,
  evaluateSamplesInParallel,
  mapLimit,
  runJsonWorker,
  type JsonWorkerRunner,
} from './workers.ts';
import type {
  EvaluationLocalResult,
  EvaluationSample,
  LocalReviewerDependencies,
} from '../../local-reviewer-support.ts';

test('buildNodeWorkerArgs prepends the script path to worker args', () => {
  assert.deepEqual(
    buildNodeWorkerArgs('tools/scripts/review/local-reviewer.ts', [
      '__collect-candidates',
    ]),
    ['tools/scripts/review/local-reviewer.ts', '__collect-candidates'],
  );
});

test('runJsonWorker parses worker JSON and reports invalid JSON', async () => {
  const parsed = await runJsonWorker<{ ok: boolean }>(
    {
      args: ['__worker'],
      cwd: '/repo',
      scriptPath: 'worker.ts',
    },
    {
      async runNodeWorker(input) {
        assert.deepEqual(input.args, ['worker.ts', '__worker']);
        assert.equal(input.cwd, '/repo');
        return { stderr: '', stdout: '{"ok":true}' };
      },
    },
  );

  assert.deepEqual(parsed, { ok: true });
  await assert.rejects(
    () =>
      runJsonWorker(
        {
          args: ['__worker'],
          cwd: '/repo',
          scriptPath: 'worker.ts',
        },
        {
          async runNodeWorker() {
            return { stderr: '', stdout: 'not json' };
          },
        },
      ),
    /Worker returned non-JSON output/,
  );
});

test('mapLimit preserves order and handles empty work', async () => {
  assert.deepEqual(await mapLimit([], 3, async (value) => value), []);
  assert.deepEqual(
    await mapLimit([1, 2, 3], 1, async (value) => value * 2),
    [2, 4, 6],
  );
  assert.deepEqual(
    await mapLimit([1, 2], 10, async (value, index) => `${index}:${value}`),
    ['0:1', '1:2'],
  );
});

test('collectEvaluationSamplesInParallel calls candidate workers and selects samples', async () => {
  const calls: string[][] = [];
  const sample = evaluationSample('a');
  const runWorker: JsonWorkerRunner = async <T>(input: {
    args: string[];
    cwd: string;
    scriptPath: string;
  }): Promise<T> => {
    calls.push(input.args);
    return [sample] as T;
  };

  const output = await collectEvaluationSamplesInParallel(
    {
      dependencies: dependencies(),
      jobs: 2,
      repoTargets: [{ name: 'repo-a', root: '/repo-a' }],
      rounds: 1,
      scriptPath: 'tools/scripts/review/local-reviewer.ts',
      seed: 10,
    },
    runWorker,
  );

  assert.deepEqual(output, [sample]);
  assert.deepEqual(calls[0], [
    '__collect-candidates',
    '--repo-name',
    'repo-a',
    '--repo-root',
    '/repo-a',
    '--seed',
    '11',
  ]);
});

test('evaluateSamplesInParallel sends serialized samples to worker processes', async () => {
  const calls: string[][] = [];
  const result = localResult(evaluationSample('a'));
  const runWorker: JsonWorkerRunner = async <T>(input: {
    args: string[];
    cwd: string;
    scriptPath: string;
  }): Promise<T> => {
    calls.push(input.args);
    return result as T;
  };

  const output = await evaluateSamplesInParallel(
    {
      jobs: 1,
      samples: [evaluationSample('a')],
      scriptPath: 'tools/scripts/review/local-reviewer.ts',
      smallDiffThresholdChars: 2048,
      toolRepoRoot: '/tool-repo',
    },
    runWorker,
  );

  assert.deepEqual(output, [result]);
  assert.equal(calls[0]?.[0], '__evaluate-sample');
  assert.equal(calls[0]?.[3], '--small-diff-threshold-chars');
  assert.equal(calls[0]?.[4], '2048');
  assert.equal(calls[0]?.[6], '/tool-repo');
});

function evaluationSample(commit: string): EvaluationSample {
  return {
    baseRef: 'base',
    commit,
    committedAtEpoch: 1,
    fileCount: 1,
    kind: 'small-ts',
    repoName: 'repo-a',
    repoRoot: '/repo-a',
    subject: `sample ${commit}`,
    totalChangedLines: 10,
  };
}

function localResult(sample: EvaluationSample): EvaluationLocalResult {
  return {
    durationMs: 1,
    diffLength: 10,
    findingsCount: 0,
    jsonParseable: true,
    paidReviewContextLength: 0,
    prefilterContextLength: 0,
    recommendedEscalation: false,
    escalationReasons: [],
    reviewContextLength: 10,
    reviewContextMode: 'full-diff',
    sample,
    success: true,
    summaryLength: 0,
  };
}

function dependencies(): LocalReviewerDependencies {
  return {
    now: () => new Date(0),
    runProcess() {
      throw new Error('not used');
    },
  };
}
