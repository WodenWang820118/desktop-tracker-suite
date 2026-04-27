import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  readCommonReviewContract,
  resolveCommonReviewContractPath,
} from './common-review-contract.ts';

test('readCommonReviewContract extracts developer instructions from the shared contract', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'common-review-contract-'));

  try {
    mkdirSync(join(repoRoot, '.agents', 'reviewers'), { recursive: true });
    const contractPath = join(
      repoRoot,
      '.agents',
      'reviewers',
      'common-review-contract.toml',
    );
    writeFileSync(
      contractPath,
      'developer_instructions = """\nShared contract body.\n"""',
    );

    assert.equal(resolveCommonReviewContractPath(repoRoot), contractPath);
    assert.equal(readCommonReviewContract(repoRoot), 'Shared contract body.');
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
