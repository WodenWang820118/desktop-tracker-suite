import {
  collectRepoCommitCandidates,
  createLocalReviewerDependencies,
  createLocalReviewerEnv,
  DEFAULT_SAMPLE_SEED,
  DEFAULT_SMALL_DIFF_THRESHOLD_CHARS,
  evaluateSampleWithLocalReviewer,
  runHybridGptReview,
  runLocalReviewerReview,
  type EvaluationSample,
  type HybridLocalMode,
  type HybridLocalReviewResult,
  type HybridReviewProfileName,
} from '../../local-reviewer-support.ts';
import { getUsageText, readIntegerFlag, readStringFlag } from '../cli/cli.ts';

// Internal worker commands parse the private argv contract used by spawned Node workers.
export async function runCollectCandidatesWorker(argv: string[]): Promise<void> {
  const dependencies = createLocalReviewerDependencies();
  const parsed = parseCollectCandidatesArgs(argv);
  const payload = collectRepoCommitCandidates({
    dependencies,
    repoName: parsed.repoName,
    repoRoot: parsed.repoRoot,
    seed: parsed.seed,
  });
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function runEvaluateSampleWorker(argv: string[]): Promise<void> {
  const parsed = parseEvaluateSampleArgs(argv);
  const dependencies = createLocalReviewerDependencies();
  const env = createLocalReviewerEnv();
  const payload = evaluateSampleWithLocalReviewer({
    dependencies,
    env,
    sample: JSON.parse(
      Buffer.from(parsed.sampleBase64, 'base64').toString('utf8'),
    ) as EvaluationSample,
    smallDiffThresholdChars: parsed.smallDiffThresholdChars,
    toolRepoRoot: parsed.toolRepoRoot,
  });
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function runHybridGptWorker(argv: string[]): Promise<void> {
  const parsed = parseHybridGptWorkerArgs(argv);
  const payload = runHybridGptReview({
    changedFiles: JSON.parse(
      Buffer.from(parsed.changedFilesBase64, 'base64').toString('utf8'),
    ) as string[],
    diffText: Buffer.from(parsed.diffBase64, 'base64').toString('utf8'),
    repoRoot: process.cwd(),
  });
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function runHybridLocalWorker(argv: string[]): Promise<void> {
  const parsed = parseHybridLocalWorkerArgs(argv);
  const dependencies = createLocalReviewerDependencies();
  const env = createLocalReviewerEnv();
  const requestedProfiles = parseRequestedProfiles(parsed.requestedProfiles);

  try {
    const report = runLocalReviewerReview({
      dependencies,
      env,
      requestedProfiles,
      staged: true,
      targetRepoRoot: process.cwd(),
      toolRepoRoot: parsed.toolRepoRoot,
    });
    const payload: HybridLocalReviewResult = {
      local_mode: parsed.localMode,
      requested_profiles: requestedProfiles,
      report,
      error: null,
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } catch (error) {
    const payload: HybridLocalReviewResult = {
      local_mode: parsed.localMode,
      requested_profiles: requestedProfiles,
      report: null,
      error: error instanceof Error ? error.message : String(error),
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
}

export function parseCollectCandidatesArgs(argv: string[]): {
  repoName: string;
  repoRoot: string;
  seed: number;
} {
  const parsed = {
    repoName: '',
    repoRoot: '',
    seed: DEFAULT_SAMPLE_SEED,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--repo-name') {
      parsed.repoName = readStringFlag(argv, index, current);
      index += 1;
      continue;
    }
    if (current === '--repo-root') {
      parsed.repoRoot = readStringFlag(argv, index, current);
      index += 1;
      continue;
    }
    if (current === '--seed') {
      parsed.seed = readIntegerFlag(argv, index, current);
      index += 1;
      continue;
    }

    throw new Error(`Unknown internal worker flag: ${current}`);
  }

  if (!parsed.repoName || !parsed.repoRoot) {
    throw new Error('Missing required internal repo candidate worker args.');
  }

  return parsed;
}

export function parseEvaluateSampleArgs(argv: string[]): {
  sampleBase64: string;
  smallDiffThresholdChars: number;
  toolRepoRoot: string;
} {
  const parsed = {
    sampleBase64: '',
    smallDiffThresholdChars: DEFAULT_SMALL_DIFF_THRESHOLD_CHARS,
    toolRepoRoot: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--sample-base64') {
      parsed.sampleBase64 = readStringFlag(argv, index, current);
      index += 1;
      continue;
    }
    if (current === '--small-diff-threshold-chars') {
      parsed.smallDiffThresholdChars = readIntegerFlag(argv, index, current);
      index += 1;
      continue;
    }
    if (current === '--tool-repo-root') {
      parsed.toolRepoRoot = readStringFlag(argv, index, current);
      index += 1;
      continue;
    }

    throw new Error(`Unknown internal worker flag: ${current}`);
  }

  if (!parsed.sampleBase64 || !parsed.toolRepoRoot) {
    throw new Error('Missing required internal sample worker args.');
  }

  return parsed;
}

export function parseHybridGptWorkerArgs(argv: string[]): {
  changedFilesBase64: string;
  diffBase64: string;
} {
  const parsed = {
    changedFilesBase64: '',
    diffBase64: '',
  };
  let sawChangedFilesBase64 = false;
  let sawDiffBase64 = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--changed-files-base64') {
      parsed.changedFilesBase64 = readPossiblyEmptyStringFlag(
        argv,
        index,
        current,
      );
      sawChangedFilesBase64 = true;
      index += 1;
      continue;
    }
    if (current === '--diff-base64') {
      parsed.diffBase64 = readPossiblyEmptyStringFlag(argv, index, current);
      sawDiffBase64 = true;
      index += 1;
      continue;
    }

    throw new Error(`Unknown internal hybrid GPT worker flag: ${current}`);
  }

  if (!sawChangedFilesBase64 || !sawDiffBase64) {
    throw new Error('Missing required hybrid GPT worker args.');
  }

  return parsed;
}

export function parseHybridLocalWorkerArgs(argv: string[]): {
  localMode: Exclude<HybridLocalMode, 'skipped'>;
  requestedProfiles: string;
  toolRepoRoot: string;
} {
  const parsed = {
    localMode: 'full' as Exclude<HybridLocalMode, 'skipped'>,
    requestedProfiles: '',
    toolRepoRoot: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--local-mode') {
      const rawValue = readStringFlag(argv, index, current);
      if (rawValue !== 'full' && rawValue !== 'targeted') {
        throw new Error(`Unsupported hybrid local mode: ${rawValue}`);
      }
      parsed.localMode = rawValue;
      index += 1;
      continue;
    }
    if (current === '--requested-profiles') {
      parsed.requestedProfiles = readStringFlag(argv, index, current);
      index += 1;
      continue;
    }
    if (current === '--tool-repo-root') {
      parsed.toolRepoRoot = readStringFlag(argv, index, current);
      index += 1;
      continue;
    }

    throw new Error(`Unknown internal hybrid local worker flag: ${current}`);
  }

  if (!parsed.toolRepoRoot) {
    throw new Error('Missing required hybrid local worker args.');
  }

  return parsed;
}

export function parseRequestedProfiles(
  requestedProfiles: string,
): HybridReviewProfileName[] {
  const values = requestedProfiles
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.filter(
    (entry): entry is HybridReviewProfileName =>
      entry === 'angular' ||
      entry === 'nest' ||
      entry === 'typescript' ||
      entry === 'repo-habits' ||
      entry === 'general',
  );
}

function readPossiblyEmptyStringFlag(
  argv: string[],
  index: number,
  flag: string,
): string {
  if (index + 1 >= argv.length) {
    throw new Error(`${getUsageText()}\n\nMissing value for ${flag}.`);
  }

  return argv[index + 1] ?? '';
}
