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

export interface FetchJsonResponse<T> {
  body: T;
  status: number;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchJsonResponse<T>(url, init);
  return response.body;
}

export async function fetchJsonResponse<T>(
  url: string,
  init?: RequestInit,
): Promise<FetchJsonResponse<T>> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `Request to ${url} failed with ${response.status} ${response.statusText}.`,
    );
  }

  return {
    body: (await response.json()) as T,
    status: response.status,
  };
}
