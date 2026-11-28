import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthUser } from '../features/auth/useAuthUser';
import AuthModal from '../features/auth/AuthModal';
import styles from './MyRooms.module.scss';

type RoomRow = {
  id: string;
  title: string | null;
  is_private: boolean;
  session_type: string | null;
  created_at: string;
  updated_at: string;
};

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rooms: RoomRow[] };

function displayTitle(room: RoomRow): string {
  if (room.title) return room.title;
  return room.session_type === 'react' ? 'Untitled React Room' : 'Untitled Web Room';
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
 * Lists the rooms the logged-in user owns, most recently updated first.
 * RLS already limits `sessions` reads to public rooms plus the caller's own
 * private ones; the `owner_id` filter narrows that to "mine". Anonymous
 * visitors can't own rooms in a meaningful way (see the private-rooms spec),
 * so they get a login prompt instead of a query.
 */
export default function MyRooms() {
  const { userId, isAnonymous, loading } = useAuthUser();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [list, setList] = useState<ListState>({ status: 'loading' });

  useEffect(() => {
    if (loading || isAnonymous || !userId) return;
    let active = true;
    setList({ status: 'loading' });
    (async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, title, is_private, session_type, created_at, updated_at')
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

  if (loading) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>My Rooms</h1>
        <Link to="/" className={styles.homeLink}>
          New room
        </Link>
      </header>

      {isAnonymous ? (
        <div className={styles.notice}>
          <p>Log in to see your rooms.</p>
          <button type="button" className={styles.loginButton} onClick={() => setAuthModalOpen(true)}>
            Log in
          </button>
          <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} initialMode="login" />
        </div>
      ) : list.status === 'loading' ? (
        <p className={styles.notice}>Loading…</p>
      ) : list.status === 'error' ? (
        <p className={styles.notice} role="alert">
          Couldn&rsquo;t load your rooms. Try refreshing the page.
        </p>
      ) : list.rooms.length === 0 ? (
        <p className={styles.notice}>No rooms yet — create one from the home page.</p>
      ) : (
        <ul className={styles.list}>
          {list.rooms.map((room) => (
            <li key={room.id}>
              <Link to={`/code/${room.id}`} className={styles.row}>
                <span className={styles.title}>{displayTitle(room)}</span>
                <span className={styles.meta}>
                  <span className={styles.badge}>{room.session_type === 'react' ? 'React' : 'Web'}</span>
                  <span className={room.is_private ? styles.badgePrivate : styles.badge}>
                    {room.is_private ? 'Private' : 'Public'}
                  </span>
                  <time className={styles.time} dateTime={room.updated_at}>
                    {relativeTime(room.updated_at)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
