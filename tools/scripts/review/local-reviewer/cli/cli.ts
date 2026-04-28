import { availableParallelism, cpus } from 'node:os';
import { basename } from 'node:path';

import {
  DEFAULT_EVALUATION_AB_SAMPLE_COUNT,
  DEFAULT_EVALUATION_ROUNDS,
  DEFAULT_SAMPLE_SEED,
  DEFAULT_SMALL_DIFF_THRESHOLD_CHARS,
  type HybridDecisionBasis,
  type HybridGptReview,
  type HybridLocalMode,
  type HybridReviewProfileName,
} from '../../local-reviewer-support.ts';

// CLI helpers own user-facing flags and key=value prefilter output formatting.
export type LocalReviewerCommand = 'doctor' | 'evaluate' | 'prefilter' | 'staged';

export interface ParsedLocalReviewerCliArgs {
  abSamples: number;
  command: LocalReviewerCommand;
  jobs: number;
  repos: string[];
  rounds: number;
  seed: number;
  smallDiffThresholdChars: number;
}

export function parseCliArgs(
  argv: string[] = process.argv.slice(2),
): ParsedLocalReviewerCliArgs {
  const command = parseCommand(argv[0]);
  const parsed: ParsedLocalReviewerCliArgs = {
    abSamples: DEFAULT_EVALUATION_AB_SAMPLE_COUNT,
    command,
    jobs: getDefaultEvaluationJobs(),
    repos: [],
    rounds: DEFAULT_EVALUATION_ROUNDS,
    seed: DEFAULT_SAMPLE_SEED,
    smallDiffThresholdChars: DEFAULT_SMALL_DIFF_THRESHOLD_CHARS,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--rounds') {
      parsed.rounds = readIntegerFlag(argv, index, current);
      index += 1;
      continue;
    }

    if (current === '--seed') {
      parsed.seed = readIntegerFlag(argv, index, current);
      index += 1;
      continue;
    }

    if (current === '--small-diff-threshold-chars') {
      parsed.smallDiffThresholdChars = readIntegerFlag(argv, index, current);
      index += 1;
      continue;
    }

    if (current === '--ab-samples') {
      parsed.abSamples = readIntegerFlag(argv, index, current);
      index += 1;
      continue;
    }

    if (current === '--jobs') {
      parsed.jobs = readIntegerFlag(argv, index, current);
      index += 1;
      continue;
    }

    if (current === '--repo') {
      parsed.repos.push(readStringFlag(argv, index, current));
      index += 1;
      continue;
    }

    throw new Error(`${getUsageText()}\n\nUnknown flag: ${current}`);
  }

  return parsed;
}

export function getUsageText(scriptName = 'local-reviewer.ts'): string {
  return [
    `Usage: node ${scriptName} <doctor|staged|prefilter|evaluate> [options]`,
    '',
    'Options:',
    `  --small-diff-threshold-chars <n>  Override the small diff cutoff (default: ${DEFAULT_SMALL_DIFF_THRESHOLD_CHARS})`,
    `  --rounds <n>                      Evaluation rounds for \`evaluate\` (default: ${DEFAULT_EVALUATION_ROUNDS})`,
    `  --seed <n>                        Deterministic sample seed for \`evaluate\` (default: ${DEFAULT_SAMPLE_SEED})`,
    `  --ab-samples <n>                  Optional paid-review A/B sample count for \`evaluate\` (default: ${DEFAULT_EVALUATION_AB_SAMPLE_COUNT})`,
    `  --jobs <n>                        Local parallel worker count for \`evaluate\` (default: ${getDefaultEvaluationJobs()})`,
    '  --repo <path-or-name>             Additional evaluation repo target; repeatable',
  ].join('\n');
}

export function writePrefilterOutput(input: {
  artifacts: {
    contextPath: string;
    reportPath: string;
    reviewContextPath: string;
  };
  decisionBasis: HybridDecisionBasis;
  gptConfidence: HybridGptReview['confidence'];
  gptProvider: HybridGptReview['provider'];
  gptRisk: HybridGptReview['overall_risk'];
  localMode: HybridLocalMode;
  payload: Record<string, unknown>;
  recommendedEscalation: boolean;
  requestedProfiles: ReadonlyArray<HybridReviewProfileName>;
  reviewContextMode: string;
  smallDiffThresholdChars: number;
}): void {
  process.stdout.write(
    [
      `recommended_escalation=${String(input.recommendedEscalation)}`,
      `report_path=${input.artifacts.reportPath}`,
      `context_path=${input.artifacts.contextPath}`,
      `review_context_path=${input.artifacts.reviewContextPath}`,
      `review_context_mode=${input.reviewContextMode}`,
      `gpt_provider=${input.gptProvider}`,
      `gpt_risk=${input.gptRisk ?? 'unknown'}`,
      `gpt_confidence=${input.gptConfidence ?? 'unknown'}`,
      `local_mode=${input.localMode}`,
      `requested_profiles=${
        input.requestedProfiles.length > 0
          ? input.requestedProfiles.join(',')
          : 'none'
      }`,
      `decision_basis=${input.decisionBasis}`,
      `small_diff_threshold_chars=${input.smallDiffThresholdChars}`,
      '',
      JSON.stringify(input.payload, null, 2),
    ].join('\n'),
  );
  process.stdout.write('\n');
}

export function parseCommand(rawValue?: string): LocalReviewerCommand {
  if (
    rawValue === 'doctor' ||
    rawValue === 'staged' ||
    rawValue === 'prefilter' ||
    rawValue === 'evaluate'
  ) {
    return rawValue;
  }

  throw new Error(getUsageText(resolveUsageScriptName()));
}

export function readIntegerFlag(argv: string[], index: number, flag: string): number {
  const rawValue = argv[index + 1];
  if (!rawValue) {
    throw new Error(`${getUsageText()}\n\nMissing value for ${flag}.`);
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${flag} requires a non-negative integer.`);
  }

  return Number.parseInt(rawValue, 10);
}

export function readStringFlag(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${getUsageText()}\n\nMissing value for ${flag}.`);
  }

  return value;
}

function resolveUsageScriptName(): string {
  return basename(process.argv[1] ?? 'local-reviewer.ts');
}

function getDefaultEvaluationJobs(): number {
  try {
    return Math.max(1, Math.min(4, availableParallelism()));
  } catch {
    return Math.max(1, Math.min(4, cpus().length || 1));
  }
}

export function normalizeJobs(jobs: number): number {
  return Number.isFinite(jobs) ? Math.max(1, jobs) : 1;
}
