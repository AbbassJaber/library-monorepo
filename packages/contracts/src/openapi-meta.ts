import { z } from 'zod';

export const componentIds = (): string[] => [...z.globalRegistry._idmap.keys()].sort();
