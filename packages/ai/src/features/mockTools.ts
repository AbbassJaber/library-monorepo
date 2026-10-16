import type { MockToolHandler } from '../providers/mock/index.js';
import { AUTOFILL_TOOL, autofillMockHandler } from './autofill.js';
import { EXPANSION_TOOL, expansionMockHandler } from './expansion.js';
import { RERANK_TOOL, rerankMockHandler } from './hybridSearch.js';
import { NL_SEARCH_TOOL, nlSearchMockHandler } from './nlSearch.js';
import { RECOMMEND_TOOL, recommendMockHandler } from './recommend.js';

export const mockToolHandlers: Record<string, MockToolHandler> = {
  [NL_SEARCH_TOOL]: nlSearchMockHandler,
  [AUTOFILL_TOOL]: autofillMockHandler,
  [RERANK_TOOL]: rerankMockHandler,
  [EXPANSION_TOOL]: expansionMockHandler,
  [RECOMMEND_TOOL]: recommendMockHandler,
};
