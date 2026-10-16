#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const envFile = join(import.meta.dirname, '../../../apps/api/.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const region = process.env.AWS_REGION || 'eu-central-1';

const { BedrockClient, ListFoundationModelsCommand } = await import('@aws-sdk/client-bedrock');
const { BedrockRuntimeClient, InvokeModelCommand } =
  await import('@aws-sdk/client-bedrock-runtime');
const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');

const bedrock = new BedrockClient({ region });
const list = await bedrock.send(new ListFoundationModelsCommand({}));
const wanted = (list.modelSummaries ?? []).filter(m =>
  /claude-haiku-4-5|claude-sonnet-5|titan-embed-text-v2/.test(m.modelId ?? '')
);
console.log(`Models in ${region}:`);
for (const m of wanted)
  console.log(
    `  ${m.modelId}  ${m.modelLifecycle?.status ?? ''}  ${(m.inferenceTypesSupported ?? []).join('/')}`
  );

const client = new AnthropicBedrock({ awsRegion: region });
for (const [tier, model] of Object.entries({
  small: process.env.AI_MODEL_SMALL,
  strong: process.env.AI_MODEL_STRONG,
})) {
  if (!model) continue;
  const started = Date.now();
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Call the tool.' }],
      tools: [
        {
          name: 'ping',
          description: 'ping',
          input_schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'ping' },
    });
    console.log(
      `[${tier}] ${model}: forced tool OK in ${Date.now() - started} ms; usage`,
      res.usage
    );
  } catch (error) {
    console.log(`[${tier}] ${model}: ${error.status ?? ''} ${error.message}`);
  }
}
const embedModel = process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0';
try {
  const runtime = new BedrockRuntimeClient({ region });
  const res = await runtime.send(
    new InvokeModelCommand({
      modelId: embedModel,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({ inputText: 'hello', dimensions: 512, normalize: true }),
    })
  );
  const parsed = JSON.parse(new TextDecoder().decode(res.body));
  console.log(
    `[embeddings] ${embedModel}: ${parsed.embedding.length} dimensions, ${parsed.inputTextTokenCount} input tokens`
  );
} catch (error) {
  console.log(`[embeddings] ${embedModel}: ${error.name} ${error.message}`);
}
