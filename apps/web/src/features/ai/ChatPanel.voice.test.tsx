import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortCall } from '@/features/call/callSession';
import { CallLayer } from '@/features/call/CallLayer';
import { aiStatus } from '@/test/fixtures';
import { API } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { useCallStore } from '@/stores/callStore';
import { useChatStore } from '@/stores/chatStore';
import { ChatPanel } from './ChatPanel';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 0;
  binaryType = 'blob';
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: unknown) {
    this.sent.push(typeof data === 'string' ? JSON.parse(data) : data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
const posted: unknown[] = [];
class FakeWorkletNode {
  port = { postMessage: (data: unknown) => posted.push(data), onmessage: null as unknown };
  connect() {}
}
class FakeAudioContext {
  destination = {};
  currentTime = 0;
  audioWorklet = { addModule: async () => undefined };
  resume = async () => undefined;
  close = async () => undefined;
  createMediaStreamSource() {
    return { connect() {} };
  }
}
const track = { enabled: true, stop() {} };

const withVoice = (voiceMode: 'server' | 'off') =>
  server.use(
    http.get(`${API}/ai/status`, () => HttpResponse.json({ data: { ...aiStatus, voiceMode } }))
  );

const install = () => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }),
    },
    configurable: true,
  });
};

const renderApp = () => {
  useChatStore.setState({ open: true, entries: [] });
  return renderWithProviders(
    <>
      <ChatPanel />
      <CallLayer />
    </>
  );
};

const connect = async () => {
  const user = userEvent.setup();
  act(() => useChatStore.getState().setOpen(true));
  await user.click(await screen.findByRole('button', { name: 'Call the librarian' }));
  const count = FakeWebSocket.instances.length;
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  const ws = FakeWebSocket.instances[count - 1] ?? FakeWebSocket.instances.at(-1)!;
  act(() => ws.open());
  return { user, ws };
};

const pendingAction = (id: string, summary: string) => ({
  type: 'pending-action',
  action: {
    id,
    tool: 'addToReadingList',
    input: { bookId: 1 },
    summary,
    token: 'signed',
    expiresAt: '2026-10-02T12:00:00.000Z',
  },
});

describe('the call', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    posted.length = 0;
    track.enabled = true;
    useCallStore.getState().reset();
    useChatStore.setState({ open: false, entries: [], draft: null, context: null });
  });
  afterEach(() => {
    abortCall();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
    useCallStore.getState().reset();
    useChatStore.setState({ open: false, entries: [] });
  });

  it('is offered only when the server has voice and the browser can capture; never as a mic', async () => {
    install();
    withVoice('off');
    const view = renderApp();
    await screen.findByLabelText('Your message');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: 'Call the librarian' })).toBeNull();
    view.unmount();

    withVoice('server');
    renderApp();
    expect(await screen.findByRole('button', { name: 'Call the librarian' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Talk|voice/i })).toBeNull();
  });

  it('takes over the screen: no chat, asks the librarian to greet, then listens with a timer', async () => {
    install();
    withVoice('server');
    renderApp();
    const { ws } = await connect();
    expect(ws.url).toMatch(/^ws:\/\/[^/]+\/api\/v1\/ai\/voice$/);
    expect(ws.sent[0]).toEqual({ type: 'start', locale: 'en', greet: true });
    expect(useChatStore.getState().open).toBe(false);
    const call = await screen.findByRole('dialog', { name: 'On call with the librarian' });
    expect(within(call).getByRole('status')).toHaveTextContent('Connecting…');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('log')).toBeNull();

    act(() => ws.receive({ type: 'ready', sessionId: 's', maxSeconds: 420 }));
    expect(within(call).getAllByRole('status')[0]).toHaveTextContent('Listening');
    expect(within(call).getByText('00:00')).toBeVisible();
    expect(within(call).getByText(/07:00 left/)).toBeVisible();

    act(() => ws.receive({ type: 'tool', id: 't', name: 'searchBooks', status: 'running' }));
    expect(within(call).getAllByRole('status')[0]).toHaveTextContent('Searching the catalog…');
    act(() => ws.receive({ type: 'tool', id: 't', name: 'searchBooks', status: 'done' }));
    expect(within(call).getAllByRole('status')[0]).toHaveTextContent('Listening');
  });

  it('captions the last lines, lists the books mentioned, and shows a change to confirm', async () => {
    install();
    withVoice('server');
    renderApp();
    const { user, ws } = await connect();
    act(() => {
      ws.receive({ type: 'ready', sessionId: 's', maxSeconds: 420 });
      ws.receive({
        type: 'transcript',
        id: 'u',
        role: 'user',
        stage: 'final',
        text: 'books by tolkien',
      });
      ws.receive({
        type: 'transcript',
        id: 'a',
        role: 'assistant',
        stage: 'final',
        text: 'I found The Hobbit.',
      });
      ws.receive({ type: 'citations', citations: [{ bookId: 1, title: 'The Hobbit' }] });
    });
    const call = await screen.findByRole('dialog', { name: 'On call with the librarian' });
    expect(within(call).getByText('books by tolkien')).toBeVisible();
    expect(within(call).getByText('I found The Hobbit.')).toBeVisible();
    const mentioned = within(call).getAllByRole('region', { name: 'Mentioned in this call' })[0]!;
    expect(within(mentioned).getByRole('link', { name: /^The Hobbit/ })).toHaveAttribute(
      'href',
      '/books/1'
    );

    await user.click(within(call).getByRole('button', { name: 'Captions' }));
    expect(within(call).queryByText('I found The Hobbit.')).toBeNull();
    await user.click(within(call).getByRole('button', { name: 'Captions' }));

    act(() => ws.receive(pendingAction('p1', 'Add “The Hobbit” to your reading list')));
    const card = within(call).getByRole('region', { name: 'Reading list slip' });
    expect(within(card).getByRole('button', { name: 'Confirm' })).toBeVisible();

    act(() => {
      ws.receive({
        type: 'transcript',
        id: 'c',
        role: 'assistant',
        stage: 'speculative',
        text: 'Shall I also…',
      });
      ws.receive({ type: 'interrupted' });
    });
    expect(posted).toContainEqual({ type: 'flush' });
    expect(useChatStore.getState().entries.some(e => e.content === 'Shall I also…')).toBe(false);
  });

  it('mute disables the track (silence keeps flowing), and Esc or Minimize leaves a pill', async () => {
    install();
    withVoice('server');
    renderApp();
    const { user, ws } = await connect();
    act(() => ws.receive({ type: 'ready', sessionId: 's', maxSeconds: 420 }));
    const call = await screen.findByRole('dialog', { name: 'On call with the librarian' });
    await user.click(within(call).getByRole('button', { name: 'Mute' }));
    expect(track.enabled).toBe(false);
    expect(within(call).getByRole('button', { name: 'Mute' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(ws.readyState).toBe(1);

    fireEvent(call, new Event('cancel', { cancelable: true }));
    const pill = await screen.findByRole('region', { name: 'Call with the librarian' });
    expect(screen.queryByRole('dialog', { name: 'On call with the librarian' })).toBeNull();
    expect(within(pill).getByRole('button', { name: 'Mute' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(ws.sent).not.toContainEqual({ type: 'stop' });

    await user.click(within(pill).getByRole('button', { name: 'Back to the call' }));
    expect(screen.getByRole('dialog', { name: 'On call with the librarian' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(screen.getByRole('region', { name: 'Call with the librarian' })).toBeVisible();

    act(() => ws.receive(pendingAction('p2', 'Add “The Hobbit”')));
    expect(screen.getByRole('dialog', { name: 'On call with the librarian' })).toBeVisible();
  });

  it('End call hangs up; the chat log gets one collapsed record with the transcript', async () => {
    install();
    withVoice('server');
    renderApp();
    const { user, ws } = await connect();
    act(() => {
      ws.receive({ type: 'ready', sessionId: 's', maxSeconds: 420 });
      ws.receive({
        type: 'transcript',
        id: 'u',
        role: 'user',
        stage: 'final',
        text: 'books by tolkien',
      });
      ws.receive({
        type: 'transcript',
        id: 'a',
        role: 'assistant',
        stage: 'final',
        text: 'I found The Hobbit.',
      });
    });
    await user.click(screen.getByRole('button', { name: 'End call' }));
    expect(ws.sent).toContainEqual({ type: 'stop' });
    act(() => ws.receive({ type: 'ended', reason: 'user' }));
    expect(screen.queryByRole('dialog', { name: 'On call with the librarian' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Call with the librarian' })).toBeNull();

    act(() => useChatStore.getState().setOpen(true));
    const log = await screen.findByRole('log');
    expect(within(log).getByText(/^Call ·/)).toHaveTextContent(/Call · 00:0\d/);
    expect(within(log).queryByText('books by tolkien')).toBeNull();
    await user.click(within(log).getByRole('button', { name: 'Transcript' }));
    expect(within(log).getByText('books by tolkien')).toBeVisible();
    expect(within(log).getByText('I found The Hobbit.')).toBeVisible();
  });

  it('a call cut by the server says why on its record; a refused start keeps no record', async () => {
    install();
    withVoice('server');
    renderApp();
    const first = await connect();
    act(() => {
      first.ws.receive({ type: 'ready', sessionId: 's', maxSeconds: 420 });
      first.ws.receive({ type: 'ended', reason: 'max-duration' });
    });
    act(() => useChatStore.getState().setOpen(true));
    expect(await screen.findByText(/Time limit reached/)).toBeVisible();

    const second = await connect();
    act(() => second.ws.receive({ type: 'error', code: 'session_active', message: 'busy' }));
    expect(useCallStore.getState().phase).toBe('idle');
    expect(useChatStore.getState().entries.filter(e => e.call)).toHaveLength(1);
  });
});
