import type { SystemBlock } from '../providers/types.js';
import { UNTRUSTED_DATA_RULE } from '../safety/untrusted.js';

export interface PromptParts {
  instructions: string;
  vocabulary: string;
  examples?: string;
  perUserContext?: string;
  dataBlocks?: string[];
}

export const composeSystem = (parts: PromptParts): SystemBlock[] => {
  const stable = [parts.instructions, UNTRUSTED_DATA_RULE, parts.vocabulary, parts.examples ?? '']
    .filter(text => text.length > 0)
    .join('\n\n');
  const variable = [parts.perUserContext ?? '', ...(parts.dataBlocks ?? [])]
    .filter(text => text.length > 0)
    .join('\n\n');
  const blocks: SystemBlock[] = [{ text: stable, cache: true }];
  if (variable.length > 0) blocks.push({ text: variable });
  return blocks;
};

export const stablePrefix = (blocks: SystemBlock[]): string =>
  blocks
    .filter(block => block.cache)
    .map(block => block.text)
    .join('\n');
