import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSessionChannel } from './useSessionChannel';
import { useSession } from './useSession';
import { usePresence } from './usePresence';
import { channel as channelFactory, getChannels, mockConfig, removeChannel, resetSupabaseMock, soleChannel } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('useSessionChannel', () => {
  test('creates one channel per session, carrying the presence key', async () => {
    renderHook(() => useSessionChannel('room', 'user-1'));
    await waitFor(() => expect(getChannels()).toHaveLength(1));
    const channel = soleChannel();
    expect(channel.topic).toBe('session:room');
    // The presence key is a construction param: because channel() dedupes by
    // topic it cannot be added later, which is why the channel is created only
    // once an authenticated userId exists.
    expect(channel.params.config?.presence?.key).toBe('user-1');
  });

  test('registers the broadcast AND presence bindings on that one channel before subscribing', async () => {
    renderHook(() => useSessionChannel('room', 'user-1'));
    await waitFor(() => expect(getChannels()).toHaveLength(1));
    const channel = soleChannel();

    expect(channel.bindingsOfType('broadcast')).toHaveLength(1);
    expect(channel.bindingsOfType('presence')).toHaveLength(1);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    // Both bindings must predate the single subscribe() -- the mock throws on a
    // late presence binding the same way the real SDK does, so reaching this
    // line at all proves the ordering.
    const order = channel.bindings.map((binding) => binding.type);
    expect(order).toEqual(['broadcast', 'presence']);
  });

  test('does not create a channel until a userId is known, then creates exactly one', async () => {
    const { rerender } = renderHook(({ userId }: { userId: string | null }) => useSessionChannel('room', userId), {
      initialProps: { userId: null as string | null },
    });
    expect(getChannels()).toHaveLength(0);

    rerender({ userId: 'user-1' });
    await waitFor(() => expect(getChannels()).toHaveLength(1));
    expect(channelFactory).toHaveBeenCalledTimes(1);
  });

  test('reports connection status from the channel subscription', async () => {
    const { result } = renderHook(() => useSessionChannel('room', 'user-1'));
    await waitFor(() => expect(result.current.status).toBe('connected'));

    act(() => soleChannel().emitStatus('CHANNEL_ERROR'));
    expect(result.current.status).toBe('reconnecting');

    act(() => soleChannel().emitStatus('SUBSCRIBED'));
    expect(result.current.status).toBe('connected');
  });

  test('re-publishes presence meta after a reconnect', async () => {
    const { result } = renderHook(() => useSessionChannel('room', 'user-1'));
    await waitFor(() => expect(result.current.channel).not.toBeNull());
    const channel = soleChannel();

    act(() => result.current.channel?.track({ name: 'Alice', status: 'online' }));
    await waitFor(() => expect(channel.track).toHaveBeenCalledWith({ name: 'Alice', status: 'online' }));
    channel.track.mockClear();

    act(() => channel.emitStatus('CHANNEL_ERROR'));
    act(() => channel.emitStatus('SUBSCRIBED'));
    expect(channel.track).toHaveBeenCalledWith({ name: 'Alice', status: 'online' });
  });

  test('removes the channel from the client on teardown, so a remount gets a fresh one', async () => {
    const first = renderHook(() => useSessionChannel('room', 'user-1'));
    await waitFor(() => expect(getChannels()).toHaveLength(1));
    const firstChannel = soleChannel();

    first.unmount();
    expect(removeChannel).toHaveBeenCalledWith(firstChannel);
    // unsubscribe() alone would leave the dead channel in the client registry,
    // where channel() would keep handing it back out for this topic.
    expect(getChannels()).toHaveLength(0);

    renderHook(() => useSessionChannel('room', 'user-1'));
    await waitFor(() => expect(getChannels()).toHaveLength(1));
    expect(soleChannel()).not.toBe(firstChannel);
  });
});

describe('useSession + usePresence on one shared channel', () => {
  function renderWorkspaceHooks(sessionId = 'room', userId: string | null = 'user-1') {
    return renderHook(() => {
      const { channel, status } = useSessionChannel(sessionId, userId);
      const session = useSession(sessionId, userId, channel, status);
      const presence = usePresence(userId, channel);
      return { session, presence };
    });
  }

  test('both hooks bind to the same single channel and both bindings work', async () => {
    mockConfig.sessionRow = { id: 'room', html: '<p>a</p>', css: '', js: '' };
    const { result } = renderWorkspaceHooks();
    await waitFor(() => expect(result.current.session.loading).toBe(false));

    // One channel, one subscribe, both concerns bound. Previously each hook
    // called supabase.channel() itself; the SDK's topic dedupe handed the
    // second one the already-subscribed channel, and adding the presence
    // binding to it threw inside an effect and blanked the page.
    expect(getChannels()).toHaveLength(1);
    const channel = soleChannel();
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    expect(channel.bindingsOfType('broadcast')).toHaveLength(1);
    expect(channel.bindingsOfType('presence')).toHaveLength(1);

    // Broadcast side: a remote edit lands in session content.
    act(() => channel.emitBroadcast('edit', { field: 'html', value: '<p>from-other</p>', userId: 'user-2' }));
    expect(result.current.session.html).toBe('<p>from-other</p>');

    // Presence side: tracking happened on the same channel, with the key the
    // channel was constructed with (a dropped presence config would park this
    // under a placeholder key instead).
    await waitFor(() => expect(channel.track).toHaveBeenCalled());
    expect(Object.keys(channel.presence)).toEqual(['user-1']);

    // ...and a sync event feeds the presence user list.
    channel.presence['user-2'] = [{ name: 'Bob', status: 'online' }];
    act(() => channel.emitPresenceSync());
    expect(result.current.presence.users.map((user) => user.userId)).toEqual(
      expect.arrayContaining(['user-1', 'user-2']),
    );
  });

  test('a local edit is broadcast once on the shared channel', async () => {
    mockConfig.sessionRow = { id: 'room', html: '', css: '', js: '' };
    const { result } = renderWorkspaceHooks();
    await waitFor(() => expect(result.current.session.loading).toBe(false));

    act(() => result.current.session.updateField('js', 'console.log(1)'));

    expect(soleChannel().send).toHaveBeenCalledTimes(1);
    expect(soleChannel().send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'edit',
        payload: { field: 'js', value: 'console.log(1)', userId: 'user-1' },
      }),
    );
  });
});
