import { pathToFileURL } from 'node:url';

import { main } from './run-checkpoint-review/run-checkpoint-review.ts';

export * from './run-checkpoint-review/run-checkpoint-review.ts';

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
