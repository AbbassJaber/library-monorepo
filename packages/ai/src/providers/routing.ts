import type { AiFeature } from '@library/contracts';
import { BUDGETS } from '../cost/budgets.js';
import type { Tier } from './types.js';

export const tierFor = (feature: AiFeature): Tier => BUDGETS[feature].tier;
