import { pathToFileURL } from 'node:url';

import { main } from './local-reviewer/local-reviewer.ts';

export { main } from './local-reviewer/local-reviewer.ts';
export {
  getUsageText,
  parseCliArgs,
  writePrefilterOutput,
  type ParsedLocalReviewerCliArgs,
} from './local-reviewer/cli/cli.ts';
export { buildNodeWorkerArgs } from './local-reviewer/workers/workers.ts';

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
