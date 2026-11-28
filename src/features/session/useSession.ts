import { useCallback, useEffect, useRef, useState } from 'react';
import { ROOMS_CLAIMED_EVENT, supabase, type RoomsClaimedDetail } from '../../lib/supabase';
import { debounce } from '../../lib/debounce';
import { titleFromCode } from '../../lib/titleFromCode';
import type { ChannelStatus, EditField, SessionChannel } from './useSessionChannel';
import { isSessionType, type SessionType } from './sessionType';

export type { EditField };
export type ConnectionStatus = ChannelStatus | 'write-failed' | 'auth-failed';

type SessionContent = {
  html: string;
  css: string;
  js: string;
  app_jsx: string;
  components_jsx: string;
  react_css: string;
};

type UseSessionResult = SessionContent & {
  loading: boolean;
  connectionStatus: ConnectionStatus;
  updateField: (field: EditField, value: string) => void;
  sessionType: SessionType;
};

// The structural field whose content a session's title is derived from, per
// session type. js/css/components_jsx/react_css never affect the title.
const TITLE_SOURCE_TYPE: Partial<Record<EditField, SessionType>> = {
  html: 'web',
  app_jsx: 'react',
};

const UPSERT_DEBOUNCE_MS = 400;
const BLANK_CONTENT: SessionContent = {
  html: '',
  css: '',
  js: '',
  app_jsx: '',
  components_jsx: '',
  react_css: '',
};

const STARTER_CONTENT_WEB: SessionContent = {
  ...BLANK_CONTENT,
  html: '<h1>Welcome to CodeShare 👋</h1>\n<p>Start typing — everyone on this link sees it live.</p>',
  css: 'body {\n  font-family: sans-serif;\n  padding: 2rem;\n  color: #222;\n}',
  js: "console.log('Welcome to CodeShare!');",
};

const STARTER_CONTENT_REACT: SessionContent = {
  ...BLANK_CONTENT,
  app_jsx: 'function App() {\n  return <h1>Welcome to CodeShare 👋</h1>;\n}',
  components_jsx: '// Shared components go here, in the same scope as App.jsx.',
  react_css: 'body {\n  font-family: sans-serif;\n  padding: 2rem;\n  color: #222;\n}',
};

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
  // No longer affects anything here (new rooms are public for everyone);
  // kept so callers and tests keep one signature. RLS is what stops an
  // anonymous user from making a room private.
  _isAnonymous: boolean,
  channel: SessionChannel | null,
  channelStatus: ChannelStatus,
  typeHint: SessionType,
  privacyHint: boolean | null,
): UseSessionResult & {
  isPrivate: boolean;
  ownerId: string | null;
  title: string;
  setPrivacy: (next: boolean) => Promise<void>;
  // True once the owner made this room private while this (non-owner) client
  // had it open. The caller must stop showing the room: see SessionRoute.
  accessRevoked: boolean;
} {
  const [content, setContent] = useState<SessionContent>(BLANK_CONTENT);
  const [loading, setLoading] = useState(true);
  const [sessionType, setSessionType] = useState<SessionType>(typeHint);
  const [isPrivate, setIsPrivate] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [accessRevoked, setAccessRevoked] = useState(false);
  // Bumped when a login moved this room to the new account (loginWithPassword
  // redeems the anonymous user's room claim). The login itself changes
  // `userId`, which already reloads the row -- but that read can land before
  // the handover commits and come back with the old owner. Reloading after
  // the claim guarantees the row (owner, privacy) is read fresh.
  const [reloadKey, setReloadKey] = useState(0);
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

  // Mirrors `content` so the persister closures below (created once, see the
  // lazy useState initializer further down) can read the LATEST full content
  // -- not whatever was in scope when the closure was created -- when
  // recomputing a title alongside a structural-field write. Same discipline
  // as `sessionIdRef` above, for the same reason: a once-created closure
  // over `content` directly would go stale the moment content changes again.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

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
        const resolvedType = isSessionType(data.session_type) ? data.session_type : 'web';
        setSessionType(resolvedType);
        setContent({
          html: data.html,
          css: data.css,
          js: data.js,
          // `?? ''` is defensive, not a live fix: the migration defaults
          // these three to '' and NOT NULL. It guards rows written before
          // those columns existed (and any hand-written row) from putting a
          // null into a `string`-typed field, which CodeMirror would then
          // receive as a non-string doc.
          app_jsx: data.app_jsx ?? '',
          components_jsx: data.components_jsx ?? '',
          react_css: data.react_css ?? '',
        });
        setIsPrivate(Boolean(data.is_private));
        setOwnerId(data.owner_id ?? null);
        setTitle(data.title ?? '');
      } else if (!error) {
        // Only create a blank row when we positively know none exists. On a
        // transient read error, `data` is also falsy — don't treat that as
        // "no row yet" and upsert blanks over an existing session's content.
        const starter = typeHint === 'react' ? STARTER_CONTENT_REACT : STARTER_CONTENT_WEB;
        // Every new room is public unless the creation URL explicitly asked
        // for private (privacyHint, from the Landing toggle) -- logged in or
        // not. The owner can make it private later. The creator is recorded as
        // owner even when anonymous: signing up converts that anonymous user
        // in place (same id -- see signUpWithEmail), so they can then make
        // the room private. RLS still refuses is_private for an anonymous JWT.
        const newIsPrivate = privacyHint ?? false;
        const newOwnerId = userId;
        const newTitle = titleFromCode(typeHint, starter);
        const { error: writeError } = await supabase.from('sessions').upsert({
          id: sessionId,
          session_type: typeHint,
          is_private: newIsPrivate,
          owner_id: newOwnerId,
          title: newTitle,
          ...starter,
        });
        if (!active) return;
        if (writeError) {
          console.error('codeshare: creating the session row failed', writeError);
          setWriteFailed(true);
        } else {
          setSessionType(typeHint);
          setContent(starter);
          setIsPrivate(newIsPrivate);
          setOwnerId(newOwnerId);
          setTitle(newTitle);
        }
      }
      if (active) setLoading(false);
    }
    loadOrCreate();

    return () => {
      active = false;
    };
  }, [sessionId, userId, reloadKey]);

  useEffect(() => {
    function handleClaimed(event: Event) {
      const { roomIds } = (event as CustomEvent<RoomsClaimedDetail>).detail;
      if (roomIds.includes(sessionId)) setReloadKey((k) => k + 1);
    }
    window.addEventListener(ROOMS_CLAIMED_EVENT, handleClaimed);
    return () => window.removeEventListener(ROOMS_CLAIMED_EVENT, handleClaimed);
  }, [sessionId]);

  // Apply edits from other clients. The channel-level binding itself is
  // registered once in useSessionChannel; this only adds/removes a listener,
  // so it is safe to (re)run whenever the channel or local identity changes.
  //
  // Only this tab's own echoes are skipped, by clientId. Skipping by userId
  // (as this used to) also dropped edits from the same account's other tabs,
  // so two tabs of one user never saw each other's typing.
  const [clientId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  );
  useEffect(() => {
    if (!channel) return;
    return channel.onEdit((payload) => {
      if (payload.clientId === clientId) return;
      setContent((prev) => ({ ...prev, [payload.field]: payload.value }));
    });
  }, [channel, clientId]);

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
          const row: Record<string, unknown> = {
            id: sessionIdRef.current,
            [field]: value,
            updated_at: new Date().toISOString(),
          };
          // Only html (web) and app_jsx (react) are "structural" -- the
          // fields titleFromCode actually reads. js/css/components_jsx/
          // react_css edits never touch the title. Reads `contentRef.current`
          // (not the `content` closed over when this persister was created
          // -- see the comment on contentRef above) merged with this write's
          // own `value`, so the title is always derived from the LATEST full
          // content, not a stale snapshot from whenever this once-created
          // debounced closure happened to be built.
          const titleType = TITLE_SOURCE_TYPE[field];
          let nextTitle: string | undefined;
          if (titleType) {
            nextTitle = titleFromCode(titleType, { ...contentRef.current, [field]: value });
            row.title = nextTitle;
          }
          const { error } = await supabase.from('sessions').upsert(row);
          if (error) {
            console.error(`codeshare: persisting ${field} failed`, error);
          } else if (nextTitle !== undefined) {
            setTitle(nextTitle);
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
      app_jsx: makePersister('app_jsx'),
      components_jsx: makePersister('components_jsx'),
      react_css: makePersister('react_css'),
    };
  });

  const updateField = useCallback(
    (field: EditField, value: string) => {
      setContent((prev) => ({ ...prev, [field]: value }));
      persisters[field](value);
      channel?.sendEdit({ field, value, userId, clientId });
    },
    [channel, persisters, userId, clientId],
  );

  // Flips a room's visibility later (vs. the create-time default above). No
  // client-side "am I the owner" guard needed: the migrations enforce
  // ownership server-side via RLS plus a trigger, and a rejection surfaces the
  // same way every other rejected write in this file does -- via `writeFailed`.
  //
  // An UPDATE, deliberately not an upsert: Postgres checks an upsert's
  // proposed row ({ id, is_private }, owner_id unset) against the INSERT
  // policy, which refuses private-without-owner -- so an upsert rejected
  // every private flip, even the owner's. `.select('id')` is there because
  // RLS can also filter an update to zero rows *without* an error.
  //
  // On success it announces the change on the channel *before* updating
  // local state: flipping isPrivate moves this client to the other Realtime
  // topic (see useSessionChannel), which tears down the channel the
  // announcement has to go out on. Viewers who are not the owner react by
  // leaving the room (accessRevoked below); the owner's other tabs follow.
  const channelRef = useRef(channel);
  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

  const setPrivacy = useCallback(async (next: boolean) => {
    const { data, error } = await supabase
      .from('sessions')
      .update({ is_private: next })
      .eq('id', sessionIdRef.current)
      .select('id');
    const failed = Boolean(error) || !data || data.length === 0;
    if (error) console.error('codeshare: changing room privacy failed', error);
    if (!failed) {
      try {
        await channelRef.current?.sendPrivacy({ isPrivate: next });
      } catch (sendError) {
        // The row is already private, so RLS and the topic move still protect
        // it; only the polite "you've lost access" notice was lost.
        console.error('codeshare: announcing the privacy change failed', sendError);
      }
    }
    setIsPrivate((prev) => (failed ? prev : next));
    setWriteFailed(failed);
  }, []);

  // Someone else changed this room's privacy. For the owner (another of their
  // tabs) just mirror it. For anyone else, a room going private means they no
  // longer have access: RLS already refuses their reads/writes and the owner
  // has moved to the owner-only topic, so this only makes the UI say so
  // instead of silently freezing.
  const ownerIdRef = useRef(ownerId);
  useEffect(() => {
    ownerIdRef.current = ownerId;
  }, [ownerId]);
  useEffect(() => {
    if (!channel) return;
    return channel.onPrivacy(({ isPrivate: nextIsPrivate }) => {
      const isOwner = ownerIdRef.current !== null && ownerIdRef.current === userId;
      if (isOwner) {
        setIsPrivate(nextIsPrivate);
      } else if (nextIsPrivate) {
        setAccessRevoked(true);
      }
    });
  }, [channel, userId]);

  // A failing write is more urgent for the user to know about than a
  // reconnecting socket (which recovers on its own), so it wins the banner.
  const connectionStatus: ConnectionStatus = writeFailed ? 'write-failed' : channelStatus;

  return { ...content, loading, connectionStatus, updateField, sessionType, isPrivate, ownerId, title, setPrivacy, accessRevoked };
}
