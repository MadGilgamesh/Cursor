/**
 * Lokalny „serwis push” do testów: przyjmuje żądania Web Push, a dzięki kluczom
 * subskrypcji wygenerowanym po stronie testu potrafi odszyfrować treść (aes128gcm).
 */
import { createECDH, randomBytes, type ECDH } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

import ece from 'http_ece';

export interface ReceivedPush {
  path: string;
  headers: IncomingHttpHeaders;
  payload: unknown;
}

export interface PushReceiver {
  subscription(path?: string): { endpoint: string; keys: { p256dh: string; auth: string } };
  received: ReceivedPush[];
  /** Kod odpowiedzi dla danej ścieżki (np. 410 = subskrypcja wygasła). */
  respondWith(path: string, status: number): void;
  waitFor(count: number, timeoutMs?: number): Promise<ReceivedPush[]>;
  close(): Promise<void>;
}

export async function startPushReceiver(): Promise<PushReceiver> {
  const keys = new Map<string, { ecdh: ECDH; auth: Buffer }>();
  const statuses = new Map<string, number>();
  const received: ReceivedPush[] = [];

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const path = request.url ?? '/';
      const key = keys.get(path);
      let payload: unknown = null;
      if (key) {
        const plain = ece.decrypt(Buffer.concat(chunks), {
          version: 'aes128gcm',
          privateKey: key.ecdh,
          authSecret: key.auth.toString('base64url'),
        });
        payload = JSON.parse(plain.toString('utf8'));
      }
      received.push({ path, headers: request.headers, payload });
      response.statusCode = statuses.get(path) ?? 201;
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    received,
    subscription(path = `/push/${randomBytes(6).toString('hex')}`) {
      const ecdh = createECDH('prime256v1');
      ecdh.generateKeys();
      const auth = randomBytes(16);
      keys.set(path, { ecdh, auth });
      return {
        endpoint: `http://127.0.0.1:${port}${path}`,
        keys: {
          p256dh: ecdh.getPublicKey().toString('base64url'),
          auth: auth.toString('base64url'),
        },
      };
    },
    respondWith(path, status) {
      statuses.set(path, status);
    },
    async waitFor(count, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (received.length < count) {
        if (Date.now() > deadline) throw new Error(`Nie otrzymano ${count} powiadomień w czasie`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return received;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
