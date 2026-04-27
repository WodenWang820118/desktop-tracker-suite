import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildReviewPromptWithReviewerProfile,
  readReviewerProfile,
  resolveReviewerId,
} from './reviewer-profile.ts';

test('resolveReviewerId routes security process focus to the security reviewer', () => {
  assert.equal(
    resolveReviewerId({
      checkpoint: 'implementation',
      focus: 'process untrusted input',
    }),
    'security-reviewer',
  );
});

test('readReviewerProfile reads markdown frontmatter profiles for Copilot and Gemini fallback', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'reviewer-profile-'));

  try {
    mkdirSync(join(repoRoot, '.github', 'agents'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.github', 'agents', 'test-reviewer.agent.md'),
      ['---', 'name: test-reviewer', '---', '', 'Test profile text.'].join(
        '\n',
      ),
    );

    assert.equal(
      readReviewerProfile({
        provider: 'copilot',
        repoRoot,
        reviewerId: 'test-reviewer',
      }),
      'Test profile text.',
    );
    assert.equal(
      readReviewerProfile({
        provider: 'gemini',
        repoRoot,
        reviewerId: 'test-reviewer',
      }),
      'Test profile text.',
    );
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test('buildReviewPromptWithReviewerProfile wraps context with the selected provider lens', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'reviewer-profile-wrap-'));

  try {
    mkdirSync(join(repoRoot, '.codex', 'agents'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.codex', 'agents', 'architecture-reviewer.toml'),
      'developer_instructions = """\nArchitecture profile text.\n"""',
    );

    const prompt = buildReviewPromptWithReviewerProfile({
      checkpoint: 'plan',
      focus: 'architecture',
      prompt: 'Original context.',
      provider: 'codex',
      repoRoot,
    });

    assert.match(
      prompt,
      /Use the codex reviewer specialist lens: architecture-reviewer/,
    );
    assert.match(prompt, /Architecture profile text\./);
    assert.match(prompt, /Original context\./);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
