import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCollectCandidatesArgs,
  parseEvaluateSampleArgs,
  parseHybridGptWorkerArgs,
  parseHybridLocalWorkerArgs,
  parseRequestedProfiles,
} from './worker-commands.ts';

test('parseCollectCandidatesArgs reads the internal candidate worker contract', () => {
  assert.deepEqual(
    parseCollectCandidatesArgs([
      '--repo-name',
      'gx.go',
      '--repo-root',
      'C:/repo/gx.go',
      '--seed',
      '7',
    ]),
    {
      repoName: 'gx.go',
      repoRoot: 'C:/repo/gx.go',
      seed: 7,
    },
  );
  assert.throws(
    () => parseCollectCandidatesArgs(['--repo-name', 'gx.go']),
    /Missing required internal repo candidate worker args/,
  );
  assert.throws(
    () => parseCollectCandidatesArgs(['--repo-root', 'C:/repo/gx.go']),
    /Missing required internal repo candidate worker args/,
  );
  assert.deepEqual(
    parseCollectCandidatesArgs([
      '--repo-name',
      'gx.go',
      '--repo-root',
      'C:/repo/gx.go',
    ]),
    {
      repoName: 'gx.go',
      repoRoot: 'C:/repo/gx.go',
      seed: 20260419,
    },
  );
  assert.throws(
    () => parseCollectCandidatesArgs(['--bogus']),
    /Unknown internal worker flag: --bogus/,
  );
});

test('parseEvaluateSampleArgs reads sample payload and local reviewer tool path', () => {
  assert.deepEqual(
    parseEvaluateSampleArgs([
      '--sample-base64',
      'eyJvayI6dHJ1ZX0=',
      '--small-diff-threshold-chars',
      '2048',
      '--tool-repo-root',
      'C:/repo/local-reviewer-cli',
    ]),
    {
      sampleBase64: 'eyJvayI6dHJ1ZX0=',
      smallDiffThresholdChars: 2048,
      toolRepoRoot: 'C:/repo/local-reviewer-cli',
    },
  );
  assert.throws(
    () => parseEvaluateSampleArgs(['--sample-base64', 'abc']),
    /Missing required internal sample worker args/,
  );
  assert.throws(
    () => parseEvaluateSampleArgs(['--bogus']),
    /Unknown internal worker flag: --bogus/,
  );
});

test('parseHybridGptWorkerArgs preserves explicitly empty base64 payloads', () => {
  assert.deepEqual(
    parseHybridGptWorkerArgs([
      '--changed-files-base64',
      '',
      '--diff-base64',
      '',
    ]),
    {
      changedFilesBase64: '',
      diffBase64: '',
    },
  );
  assert.throws(
    () => parseHybridGptWorkerArgs(['--changed-files-base64', 'W10=']),
    /Missing required hybrid GPT worker args/,
  );
  assert.throws(
    () => parseHybridGptWorkerArgs(['--diff-base64', 'QAo=']),
    /Missing required hybrid GPT worker args/,
  );
  assert.throws(
    () => parseHybridGptWorkerArgs(['--bogus']),
    /Unknown internal hybrid GPT worker flag: --bogus/,
  );
});

test('parseHybridLocalWorkerArgs validates mode and requires the tool path', () => {
  assert.deepEqual(
    parseHybridLocalWorkerArgs([
      '--local-mode',
      'targeted',
      '--requested-profiles',
      'typescript,angular',
      '--tool-repo-root',
      'C:/repo/local-reviewer-cli',
    ]),
    {
      localMode: 'targeted',
      requestedProfiles: 'typescript,angular',
      toolRepoRoot: 'C:/repo/local-reviewer-cli',
    },
  );
  assert.throws(
    () =>
      parseHybridLocalWorkerArgs([
        '--local-mode',
        'partial',
        '--tool-repo-root',
        'C:/repo/local-reviewer-cli',
      ]),
    /Unsupported hybrid local mode: partial/,
  );
  assert.throws(
    () =>
      parseHybridLocalWorkerArgs([
        '--local-mode',
        'full',
        '--requested-profiles',
        'typescript',
      ]),
    /Missing required hybrid local worker args/,
  );
  assert.throws(
    () => parseHybridLocalWorkerArgs(['--bogus']),
    /Unknown internal hybrid local worker flag: --bogus/,
  );
});

test('parseRequestedProfiles keeps known profiles and drops unknown entries', () => {
  assert.deepEqual(parseRequestedProfiles('typescript,java, angular'), [
    'typescript',
    'angular',
  ]);
  assert.deepEqual(parseRequestedProfiles(''), []);
  assert.deepEqual(parseRequestedProfiles('java,ruby'), []);
});
