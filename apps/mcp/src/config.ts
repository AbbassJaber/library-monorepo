import { z } from 'zod';
import { LOOKUP_SOURCE } from '@library/domain-config';

export const McpEnv = z.object({
  LIBRARY_API_URL: z.url().default('http://localhost:4000'),
  LIBRARY_EMAIL: z.string().min(3),
  LIBRARY_PASSWORD: z.string().min(1),
  LIBRARY_LOOKUP: z.enum(LOOKUP_SOURCE).default(LOOKUP_SOURCE.openLibrary),
  LIBRARY_LOOKUP_TIMEOUT_MS: z.coerce.number().int().min(500).default(8000),
});
export type McpEnv = z.infer<typeof McpEnv>;

export const loadMcpEnv = (env: NodeJS.ProcessEnv = process.env): McpEnv => {
  const parsed = McpEnv.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `library MCP server: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')} ` +
        '(set LIBRARY_API_URL, LIBRARY_EMAIL and LIBRARY_PASSWORD)'
    );
  return parsed.data;
};
