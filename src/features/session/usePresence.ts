import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type PresenceUser = { userId: string; name: string; status: 'online' | 'away' };

type PresenceMeta = { name: string; status: 'online' | 'away' };

function defaultName(userId: string): string {
  return `User_${userId.slice(0, 4)}`;
}

export function usePresence(sessionId: string, userId: string | null) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [name, setNameState] = useState('');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    setNameState((prev) => prev || defaultName(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`session:${sessionId}`, { config: { presence: { key: userId } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceMeta>();
      setUsers(
        Object.entries(state).map(([id, metas]) => ({
          userId: id,
          name: metas[0]?.name ?? defaultName(id),
          status: metas[0]?.status ?? 'online',
        })),
      );
    });
    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ name: name || defaultName(userId), status: 'online' });
      }
    });
    channelRef.current = channel;

    const handleVisibility = () => {
      channel.track({
        name: name || defaultName(userId),
        status: document.visibilityState === 'visible' ? 'online' : 'away',
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      channelRef.current = null;
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId]);

  const setName = useCallback((next: string) => {
    setNameState(next);
    channelRef.current?.track({ name: next, status: 'online' });
  }, []);

  return { users, name, setName };
}
