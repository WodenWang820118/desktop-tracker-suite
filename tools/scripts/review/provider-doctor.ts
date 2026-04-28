import { pathToFileURL } from 'node:url';

import { main } from './provider-doctor/provider-doctor.ts';

export * from './provider-doctor/provider-doctor.ts';

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
