import assert from 'node:assert/strict';
import { createServer, type RequestListener, type Server } from 'node:http';
import test from 'node:test';

import { waitForUrl, type WaitForUrlRetryEvent } from './http.ts';

test('waitForUrl returns elapsed milliseconds when the url becomes ready', async () => {
  const server = await listen((_, response) => {
    response.writeHead(200);
    response.end('ok');
  });

  try {
    const elapsedMs = await waitForUrl(server.url, {
      attempts: 1,
      delayMs: 1,
    });

    assert.equal(typeof elapsedMs, 'number');
    assert.ok(elapsedMs >= 0);
  } finally {
    await server.close();
  }
});

test('waitForUrl reports retry status through the retry hook', async () => {
  const server = await listen((_, response) => {
    response.writeHead(503);
    response.end('not ready');
  });
  const retries: WaitForUrlRetryEvent[] = [];

  try {
    await assert.rejects(
      waitForUrl(server.url, {
        attempts: 1,
        delayMs: 1,
        onRetry: (event) => retries.push(event),
      }),
      /Timed out waiting for/,
    );

    assert.deepEqual(retries, [
      {
        attempt: 1,
        status: 503,
        url: server.url,
      },
    ]);
  } finally {
    await server.close();
  }
});

test('waitForUrl retries until a later attempt succeeds', async () => {
  let requests = 0;
  const server = await listen((_, response) => {
    requests += 1;
    if (requests < 2) {
      response.writeHead(503);
      response.end('not ready');
      return;
    }

    response.writeHead(200);
    response.end('ok');
  });
  const retries: WaitForUrlRetryEvent[] = [];

  try {
    const elapsedMs = await waitForUrl(server.url, {
      attempts: 3,
      delayMs: 1,
      onRetry: (event) => retries.push(event),
    });

    assert.equal(typeof elapsedMs, 'number');
    assert.equal(requests, 2);
    assert.deepEqual(retries, [
      {
        attempt: 1,
        status: 503,
        url: server.url,
      },
    ]);
  } finally {
    await server.close();
  }
});

test('waitForUrl exhausts all attempts before timing out', async () => {
  const server = await listen((_, response) => {
    response.writeHead(503);
    response.end('not ready');
  });
  const retries: WaitForUrlRetryEvent[] = [];

  try {
    await assert.rejects(
      waitForUrl(server.url, {
        attempts: 3,
        delayMs: 1,
        onRetry: (event) => retries.push(event),
      }),
      /Timed out waiting for/,
    );

    assert.equal(retries.length, 3);
    assert.deepEqual(
      retries.map((event) => event.attempt),
      [1, 2, 3],
    );
  } finally {
    await server.close();
  }
});

test('waitForUrl reports network errors and then times out', async () => {
  const retries: WaitForUrlRetryEvent[] = [];

  await assert.rejects(
    waitForUrl('http://127.0.0.1:1/health', {
      attempts: 1,
      delayMs: 1,
      onRetry: (event) => retries.push(event),
    }),
    /Timed out waiting for/,
  );

  assert.equal(retries.length, 1);
  assert.equal(retries[0]?.attempt, 1);
  assert.equal(retries[0]?.url, 'http://127.0.0.1:1/health');
  assert.ok(retries[0]?.errorMessage);
});

async function listen(
  handler: RequestListener,
): Promise<{ close: () => Promise<void>; url: string }> {
  const server = createServer(handler);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server.');
  }

  return {
    close: () => closeServer(server),
    url: `http://127.0.0.1:${address.port}/health`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise();
    });
  });
}
