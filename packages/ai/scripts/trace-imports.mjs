import { register } from 'node:module';
import { MessageChannel } from 'node:worker_threads';

const { port1, port2 } = new MessageChannel();
globalThis.__loaded = '';
port1.on('message', url => {
  globalThis.__loaded += `${url}\n`;
});
port1.unref();
register(
  'data:text/javascript,' +
    encodeURIComponent(`
  let port;
  export const initialize = (data) => { port = data.port; };
  export const resolve = async (specifier, context, next) => {
    const result = await next(specifier, context);
    port.postMessage(result.url);
    return result;
  };
`),
  { parentURL: import.meta.url, data: { port: port2 }, transferList: [port2] }
);
