import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { debounce } from '../../lib/debounce';
import type { ChannelStatus, EditField, SessionChannel } from './useSessionChannel';

export type { EditField };
export type ConnectionStatus = ChannelStatus | 'write-failed' | 'auth-failed';

type SessionContent = { html: string; css: string; js: string };

type UseSessionResult = SessionContent & {
  loading: boolean;
  connectionStatus: ConnectionStatus;
  updateField: (field: EditField, value: string) => void;
};

const UPSERT_DEBOUNCE_MS = 400;
const BLANK_CONTENT: SessionContent = { html: '', css: '', js: '' };

/**
 * Session content: loads the row from Postgres, applies remote edits arriving
 * over the shared Realtime channel, and persists local edits back (debounced
 * per field).
 *
 * The channel is NOT created here -- `useSessionChannel` owns it and both this
 * hook and `usePresence` bind onto that single instance (see the comments in
 * useSessionChannel.ts for why creating it in two places is actively broken).
 */
export function useSession(
  sessionId: string,
  userId: string | null,
  channel: SessionChannel | null,
  channelStatus: ChannelStatus,
): UseSessionResult {
  const [content, setContent] = useState<SessionContent>(BLANK_CONTENT);
  const [loading, setLoading] = useState(true);
  // Set when Postgres rejects a write (RLS, the char_length constraint, a
  // dropped connection). Without this the user sees their edit applied locally
  // and broadcast to everyone else while it silently never lands in the row --
  // i.e. it is gone on reload, with no indication anything went wrong.
  const [writeFailed, setWriteFailed] = useState(false);

  // Kept in sync so the (stable) debounced persist closures below always
  // write to the session row that is actually mounted, even if sessionId
  // changes between renders. Updated from an effect rather than during
  // render so render stays pure.
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    // Don't read/create the row until real auth exists. Without this guard,
    // a cold visit (no persisted session yet) can run this select as role
    // `anon`; RLS filters rather than errors on select, so the result looks
    // identical to "no row yet" and the create-branch fires -- blanking an
    // existing session's content on the very first visit, or (once
    // ensureAnonymousSession() does resolve and the user starts typing)
    // broadcasting/persisting an empty edit over real shared content.
    if (!userId) return;

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
        const { error: writeError } = await supabase
          .from('sessions')
          .upsert({ id: sessionId, html: '', css: '', js: '' });
        if (!active) return;
        if (writeError) {
          console.error('codeshare: creating the session row failed', writeError);
          setWriteFailed(true);
        }
      }
      if (active) setLoading(false);
    }
    loadOrCreate();

    return () => {
      active = false;
    };
  }, [sessionId, userId]);

  // Apply edits from other clients. The channel-level binding itself is
  // registered once in useSessionChannel; this only adds/removes a listener,
  // so it is safe to (re)run whenever the channel or local identity changes.
  useEffect(() => {
    if (!channel) return;
    return channel.onEdit((payload) => {
      if (payload.userId === userId) return;
      setContent((prev) => ({ ...prev, [payload.field]: payload.value }));
    });
  }, [channel, userId]);

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
        void (async () => {
          const { error } = await supabase.from('sessions').upsert({
            id: sessionIdRef.current,
            [field]: value,
            updated_at: new Date().toISOString(),
          });
          if (error) {
            console.error(`codeshare: persisting ${field} failed`, error);
          }
          // `setWriteFailed` is a stable useState setter, so capturing it in
          // this once-created closure is safe. Clearing it on a successful
          // write means a recovered connection also clears the banner.
          setWriteFailed(Boolean(error));
        })();
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
      channel?.sendEdit({ field, value, userId });
    },
    [channel, persisters, userId],
  );

  // A failing write is more urgent for the user to know about than a
  // reconnecting socket (which recovers on its own), so it wins the banner.
  const connectionStatus: ConnectionStatus = writeFailed ? 'write-failed' : channelStatus;

  return { ...content, loading, connectionStatus, updateField };
}
