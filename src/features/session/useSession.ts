import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { debounce } from '../../lib/debounce';

export type EditField = 'html' | 'css' | 'js';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

type SessionContent = { html: string; css: string; js: string };

type BroadcastEditPayload = { field: EditField; value: string; userId: string | null };

type UseSessionResult = SessionContent & {
  loading: boolean;
  connectionStatus: ConnectionStatus;
  updateField: (field: EditField, value: string) => void;
};

const UPSERT_DEBOUNCE_MS = 400;
const BLANK_CONTENT: SessionContent = { html: '', css: '', js: '' };

function mapChannelStatus(status: string): ConnectionStatus {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') return 'reconnecting';
  return 'connecting';
}

export function useSession(sessionId: string, userId: string | null): UseSessionResult {
  const [content, setContent] = useState<SessionContent>(BLANK_CONTENT);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Kept in sync so the (stable) debounced persist closures below always
  // write to the session row that is actually mounted, even if sessionId
  // changes between renders. Updated from an effect rather than during
  // render so render stays pure.
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setContent(BLANK_CONTENT);

    async function loadOrCreate() {
      const { data, error } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!active) return;
      if (data) {
        setContent({ html: data.html, css: data.css, js: data.js });
      } else if (!error) {
        // Only create a blank row when we positively know none exists. On a
        // transient read error, `data` is also falsy — don't treat that as
        // "no row yet" and upsert blanks over an existing session's content.
        await supabase.from('sessions').upsert({ id: sessionId, html: '', css: '', js: '' });
      }
      if (active) setLoading(false);
    }
    loadOrCreate();

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('broadcast', { event: 'edit' }, ({ payload }: { payload: BroadcastEditPayload }) => {
        if (payload.userId === userId) return;
        setContent((prev) => ({ ...prev, [payload.field]: payload.value }));
      })
      .subscribe((status: string) => setConnectionStatus(mapChannelStatus(status)));
    channelRef.current = channel;

    return () => {
      active = false;
      channelRef.current = null;
      // The real RealtimeChannel exposes unsubscribe(); defensively optional-call
      // it so this also degrades gracefully against any lighter-weight channel stub.
      channel.unsubscribe?.();
    };
  }, [sessionId, userId]);

  // One independent debounced writer per field, created exactly once (lazy
  // useState initializer, so render stays pure). Using a single shared
  // debounce timer for all three fields would mean editing css shortly after
  // editing html cancels the still-pending html write (debounce only ever
  // remembers the latest call), silently dropping it from Postgres even
  // though the UI and other clients still show the edit. Per-field timers
  // make concurrent edits to different fields persist independently.
  const [persisters] = useState<Record<EditField, (value: string) => void>>(() => {
    const makePersister = (field: EditField) =>
      debounce((value: string) => {
        supabase.from('sessions').upsert({
          id: sessionIdRef.current,
          [field]: value,
          updated_at: new Date().toISOString(),
        });
      }, UPSERT_DEBOUNCE_MS);
    return {
      html: makePersister('html'),
      css: makePersister('css'),
      js: makePersister('js'),
    };
  });

  const updateField = useCallback(
    (field: EditField, value: string) => {
      setContent((prev) => ({ ...prev, [field]: value }));
      persisters[field](value);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'edit',
        payload: { field, value, userId } satisfies BroadcastEditPayload,
      });
    },
    [persisters, userId],
  );

  return { ...content, loading, connectionStatus, updateField };
}
