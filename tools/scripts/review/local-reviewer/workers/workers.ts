import { spawn } from 'node:child_process';

import {
  selectEvaluationSamples,
  type EvaluationLocalResult,
  type EvaluationRepoTarget,
  type EvaluationSample,
  type HybridGptReview,
  type HybridLocalMode,
  type HybridLocalReviewResult,
  type HybridReviewProfileName,
  type LocalReviewerDependencies,
} from '../../local-reviewer-support.ts';

export type JsonWorkerRunner = <T>(input: {
  args: string[];
  cwd: string;
  scriptPath: string;
}) => Promise<T>;

export interface RunJsonWorkerDependencies {
  runNodeWorker: (input: {
    args: string[];
    cwd: string;
  }) => Promise<{ stderr: string; stdout: string }>;
}

// Worker helpers isolate child Node process management from CLI orchestration.
export async function runHybridGptWorkerProcess(input: {
  changedFiles: ReadonlyArray<string>;
  diffText: string;
  repoRoot: string;
  scriptPath: string;
}): Promise<HybridGptReview> {
  return runJsonWorker<HybridGptReview>({
    args: [
      '__hybrid-gpt-review',
      '--changed-files-base64',
      Buffer.from(JSON.stringify(input.changedFiles), 'utf8').toString(
        'base64',
      ),
      '--diff-base64',
      Buffer.from(input.diffText, 'utf8').toString('base64'),
    ],
    cwd: input.repoRoot,
    scriptPath: input.scriptPath,
  });
}

export async function runHybridLocalWorkerProcess(input: {
  localMode: Exclude<HybridLocalMode, 'skipped'>;
  repoRoot: string;
  requestedProfiles: ReadonlyArray<HybridReviewProfileName>;
  scriptPath: string;
  toolRepoRoot: string;
}): Promise<HybridLocalReviewResult> {
  return runJsonWorker<HybridLocalReviewResult>({
    args: [
      '__hybrid-local-review',
      '--local-mode',
      input.localMode,
      '--requested-profiles',
      input.requestedProfiles.join(','),
      '--tool-repo-root',
      input.toolRepoRoot,
    ],
    cwd: input.repoRoot,
    scriptPath: input.scriptPath,
  });
}

export async function collectEvaluationSamplesInParallel(
  input: {
    dependencies: LocalReviewerDependencies;
    jobs: number;
    repoTargets: ReadonlyArray<EvaluationRepoTarget>;
    rounds: number;
    scriptPath: string;
    seed: number;
  },
  runWorker: JsonWorkerRunner = runJsonWorker,
): Promise<EvaluationSample[]> {
  const candidates = (
    await mapLimit(input.repoTargets, input.jobs, (repoTarget, index) =>
      runWorker<EvaluationSample[]>({
        args: [
          '__collect-candidates',
          '--repo-name',
          repoTarget.name,
          '--repo-root',
          repoTarget.root,
          '--seed',
          String(input.seed + index + 1),
        ],
        cwd: process.cwd(),
        scriptPath: input.scriptPath,
      }),
    )
  ).flat();

  return selectEvaluationSamples({
    candidates,
    rounds: input.rounds,
    seed: input.seed,
  });
}

export async function evaluateSamplesInParallel(
  input: {
    jobs: number;
    samples: ReadonlyArray<EvaluationSample>;
    scriptPath: string;
    smallDiffThresholdChars: number;
    toolRepoRoot: string;
  },
  runWorker: JsonWorkerRunner = runJsonWorker,
): Promise<EvaluationLocalResult[]> {
  return mapLimit(input.samples, input.jobs, (sample) =>
    runWorker<EvaluationLocalResult>({
      args: [
        '__evaluate-sample',
        '--sample-base64',
        Buffer.from(JSON.stringify(sample), 'utf8').toString('base64'),
        '--small-diff-threshold-chars',
        String(input.smallDiffThresholdChars),
        '--tool-repo-root',
        input.toolRepoRoot,
      ],
      cwd: process.cwd(),
      scriptPath: input.scriptPath,
    }),
  );
}

export async function runJsonWorker<T>(
  input: {
    args: string[];
    cwd: string;
    scriptPath: string;
  },
  dependencies: RunJsonWorkerDependencies = { runNodeWorker },
): Promise<T> {
  const result = await dependencies.runNodeWorker({
    args: buildNodeWorkerArgs(input.scriptPath, input.args),
    cwd: input.cwd,
  });

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(
      `Worker returned non-JSON output: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function buildNodeWorkerArgs(
  scriptPath: string,
  args: string[],
): string[] {
  return [scriptPath, ...args];
}

async function runNodeWorker(input: {
  args: string[];
  cwd: string;
}): Promise<{ stderr: string; stdout: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn('node', input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolveResult({
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        });
        return;
      }

      reject(
        new Error(
          stderr.trim() || stdout.trim() || `Worker exited with code ${code}.`,
        ),
      );
    });
  });
}

export async function mapLimit<TItem, TResult>(
  items: ReadonlyArray<TItem>,
  limit: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(
          items[currentIndex]!,
          currentIndex,
        );
      }
    }),
  );

  return results;
}
