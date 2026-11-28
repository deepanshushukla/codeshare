import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSession } from './useSession';
import { useSessionChannel } from './useSessionChannel';
import { maybeSingle, mockConfig, resetSupabaseMock, soleChannel, update, upsert } from '../../test/supabaseMock';
import type { SessionType } from './sessionType';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

// Renders useSession on top of the real useSessionChannel, the way
// SessionWorkspace does, against the shared Supabase mock -- so these tests
// exercise the actual channel wiring instead of a bespoke channel stub.
function renderSession(
  sessionId: string,
  userId: string | null = 'user-1',
  typeHint: SessionType = 'web',
  isAnonymous = false,
  privacyHint: boolean | null = null,
) {
  return renderHook(() => {
    const { channel, status } = useSessionChannel(sessionId, userId);
    return useSession(sessionId, userId, isAnonymous, channel, status, typeHint, privacyHint);
  });
}

describe('useSession', () => {
  test('does not read/create the row until userId is set, then loads once it is', async () => {
    // Regression guard: the load effect must not run while unauthenticated.
    // Reading as role `anon` would have RLS filter the select to an empty
    // result, indistinguishable from "no row yet" -- so an existing room
    // opened in a fresh browser would look blank and the create-branch would
    // (be denied and) risk overwriting real content once auth did resolve.
    mockConfig.sessionRow = { id: 'late-auth-room', html: '<p>existing</p>', css: '', js: '' };
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) => {
        const { channel, status } = useSessionChannel('late-auth-room', userId);
        return useSession('late-auth-room', userId, false, channel, status, 'web', null);
      },
      { initialProps: { userId: null as string | null } },
    );

    expect(maybeSingle).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);

    rerender({ userId: 'user-1' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('<p>existing</p>');
    expect(upsert).not.toHaveBeenCalled();
  });

  test('creates a row with starter content when the session does not exist yet', async () => {
    mockConfig.sessionRow = null;
    const { result } = renderSession('new-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toContain('Welcome to CodeShare');
    expect(result.current.js).toContain('console.log');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-room' }));
  });

  test('loads existing content instead of resetting it when the session already exists', async () => {
    mockConfig.sessionRow = { id: 'existing-room', html: '<p>hi</p>', css: 'p{}', js: 'console.log(1)' };
    const { result } = renderSession('existing-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('<p>hi</p>');
    expect(result.current.css).toBe('p{}');
    expect(result.current.js).toBe('console.log(1)');
    // The existing-row path must not re-create/overwrite the row with blanks.
    expect(upsert).not.toHaveBeenCalled();
  });

  test('does not blank an existing row when the initial read errors transiently', async () => {
    mockConfig.sessionRow = null;
    mockConfig.selectError = { message: 'network blip' };
    const { result } = renderSession('flaky-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    // A failed read must never be treated as "no row yet" -- that would upsert
    // blanks over a session that may well already have content in Postgres.
    expect(upsert).not.toHaveBeenCalled();
  });

  test('updating one field does not change the in-memory value of another field', async () => {
    mockConfig.sessionRow = { id: 'room', html: '<p>a</p>', css: 'body{}', js: '1' };
    const { result } = renderSession('room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.updateField('css', 'body{color:red}'));
    expect(result.current.html).toBe('<p>a</p>');
    expect(result.current.js).toBe('1');
    expect(result.current.css).toBe('body{color:red}');
  });

  test('rapid edits to different fields are both persisted, not clobbered by a shared debounce timer', async () => {
    mockConfig.sessionRow = { id: 'room2', html: '<p>a</p>', css: 'body{}', js: '1' };
    const { result } = renderSession('room2');
    await waitFor(() => expect(result.current.loading).toBe(false));
    upsert.mockClear();

    vi.useFakeTimers();
    try {
      // Edit html, then css, before either debounce window has elapsed. If both
      // fields shared a single debounce timer, the html write would be cancelled
      // and silently dropped when the css write re-armed the timer.
      act(() => {
        result.current.updateField('html', '<p>b</p>');
        result.current.updateField('css', 'body{color:red}');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'room2', html: '<p>b</p>' }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'room2', css: 'body{color:red}' }));
  });

  test('broadcasts an edit to the realtime channel so other clients can apply it', async () => {
    mockConfig.sessionRow = { id: 'room3', html: '', css: '', js: '' };
    const { result } = renderSession('room3');
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateField('js', 'console.log(2)'));

    expect(soleChannel().send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'edit',
        payload: expect.objectContaining({ field: 'js', value: 'console.log(2)', userId: 'user-1', clientId: expect.any(String) }),
      }),
    );
  });

  test("ignores only this tab's own echoed edits, not edits from the same user in another tab", async () => {
    mockConfig.sessionRow = { id: 'room4', html: '<p>a</p>', css: '', js: '' };
    const { result } = renderSession('room4');
    await waitFor(() => expect(result.current.loading).toBe(false));
    const channel = soleChannel();

    // Learn this tab's clientId from an edit it broadcasts.
    act(() => result.current.updateField('css', 'b{}'));
    const sent = channel.send.mock.calls.at(-1)![0].payload as { clientId: string };
    expect(typeof sent.clientId).toBe('string');

    act(() => channel.emitBroadcast('edit', { field: 'html', value: '<p>own echo</p>', userId: 'user-1', clientId: sent.clientId }));
    expect(result.current.html).toBe('<p>a</p>');

    // Same account, different tab: must apply (this used to be dropped).
    act(() => channel.emitBroadcast('edit', { field: 'html', value: '<p>my other tab</p>', userId: 'user-1', clientId: 'another-tab' }));
    expect(result.current.html).toBe('<p>my other tab</p>');

    act(() => channel.emitBroadcast('edit', { field: 'html', value: '<p>from-other</p>', userId: 'user-2', clientId: 'x' }));
    expect(result.current.html).toBe('<p>from-other</p>');
  });

  test('reports connected once the shared channel is subscribed and writes succeed', async () => {
    mockConfig.sessionRow = { id: 'room5', html: '', css: '', js: '' };
    const { result } = renderSession('room5');
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));
  });

  test('surfaces a rejected debounced write instead of swallowing it', async () => {
    mockConfig.sessionRow = { id: 'room6', html: '', css: '', js: '' };
    const { result } = renderSession('room6');
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    // e.g. an RLS denial or the html/css/js char_length(...) < 200000 check.
    mockConfig.upsertResult = { error: { message: 'new row violates check constraint' } };
    vi.useFakeTimers();
    try {
      act(() => result.current.updateField('html', 'x'.repeat(10)));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(result.current.connectionStatus).toBe('write-failed');

    // ...and a later successful write clears it again.
    mockConfig.upsertResult = { error: null };
    vi.useFakeTimers();
    try {
      act(() => result.current.updateField('html', 'y'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(result.current.connectionStatus).toBe('connected');
  });

  test('surfaces a rejected create-the-row write on first load', async () => {
    mockConfig.sessionRow = null;
    mockConfig.upsertResult = { error: { message: 'permission denied for table sessions' } };
    const { result } = renderSession('denied-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectionStatus).toBe('write-failed');
  });

  test('creates a React session with React starter content when no row exists and typeHint is react', async () => {
    mockConfig.sessionRow = null;
    const { result } = renderSession('new-react-room', 'user-1', 'react');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-react-room',
        session_type: 'react',
        app_jsx: expect.any(String),
        components_jsx: expect.any(String),
        react_css: expect.any(String),
      }),
    );
    const call = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(call.app_jsx).not.toBe('');
    expect(call.components_jsx).not.toBe('');
    expect(call.react_css).not.toBe('');
    expect(result.current.sessionType).toBe('react');
  });

  test("loads an existing session's session_type from the row, ignoring typeHint", async () => {
    const row = {
      id: 'react-existing-room',
      html: '',
      css: '',
      js: '',
      session_type: 'react',
      app_jsx: 'x',
      components_jsx: 'y',
      react_css: 'z',
    };
    mockConfig.sessionRow = row;
    const { result } = renderSession('react-existing-room', 'user-1', 'web');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessionType).toBe('react');
    expect(result.current.app_jsx).toBe('x');
  });

  test('updateField persists app_jsx the same debounced way as html', async () => {
    const persistRow = {
      id: 'react-room-persist',
      html: '',
      css: '',
      js: '',
      session_type: 'react',
      app_jsx: '',
      components_jsx: '',
      react_css: '',
    };
    mockConfig.sessionRow = persistRow;
    const { result } = renderSession('react-room-persist', 'user-1', 'react');
    await waitFor(() => expect(result.current.loading).toBe(false));
    upsert.mockClear();

    vi.useFakeTimers();
    try {
      act(() => result.current.updateField('app_jsx', 'const x = 1'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'react-room-persist',
        app_jsx: 'const x = 1',
        updated_at: expect.any(String),
      }),
    );
  });

  test('surfaces write-failed when a React field write is rejected', async () => {
    const failRow = {
      id: 'react-room-fail',
      html: '',
      css: '',
      js: '',
      session_type: 'react',
      app_jsx: '',
      components_jsx: '',
      react_css: '',
    };
    mockConfig.sessionRow = failRow;
    const { result } = renderSession('react-room-fail', 'user-1', 'react');
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    mockConfig.upsertResult = { error: { message: 'new row violates check constraint' } };
    vi.useFakeTimers();
    try {
      act(() => result.current.updateField('app_jsx', 'const x = 1'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(result.current.connectionStatus).toBe('write-failed');
  });

  test('a new room created by a real (non-anonymous) user is public by default too, with owner_id set', async () => {
    mockConfig.sessionRow = null;
    renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ is_private: false, owner_id: 'u1' }));
  });

  test('a new room created by an anonymous user defaults to public but records them as owner, so signing up (same id) lets them make it private', async () => {
    mockConfig.sessionRow = null;
    renderHook(() => useSession('room1', 'anon-1', true, null, 'connected', 'web', null));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ is_private: false, owner_id: 'anon-1' }));
  });

  test('an explicit privacyHint overrides the isAnonymous-derived default', async () => {
    mockConfig.sessionRow = null;
    renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', false));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ is_private: false, owner_id: 'u1' }));
  });

  test('a new room is created with a generated title from its starter content', async () => {
    mockConfig.sessionRow = null;
    renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }));
  });

  test('re-reads the row after a login moved this room to the new account', async () => {
    mockConfig.sessionRow = { id: 'claimed-room', html: '', css: '', js: '', is_private: false, owner_id: 'anon-1' };
    const { result } = renderSession('claimed-room', 'real-1');
    await waitFor(() => expect(result.current.ownerId).toBe('anon-1'));

    // The handover committed: the row now belongs to the account, private.
    mockConfig.sessionRow = { id: 'claimed-room', html: '', css: '', js: '', is_private: true, owner_id: 'real-1' };
    act(() => {
      window.dispatchEvent(new CustomEvent('codeshare:rooms-claimed', { detail: { roomIds: ['claimed-room'] } }));
    });

    await waitFor(() => expect(result.current.ownerId).toBe('real-1'));
    expect(result.current.isPrivate).toBe(true);
  });

  test('ignores a handover that did not include this room', async () => {
    mockConfig.sessionRow = { id: 'other-room', html: '', css: '', js: '', owner_id: 'someone' };
    const { result } = renderSession('other-room', 'real-1');
    await waitFor(() => expect(result.current.loading).toBe(false));
    const reads = maybeSingle.mock.calls.length;

    act(() => {
      window.dispatchEvent(new CustomEvent('codeshare:rooms-claimed', { detail: { roomIds: ['claimed-room'] } }));
    });

    expect(maybeSingle.mock.calls.length).toBe(reads);
  });

  test('loading an existing row surfaces isPrivate/ownerId/title from it', async () => {
    mockConfig.sessionRow = { id: 'room1', html: '<h1>Hi</h1>', css: '', js: '', is_private: true, owner_id: 'u1', title: 'Hi' } as any;
    const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPrivate).toBe(true);
    expect(result.current.ownerId).toBe('u1');
    expect(result.current.title).toBe('Hi');
  });

  test('updating html recomputes and persists the title alongside the field', async () => {
    mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '' } as any;
    const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    result.current.updateField('html', '<title>New Title</title>');
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ html: '<title>New Title</title>', title: 'New Title' })));
  });

  test('a name chosen at creation is saved and wins over the generated title', async () => {
    mockConfig.sessionRow = null;
    const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null, '  Snake game '));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Snake game' })));
    await waitFor(() => expect(result.current.title).toBe('Snake game'));
  });

  test('a room created without a name never sends the name column', async () => {
    mockConfig.sessionRow = null;
    renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('name');
  });

  test('a stored name stays the title when code edits recompute the derived title', async () => {
    mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '', name: 'My Name' } as any;
    const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(result.current.title).toBe('My Name'));
    result.current.updateField('html', '<h1>Other</h1>');
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Other' })));
    expect(result.current.title).toBe('My Name');
  });

  test('setPrivacy updates (not upserts) is_private', async () => {
    // An upsert of { id, is_private } is checked by Postgres against the
    // INSERT policy with owner_id unset, which rejects every private flip.
    mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '' } as any;
    const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.setPrivacy(true);
    });
    expect(update).toHaveBeenCalledWith({ is_private: true });
    expect(upsert).not.toHaveBeenCalledWith(expect.objectContaining({ is_private: true }));
    expect(result.current.isPrivate).toBe(true);
  });

  test('setPrivacy surfaces an RLS rejection as connectionStatus write-failed, and does not flip isPrivate', async () => {
    mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '' } as any;
    mockConfig.updateResult = { data: null, error: { message: 'cannot change ownership or privacy of a session you do not own' } };
    const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.setPrivacy(true);
    });
    expect(result.current.connectionStatus).toBe('write-failed');
    expect(result.current.isPrivate).toBe(false);
  });

  test('setPrivacy treats an update that RLS silently filtered to zero rows as a failure', async () => {
    mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '' } as any;
    mockConfig.updateResult = { data: [], error: null };
    const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'connected', 'web', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.setPrivacy(true);
    });
    expect(result.current.connectionStatus).toBe('write-failed');
    expect(result.current.isPrivate).toBe(false);
  });
  describe('privacy changes reach everyone already in the room', () => {
    test('a successful setPrivacy announces it on the channel', async () => {
      mockConfig.sessionRow = { id: 'room', html: '', css: '', js: '', is_private: false, owner_id: 'user-1', title: '' } as any;
      const { result } = renderSession('room');
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.setPrivacy(true);
      });
      expect(soleChannel().send).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'privacy', payload: { isPrivate: true } }),
      );
    });

    test('a rejected setPrivacy announces nothing', async () => {
      mockConfig.sessionRow = { id: 'room', html: '', css: '', js: '', is_private: false, owner_id: 'user-1', title: '' } as any;
      mockConfig.updateResult = { data: null, error: { message: 'denied' } };
      const { result } = renderSession('room');
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.setPrivacy(true);
      });
      expect(soleChannel().send).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'privacy' }));
    });

    test('a viewer who is not the owner loses access when the room goes private', async () => {
      mockConfig.sessionRow = { id: 'room', html: '<p>x</p>', css: '', js: '', is_private: false, owner_id: 'owner-9', title: '' } as any;
      const { result } = renderSession('room', 'user-1');
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.accessRevoked).toBe(false);
      act(() => soleChannel().emitBroadcast('privacy', { isPrivate: true }));
      expect(result.current.accessRevoked).toBe(true);
    });

    test("the owner's other tabs follow the change instead of losing access", async () => {
      mockConfig.sessionRow = { id: 'room', html: '', css: '', js: '', is_private: false, owner_id: 'user-1', title: '' } as any;
      const { result } = renderSession('room', 'user-1');
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => soleChannel().emitBroadcast('privacy', { isPrivate: true }));
      expect(result.current.isPrivate).toBe(true);
      expect(result.current.accessRevoked).toBe(false);
    });
  });
});
