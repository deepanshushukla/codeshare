import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type EditField = 'html' | 'css' | 'js';
export type ChannelStatus = 'connecting' | 'connected' | 'reconnecting';

export type BroadcastEditPayload = { field: EditField; value: string; userId: string | null };
export type PresenceMeta = { name: string; status: 'online' | 'away' };
export type PresenceState = Record<string, PresenceMeta[]>;

/**
 * The only handle other hooks get on the session's Realtime channel.
 *
 * Deliberately NOT the raw `RealtimeChannel`: the raw object exposes `on()`,
 * and `supabase.channel(topic)` dedupes by topic, so two hooks each "creating"
 * the session channel get the *same* object back. The second one to run would
 * then be adding bindings to an already-subscribed channel, which the real SDK
 * rejects outright for `presence`/`postgres_changes`
 * (`RealtimeChannel.on()` throws "cannot add `presence` callbacks ... after
 * `subscribe()`") and which silently drops the channel's `presence.key`
 * config. Handing out only this listener-registration interface makes that
 * class of bug structurally impossible: all SDK-level bindings are registered
 * once, below, before the single `subscribe()` call.
 */
export type SessionChannel = {
  /** Register a listener for remote `edit` broadcasts. Returns an unregister fn. */
  onEdit: (listener: (payload: BroadcastEditPayload) => void) => () => void;
  /** Register a listener for presence `sync` events. Returns an unregister fn. */
  onPresenceSync: (listener: (state: PresenceState) => void) => () => void;
  /** Broadcast a local edit to the other clients in this session. */
  sendEdit: (payload: BroadcastEditPayload) => void;
  /**
   * Publish this client's presence meta. Safe to call before the channel has
   * finished joining -- the latest meta is remembered and (re)sent on every
   * SUBSCRIBED transition, so it also survives a reconnect.
   */
  track: (meta: PresenceMeta) => void;
};

function mapChannelStatus(status: string): ChannelStatus {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') return 'reconnecting';
  return 'connecting';
}

/**
 * Owns the one-and-only Realtime channel for a session: creates it, registers
 * both the broadcast and the presence binding on it, subscribes once, and
 * tears it down with `removeChannel()` (not just `unsubscribe()`, which leaves
 * the channel in the client's registry, where `supabase.channel()` would keep
 * handing the dead object back out).
 *
 * Creation waits for `userId` because the presence key is part of the channel's
 * construction params and -- thanks to the topic dedupe described on
 * `SessionChannel` -- cannot be amended afterwards.
 */
export function useSessionChannel(
  sessionId: string,
  userId: string | null,
): { channel: SessionChannel | null; status: ChannelStatus } {
  const [channel, setChannel] = useState<SessionChannel | null>(null);
  const [status, setStatus] = useState<ChannelStatus>('connecting');

  useEffect(() => {
    if (!userId) {
      setChannel(null);
      setStatus('connecting');
      return;
    }

    let disposed = false;
    const editListeners = new Set<(payload: BroadcastEditPayload) => void>();
    const presenceListeners = new Set<(state: PresenceState) => void>();
    let joined = false;
    let lastTrackedMeta: PresenceMeta | null = null;

    const realtime = supabase.channel(`session:${sessionId}`, {
      config: { presence: { key: userId } },
    });

    // Both bindings go on BEFORE subscribe() -- see SessionChannel's doc comment.
    realtime
      .on('broadcast', { event: 'edit' }, (message: { payload: BroadcastEditPayload }) => {
        for (const listener of editListeners) listener(message.payload);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = realtime.presenceState<PresenceMeta>() as PresenceState;
        for (const listener of presenceListeners) listener(state);
      });

    const api: SessionChannel = {
      onEdit(listener) {
        editListeners.add(listener);
        return () => {
          editListeners.delete(listener);
        };
      },
      onPresenceSync(listener) {
        presenceListeners.add(listener);
        return () => {
          presenceListeners.delete(listener);
        };
      },
      sendEdit(payload) {
        realtime.send({ type: 'broadcast', event: 'edit', payload });
      },
      track(meta) {
        lastTrackedMeta = meta;
        if (joined) void realtime.track(meta);
      },
    };

    setChannel(api);
    setStatus('connecting');

    realtime.subscribe((nextStatus: string) => {
      if (disposed) return;
      if (nextStatus === 'SUBSCRIBED') {
        joined = true;
        // Flush whatever presence meta the app wanted published while the
        // channel was still joining, and re-publish it after a reconnect.
        if (lastTrackedMeta) void realtime.track(lastTrackedMeta);
      } else {
        joined = false;
      }
      setStatus(mapChannelStatus(nextStatus));
    });

    return () => {
      disposed = true;
      joined = false;
      editListeners.clear();
      presenceListeners.clear();
      setChannel(null);
      // removeChannel() both unsubscribes and drops the channel from the
      // client's registry, so a remount creates a genuinely fresh channel
      // instead of getting the torn-down one back from the topic dedupe.
      void supabase.removeChannel(realtime);
    };
  }, [sessionId, userId]);

  return { channel, status };
}
