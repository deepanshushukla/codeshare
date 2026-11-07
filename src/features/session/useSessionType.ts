import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isSessionType, type SessionType } from './sessionType';

export function useSessionType(
  sessionId: string,
  typeHint: SessionType,
): { sessionType: SessionType | null; loading: boolean } {
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSessionType() {
      const { data, error } = await supabase
        .from('sessions')
        .select('session_type')
        .eq('id', sessionId)
        .maybeSingle();

      if (!active) return;

      if (data && isSessionType(data.session_type)) {
        setSessionType(data.session_type);
      } else {
        // Row exists but session_type is missing or invalid, or row doesn't exist: use typeHint
        setSessionType(typeHint);
      }
      setLoading(false);
    }

    loadSessionType();

    return () => {
      active = false;
    };
  }, [sessionId, typeHint]);

  return { sessionType, loading };
}
