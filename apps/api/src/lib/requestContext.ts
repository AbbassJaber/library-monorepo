import { AsyncLocalStorage } from 'node:async_hooks';
import type { Actor } from './route.js';

export interface RequestContext {
  requestId: string;
  actor?: Actor;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

export const getRequestContext = (): RequestContext | undefined => storage.getStore();

export const setContextActor = (actor: Actor): void => {
  const store = storage.getStore();
  if (store) store.actor = actor;
};
