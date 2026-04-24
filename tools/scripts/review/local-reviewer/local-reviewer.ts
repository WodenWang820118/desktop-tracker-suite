import {
  buildHybridPrefilterContext,
  buildPrefilterFailureContext,
  collectChangedFiles,
  collectDiffText,
  collectEvaluationSamples,
  createLocalReviewerDependencies,
  createLocalReviewerEnv,
  ensureLocalReviewerBuild,
  evaluateSampleWithCheckpointReview,
  evaluateSampleWithLocalReviewer,
  getEscalationReasons,
  resolveEvaluationRepoTargets,
  resolveLocalReviewerRepoRoot,
  runLocalReviewerDoctor,
  selectAbSamples,
  selectPaidReviewContext,
  summarizeEvaluation,
  writePrefilterArtifacts,
} from '../local-reviewer-support.ts';
import {
  normalizeJobs,
  parseCliArgs,
  writePrefilterOutput,
} from './cli/cli.ts';
import { runHybridStagedReview } from './hybrid-staged/hybrid-staged.ts';
import {
  runCollectCandidatesWorker,
  runEvaluateSampleWorker,
  runHybridGptWorker,
  runHybridLocalWorker,
} from './worker-commands/worker-commands.ts';
import {
  collectEvaluationSamplesInParallel,
  evaluateSamplesInParallel,
} from './workers/workers.ts';

export interface LocalReviewerWorkerHandlers {
  runCollectCandidatesWorker: (argv: string[]) => Promise<void>;
  runEvaluateSampleWorker: (argv: string[]) => Promise<void>;
  runHybridGptWorker: (argv: string[]) => Promise<void>;
  runHybridLocalWorker: (argv: string[]) => Promise<void>;
}

const defaultWorkerHandlers: LocalReviewerWorkerHandlers = {
  runCollectCandidatesWorker,
  runEvaluateSampleWorker,
  runHybridGptWorker,
  runHybridLocalWorker,
};

// Main orchestration keeps the public commands intact and delegates detailed mechanics to focused modules.
export async function main(
  argv = process.argv.slice(2),
  workerHandlers = defaultWorkerHandlers,
): Promise<void> {
  if (argv[0] === '__collect-candidates') {
    await workerHandlers.runCollectCandidatesWorker(argv.slice(1));
    return;
  }

  if (argv[0] === '__evaluate-sample') {
    await workerHandlers.runEvaluateSampleWorker(argv.slice(1));
    return;
  }

  if (argv[0] === '__hybrid-gpt-review') {
    await workerHandlers.runHybridGptWorker(argv.slice(1));
    return;
  }

  if (argv[0] === '__hybrid-local-review') {
    await workerHandlers.runHybridLocalWorker(argv.slice(1));
    return;
  }

  const parsed = parseCliArgs(argv);
  const repoRoot = process.cwd();
  const dependencies = createLocalReviewerDependencies();
  const toolRepoRoot = resolveLocalReviewerRepoRoot(repoRoot);
  const env = createLocalReviewerEnv();
  const jobs = normalizeJobs(parsed.jobs);

  ensureLocalReviewerBuild(toolRepoRoot, dependencies, env);

  if (parsed.command === 'doctor') {
    const report = runLocalReviewerDoctor({
      dependencies,
      env,
      targetRepoRoot: repoRoot,
      toolRepoRoot,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (parsed.command === 'staged') {
    const diffText = collectDiffText({
      dependencies,
      repoRoot,
      staged: true,
    });
    const changedFiles = collectChangedFiles({
      dependencies,
      repoRoot,
      staged: true,
    });
    const report = await runHybridStagedReview({
      changedFiles,
      diffText,
      repoRoot,
      scriptPath: resolveScriptPath(),
      toolRepoRoot,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (parsed.command === 'prefilter') {
    const diffText = collectDiffText({
      dependencies,
      repoRoot,
      staged: true,
    });
    const changedFiles = collectChangedFiles({
      dependencies,
      repoRoot,
      staged: true,
    });

    try {
      const report = await runHybridStagedReview({
        changedFiles,
        diffText,
        repoRoot,
        scriptPath: resolveScriptPath(),
        toolRepoRoot,
      });
      const contextMarkdown = buildHybridPrefilterContext({
        report,
      });
      const reviewContextSelection = selectPaidReviewContext({
        diffText,
        prefilterContext: contextMarkdown,
        smallDiffThresholdChars: parsed.smallDiffThresholdChars,
      });
      const payload = {
        recommended_escalation: report.recommended_escalation,
        escalation_reasons: report.escalation_reasons,
        gpt_provider: report.gpt_review.provider,
        gpt_risk: report.gpt_review.overall_risk,
        gpt_confidence: report.gpt_review.confidence,
        local_mode: report.local_mode,
        requested_profiles: report.requested_profiles,
        decision_basis: report.decision_basis,
        report,
        review_context_mode: reviewContextSelection.mode,
        small_diff_threshold_chars:
          reviewContextSelection.smallDiffThresholdChars,
      };
      const artifacts = writePrefilterArtifacts({
        repoRoot,
        contextMarkdown,
        reportPayload: payload,
        reviewContextSelection,
      });

      writePrefilterOutput({
        artifacts,
        decisionBasis: report.decision_basis,
        gptConfidence: report.gpt_review.confidence,
        gptProvider: report.gpt_review.provider,
        gptRisk: report.gpt_review.overall_risk,
        localMode: report.local_mode,
        payload,
        recommendedEscalation: report.recommended_escalation,
        requestedProfiles: report.requested_profiles,
        reviewContextMode: reviewContextSelection.mode,
        smallDiffThresholdChars: reviewContextSelection.smallDiffThresholdChars,
      });
      return;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      const escalationReasons = getEscalationReasons({
        diffText,
        fileCount: changedFiles.length,
        findings: [],
        changedFiles,
        localReviewError: errorText,
      });
      const contextMarkdown = buildPrefilterFailureContext({
        changedFiles,
        diffText,
        escalationReasons,
        localReviewError: errorText,
      });
      const reviewContextSelection = selectPaidReviewContext({
        diffText,
        forceFullDiff: true,
        prefilterContext: contextMarkdown,
        smallDiffThresholdChars: parsed.smallDiffThresholdChars,
      });
      const payload = {
        recommended_escalation: true,
        escalation_reasons: escalationReasons,
        gpt_provider: 'copilot-gpt-5-mini',
        gpt_risk: null,
        gpt_confidence: null,
        local_mode: 'full',
        requested_profiles: [],
        decision_basis: 'local-fallback',
        local_review_error: errorText,
        report: null,
        review_context_mode: reviewContextSelection.mode,
        small_diff_threshold_chars:
          reviewContextSelection.smallDiffThresholdChars,
      };
      const artifacts = writePrefilterArtifacts({
        repoRoot,
        contextMarkdown,
        reportPayload: payload,
        reviewContextSelection,
      });

      writePrefilterOutput({
        artifacts,
        decisionBasis: 'local-fallback',
        gptConfidence: null,
        gptProvider: 'copilot-gpt-5-mini',
        gptRisk: null,
        localMode: 'full',
        payload,
        recommendedEscalation: true,
        requestedProfiles: [],
        reviewContextMode: reviewContextSelection.mode,
        smallDiffThresholdChars: reviewContextSelection.smallDiffThresholdChars,
      });
      return;
    }
  }

  const repoTargets = resolveEvaluationRepoTargets(repoRoot, parsed.repos);
  const samples =
    jobs > 1
      ? await collectEvaluationSamplesInParallel({
          dependencies,
          jobs,
          repoTargets,
          rounds: parsed.rounds,
          scriptPath: resolveScriptPath(),
          seed: parsed.seed,
        })
      : collectEvaluationSamples({
          dependencies,
          repoTargets,
          rounds: parsed.rounds,
          seed: parsed.seed,
        });
  const localResults =
    jobs > 1
      ? await evaluateSamplesInParallel({
          jobs,
          samples,
          scriptPath: resolveScriptPath(),
          smallDiffThresholdChars: parsed.smallDiffThresholdChars,
          toolRepoRoot,
        })
      : samples.map((sample) =>
          evaluateSampleWithLocalReviewer({
            dependencies,
            env,
            sample,
            smallDiffThresholdChars: parsed.smallDiffThresholdChars,
            toolRepoRoot,
          }),
        );
  const abSamples = selectAbSamples(samples, parsed.abSamples);
  const reviewerResults =
    parsed.abSamples > 0
      ? abSamples.map((sample) =>
          evaluateSampleWithCheckpointReview({
            dependencies,
            sample,
          }),
        )
      : [];
  const output = summarizeEvaluation({
    config: {
      abSampleCount: parsed.abSamples,
      jobs,
      repoNames: repoTargets.map((repo) => repo.name),
      rounds: parsed.rounds,
      seed: parsed.seed,
      smallDiffThresholdChars: parsed.smallDiffThresholdChars,
    },
    localResults,
    reviewerResults,
    repoRoot,
  });

  process.stdout.write(`${output.summaryMarkdown}\n`);
  process.stdout.write(
    [
      '',
      `samples_path=${output.artifacts.samplesPath}`,
      `local_results_path=${output.artifacts.localResultsPath}`,
      `ab_results_path=${output.artifacts.abResultsPath}`,
      `summary_path=${output.artifacts.summaryPath}`,
    ].join('\n'),
  );
  process.stdout.write('\n');
}

function resolveScriptPath(): string {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error('Unable to resolve the local-reviewer script path.');
  }

  return scriptPath;
}
