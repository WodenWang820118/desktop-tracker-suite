import { sleep } from './time.ts';

export interface WaitForUrlRetryEvent {
  attempt: number;
  errorMessage?: string;
  status?: number;
  url: string;
}

export interface WaitForUrlOptions {
  attempts?: number;
  delayMs?: number;
  onRetry?: (event: WaitForUrlRetryEvent) => void;
}

export async function waitForUrl(
  url: string,
  { attempts = 60, delayMs = 1000, onRetry }: WaitForUrlOptions = {},
): Promise<number> {
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return Date.now() - startedAt;
      }

      onRetry?.({ attempt, status: response.status, url });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onRetry?.({ attempt, errorMessage, url });
    }

    await sleep(delayMs);
  }

  throw new Error(`Timed out waiting for ${url}`);
}
