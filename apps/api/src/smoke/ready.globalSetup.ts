import { SERVICE_PATHS } from '@library/contracts';

export default async function waitForReady(): Promise<void> {
  const base = (process.env['SMOKE_BASE_URL'] ?? 'http://localhost:4000').replace(/\/$/, '');
  const timeoutMs = Number(process.env['SMOKE_READY_TIMEOUT_MS'] ?? 180_000);
  const deadline = Date.now() + timeoutMs;
  let last = 'no answer';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}${SERVICE_PATHS.ready}`);
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; details?: { reason?: string; missing?: number } };
      };
      const next =
        `${res.status} ${body.error?.code ?? ''} ${body.error?.details?.reason ?? ''} ${body.error?.details?.missing ?? ''}`.trim();
      if (next !== last) console.log(`waiting for ${base}${SERVICE_PATHS.ready}: ${next}`);
      last = next;
    } catch (error) {
      last = String((error as Error).message);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${base}${SERVICE_PATHS.ready} not ready after ${timeoutMs} ms (${last})`);
}
