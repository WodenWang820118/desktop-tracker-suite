import {
  analyzeHybridHeuristics,
  buildHybridReviewReport,
  createHybridGptBypassReview,
  MAX_HYBRID_GPT_DIFF_CHARS,
  planHybridLocalReview,
  type HybridReviewReport,
} from '../../local-reviewer-support.ts';
import { runHybridGptWorkerProcess, runHybridLocalWorkerProcess } from '../workers/workers.ts';

export interface HybridStagedWorkerRunners {
  runHybridGptWorkerProcess: typeof runHybridGptWorkerProcess;
  runHybridLocalWorkerProcess: typeof runHybridLocalWorkerProcess;
}

const defaultWorkerRunners: HybridStagedWorkerRunners = {
  runHybridGptWorkerProcess,
  runHybridLocalWorkerProcess,
};

// The staged hybrid flow runs cloud triage and local review workers without changing CLI behavior.
export async function runHybridStagedReview(
  input: {
    changedFiles: string[];
    diffText: string;
    repoRoot: string;
    scriptPath: string;
    toolRepoRoot: string;
  },
  workerRunners = defaultWorkerRunners,
): Promise<HybridReviewReport> {
  const heuristics = analyzeHybridHeuristics({
    changedFiles: input.changedFiles,
    diffText: input.diffText,
  });

  if (heuristics.file_count === 0 && input.diffText.trim().length === 0) {
    return buildHybridReviewReport({
      gptReview: {
        provider: 'copilot-gpt-5-mini',
        model: 'gpt-5-mini',
        status: 'completed',
        overall_risk: 'low',
        confidence: 'high',
        needs_local_deep_review: false,
        focus_profiles: [],
        findings: [],
        summary: 'No staged changes were detected.',
        error: null,
      },
      heuristics,
      localReviewResult: null,
    });
  }

  const forceFullLocal =
    heuristics.sensitive_categories.length > 0 ||
    heuristics.file_count > 15 ||
    input.diffText.length > MAX_HYBRID_GPT_DIFF_CHARS;
  const gptPromise =
    input.diffText.length > MAX_HYBRID_GPT_DIFF_CHARS
      ? Promise.resolve(
          createHybridGptBypassReview(
            `Skipped cloud GPT review because the diff exceeded the safe prompt budget (${input.diffText.length} > ${MAX_HYBRID_GPT_DIFF_CHARS} chars).`,
          ),
        )
      : workerRunners.runHybridGptWorkerProcess({
          changedFiles: heuristics.changed_files,
          diffText: input.diffText,
          repoRoot: input.repoRoot,
          scriptPath: input.scriptPath,
        });
  const earlyLocalPromise = forceFullLocal
    ? workerRunners.runHybridLocalWorkerProcess({
        localMode: 'full',
        repoRoot: input.repoRoot,
        requestedProfiles: heuristics.routed_profiles,
        scriptPath: input.scriptPath,
        toolRepoRoot: input.toolRepoRoot,
      })
    : null;
  const gptReview = await gptPromise;
  const localPlan = planHybridLocalReview({
    gptReview,
    heuristics,
  });

  const localReviewResult =
    earlyLocalPromise !== null
      ? await earlyLocalPromise
      : localPlan.local_mode !== 'skipped'
        ? await workerRunners.runHybridLocalWorkerProcess({
            localMode: localPlan.local_mode,
            repoRoot: input.repoRoot,
            requestedProfiles: localPlan.requested_profiles,
            scriptPath: input.scriptPath,
            toolRepoRoot: input.toolRepoRoot,
          })
        : null;

  return buildHybridReviewReport({
    gptReview,
    heuristics,
    localReviewResult,
  });
}
