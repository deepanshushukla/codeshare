import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Atom, Code2, Globe, Lock, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthUser } from '../features/auth/useAuthUser';
import AuthModal from '../features/auth/AuthModal';
import AccountMenu from '../features/auth/AccountMenu';
import { isGenericTitle } from '../lib/titleFromCode';
import NewRoomButton from './NewRoomButton';
import styles from './MyRooms.module.scss';

type RoomRow = {
  id: string;
  title: string | null;
  name?: string | null;
  is_private: boolean;
  session_type: string | null;
  created_at: string;
  updated_at: string;
};

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rooms: RoomRow[] };

type Filter = 'all' | 'public' | 'private';

function typeName(room: RoomRow): string {
  return room.session_type === 'react' ? 'React' : 'Web';
}

/**
 * Display names for the list. A room whose title is still generic (empty,
 * the starter "Welcome to CodeShare 👋", or "Untitled …") would read the same
 * as every other one, so those are numbered per type in creation order:
 * "Web Room 1", "Web Room 2", "React Room 1". Numbering uses the full list,
 * not the filtered view, so a room keeps its number while filtering.
 */
function buildDisplayTitles(rooms: RoomRow[]): Map<string, string> {
  const titles = new Map<string, string>();
  const counters: Record<string, number> = {};
  const oldestFirst = [...rooms].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const room of oldestFirst) {
    const chosen = room.name?.trim();
    if (chosen) {
      titles.set(room.id, chosen);
    } else if (room.title && !isGenericTitle(room.title)) {
      titles.set(room.id, room.title);
    } else {
      const kind = typeName(room);
      counters[kind] = (counters[kind] ?? 0) + 1;
      titles.set(room.id, `${kind} Room ${counters[kind]}`);
    }
  }
  return titles;
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

function relativeTime(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (Number.isNaN(seconds)) return '';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/**
 * Lists the rooms the logged-in user owns, most recently updated first, and
 * lets the owner flip each one between Public and Private.
 * RLS already limits `sessions` reads to public rooms plus the caller's own
 * private ones; the `owner_id` filter narrows that to "mine". The privacy
 * update is guarded server-side too (RLS + the owner-only trigger in
 * 0003_private_rooms.sql), so a failed update just rolls the switch back.
 * Anonymous visitors can't own rooms in a meaningful way (see the
 * private-rooms spec), so they get a login prompt instead of a query.
 */
export default function MyRooms() {
  const { userId, isAnonymous, loading } = useAuthUser();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || isAnonymous || !userId) return;
    let active = true;
    setList({ status: 'loading' });
    (async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, title, name, is_private, session_type, created_at, updated_at')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false });
      if (!active) return;
      if (error) {
        console.error('codeshare: failed to load rooms', error);
        setList({ status: 'error' });
      } else {
        setList({ status: 'ready', rooms: (data ?? []) as RoomRow[] });
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, isAnonymous, loading]);

  const rooms = list.status === 'ready' ? list.rooms : [];
  const titles = useMemo(() => buildDisplayTitles(rooms), [rooms]);
  const displayTitle = (room: RoomRow) => titles.get(room.id) ?? `${typeName(room)} Room`;
  const counts = useMemo(
    () => ({
      all: rooms.length,
      public: rooms.filter((r) => !r.is_private).length,
      private: rooms.filter((r) => r.is_private).length,
    }),
    [rooms],
  );
  const visibleRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rooms.filter((room) => {
      if (filter === 'public' && room.is_private) return false;
      if (filter === 'private' && !room.is_private) return false;
      if (!needle) return true;
      const title = titles.get(room.id) ?? '';
      return title.toLowerCase().includes(needle) || room.id.toLowerCase().includes(needle);
    });
  }, [rooms, titles, filter, query]);

  function setRoomPrivacy(id: string, next: boolean) {
    setList((prev) =>
      prev.status === 'ready'
        ? { ...prev, rooms: prev.rooms.map((r) => (r.id === id ? { ...r, is_private: next } : r)) }
        : prev,
    );
  }

  async function togglePrivacy(room: RoomRow) {
    const next = !room.is_private;
    setToggleError(null);
    setPending((prev) => new Set(prev).add(room.id));
    setRoomPrivacy(room.id, next);
    const { data, error } = await supabase.from('sessions').update({ is_private: next }).eq('id', room.id).select('id');
    const failed = Boolean(error) || !data || data.length === 0;
    if (failed) {
      if (error) console.error('codeshare: changing room privacy failed', error);
      setRoomPrivacy(room.id, room.is_private);
      setToggleError(`Couldn’t make “${displayTitle(room)}” ${next ? 'private' : 'public'}. Try again.`);
    }
    setPending((prev) => {
      const copy = new Set(prev);
      copy.delete(room.id);
      return copy;
    });
  }

  if (loading) return null;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.brandBracket}>{'{'}</span>
            CodeShare
            <span className={styles.brandBracket}>{'}'}</span>
          </Link>
          <AccountMenu />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Dashboard</p>
            <h1 className={styles.heading}>My Rooms</h1>
            <p className={styles.subtitle}>
              Every room you created while logged in. Switch a room to <strong>Private</strong> and only you can open it.
            </p>
          </div>
          <NewRoomButton className={styles.newRoom} />
        </div>

        {isAnonymous ? (
          <div className={styles.emptyCard}>
            <Lock size={28} aria-hidden="true" className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>Log in to see your rooms.</p>
            <p className={styles.emptyText}>Rooms you create while logged in are saved here, and you can make them private.</p>
            <button type="button" className={styles.newRoom} onClick={() => setAuthModalOpen(true)}>
              Log in
            </button>
            <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} initialMode="login" />
          </div>
        ) : list.status === 'loading' ? (
          <div className={styles.grid} aria-busy="true" aria-label="Loading rooms">
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        ) : list.status === 'error' ? (
          <div className={styles.emptyCard} role="alert">
            <p className={styles.emptyTitle}>Couldn&rsquo;t load your rooms.</p>
            <p className={styles.emptyText}>Try refreshing the page.</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className={styles.emptyCard}>
            <Code2 size={28} aria-hidden="true" className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>No rooms yet — start your first one.</p>
            <NewRoomButton className={styles.newRoom} />
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <div className={styles.filters} role="group" aria-label="Filter rooms">
                {(['all', 'public', 'private'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.filter}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {key === 'all' ? 'All' : key === 'public' ? 'Public' : 'Private'}
                    <span className={styles.filterCount}>{counts[key]}</span>
                  </button>
                ))}
              </div>
              <label className={styles.search}>
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search rooms"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search rooms"
                />
              </label>
            </div>

            {toggleError && (
              <p className={styles.toggleError} role="alert">
                {toggleError}
              </p>
            )}

            {visibleRooms.length === 0 ? (
              <div className={styles.emptyCard}>
                <p className={styles.emptyTitle}>No rooms match.</p>
              </div>
            ) : (
              <ul className={styles.grid}>
                {visibleRooms.map((room) => {
                  const isReact = room.session_type === 'react';
                  const busy = pending.has(room.id);
                  return (
                    <li key={room.id} className={styles.card} data-private={room.is_private || undefined}>
                      <div className={styles.cardTop}>
                        <span className={styles.typeIcon} aria-hidden="true">
                          {isReact ? <Atom size={18} /> : <Code2 size={18} />}
                        </span>
                        <span className={styles.typeLabel}>{isReact ? 'React' : 'Web'}</span>
                        <span className={room.is_private ? styles.badgePrivate : styles.badge}>
                          {room.is_private ? <Lock size={11} aria-hidden="true" /> : <Globe size={11} aria-hidden="true" />}
                          {room.is_private ? 'Private' : 'Public'}
                        </span>
                      </div>

                      <Link to={`/code/${room.id}`} className={styles.title}>
                        {displayTitle(room)}
                      </Link>
                      <p className={styles.roomId}>/code/{room.id}</p>

                      <div className={styles.cardFooter}>
                        <time className={styles.time} dateTime={room.updated_at}>
                          Edited {relativeTime(room.updated_at)}
                        </time>
                        <label className={styles.switchLabel}>
                          <span>Private</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={room.is_private}
                            aria-label={`Private: ${displayTitle(room)}`}
                            className={styles.switch}
                            disabled={busy}
                            onClick={() => togglePrivacy(room)}
                          >
                            <span className={styles.switchThumb} />
                          </button>
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
