import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionChannel } from './useSessionChannel';

export type PresenceUser = { userId: string; name: string; status: 'online' | 'away' };

function defaultName(userId: string): string {
  return `User_${userId.slice(0, 4)}`;
}

/**
 * Who is in the room, via Supabase Presence on the session's shared Realtime
 * channel. The channel is created by `useSessionChannel` and passed in -- this
 * hook deliberately cannot create or re-bind one, because `supabase.channel()`
 * dedupes by topic and adding a presence binding to the already-subscribed
 * session channel throws in the real SDK (see useSessionChannel.ts).
 */
export function usePresence(userId: string | null, channel: SessionChannel | null) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [name, setNameState] = useState('');
  // Both refs below are updated from effects rather than during render so
  // render stays pure; they are only read from event handlers, which always
  // run after the commit that updated them.
  const channelRef = useRef<SessionChannel | null>(channel);
  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);
  // Kept in sync so the visibilitychange handler and the initial `track` call
  // below -- both set up once per [userId, channel] and otherwise closing over
  // `name` as it was at that render -- always track the user's *current*
  // display name instead of silently reverting a custom name (set via
  // `setName`) back to the default on every tab blur/focus.
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    if (!userId) return;
    setNameState((prev) => prev || defaultName(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId || !channel) return;

    const stopListening = channel.onPresenceSync((state) => {
      setUsers(
        Object.entries(state).map(([id, metas]) => ({
          userId: id,
          name: metas[0]?.name ?? defaultName(id),
          status: metas[0]?.status ?? 'online',
        })),
      );
    });

    // `track` is queued by the channel until it has actually joined, and
    // re-sent on reconnect, so this does not need to wait for SUBSCRIBED.
    channel.track({ name: nameRef.current || defaultName(userId), status: 'online' });

    const handleVisibility = () => {
      channel.track({
        name: nameRef.current || defaultName(userId),
        status: document.visibilityState === 'visible' ? 'online' : 'away',
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopListening();
    };
  }, [userId, channel]);

  const setName = useCallback((next: string) => {
    setNameState(next);
    channelRef.current?.track({ name: next, status: 'online' });
  }, []);

  return { users, name, setName };
}
