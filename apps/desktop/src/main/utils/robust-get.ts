/**
 * Node-stack HTTP GET helpers for the main process.
 *
 * Electron's net-backed fetch (the default global fetch in the main process)
 * surfaces mid-stream disconnects as uncaught exceptions thrown from internal
 * Chromium callbacks (SimpleURLLoaderWrapper) - no caller try/catch can
 * intercept them and they take the whole main process down. On flaky links
 * that is fatal for features that are supposed to degrade gracefully
 * (SITL frame catalog / firmware downloads). These helpers use Node's own
 * http/https stack instead, where every failure is a normal promise
 * rejection/null the caller can handle.
 */
import http from 'node:http';
import https from 'node:https';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';

function modFor(url: string): typeof http | typeof https {
  return url.startsWith('http://') ? http : https;
}

/** GET a URL as text. Resolves null on any network/HTTP failure. */
export function robustGetText(url: string, timeoutMs = 30_000): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = modFor(url).get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', () => resolve(null));
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/** GET a URL into memory as a Buffer. Resolves null on any failure. */
export function robustGetBuffer(url: string, timeoutMs = 30_000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const req = modFor(url).get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Stream a URL to `dest` (via a `.tmp` sibling, atomically renamed on
 * success). Resolves true on success, false on any failure (partial `.tmp`
 * is removed). `onProgress` receives (bytesDone, totalBytesOr0) as the body
 * streams in.
 */
export function robustDownloadTo(
  url: string,
  dest: string,
  onProgress?: (bytesDone: number, totalBytes: number) => void,
  timeoutMs = 300_000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const tmp = `${dest}.tmp`;
    const finish = async (ok: boolean) => {
      try {
        if (ok) {
          try { await rm(dest, { force: true }); } catch { /* not present */ }
          await rename(tmp, dest);
          resolve(true);
          return;
        }
        await rm(tmp, { force: true });
      } catch {
        try { await rm(tmp, { force: true }); } catch { /* best effort */ }
      }
      resolve(false);
    };
    try {
      const req = modFor(url).get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          void finish(false);
          return;
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10) || 0;
        const out = createWriteStream(tmp);
        let done = 0;
        res.on('data', (c: Buffer) => {
          done += c.length;
          out.write(c);
          onProgress?.(done, total);
        });
        res.on('end', () => {
          out.end(() => void finish(true));
        });
        res.on('error', () => { out.destroy(); void finish(false); });
        out.on('error', () => { req.destroy(); void finish(false); });
      });
      req.on('timeout', () => { req.destroy(); void finish(false); });
      req.on('error', () => void finish(false));
    } catch {
      void finish(false);
    }
  });
}
