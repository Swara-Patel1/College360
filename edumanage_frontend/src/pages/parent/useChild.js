import { useState, useEffect } from 'react';
import { SupaAPI } from '../../api/client.js';
import { useAuthStore } from '../../store/useAuthStore.js';

/**
 * Loads the student linked to the logged-in parent account.
 * Cached in localStorage so parent pages don't refetch on every navigation.
 */
export function useChild() {
  const { user } = useAuthStore();
  const [child, setChild] = useState(() => {
    try { return JSON.parse(localStorage.getItem('parent_child') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(!child);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const data = await SupaAPI.parent.child(user.id);
        if (!alive) return;
        if (data && (data.id || data.student_id)) {
          setChild(data);
          localStorage.setItem('parent_child', JSON.stringify(data));
        } else {
          setError('No linked student found for this account.');
        }
      } catch (e) {
        if (alive) setError('Failed to load your child’s record.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user]);

  return { child, loading, error };
}
