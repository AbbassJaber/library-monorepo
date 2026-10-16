import { SERVICE_PATHS } from '@library/contracts';
import { E2E_API_URL } from './config';

export default async function waitForReady(): Promise<void> {
  const url = `${E2E_API_URL.replace(/\/$/, '')}${SERVICE_PATHS.ready}`;
  const timeoutMs = Number(process.env['E2E_READY_TIMEOUT_MS'] ?? 180_000);
  const deadline = Date.now() + timeoutMs;
  let last = 'no answer';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; details?: { reason?: string; missing?: number } };
      };
      const next =
        `${res.status} ${body.error?.code ?? ''} ${body.error?.details?.reason ?? ''} ${body.error?.details?.missing ?? ''}`.trim();
      if (next !== last) console.log(`waiting for ${url}: ${next}`);
      last = next;
    } catch (error) {
      last = String((error as Error).message);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} not ready after ${timeoutMs} ms (${last})`);
}
