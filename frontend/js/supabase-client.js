/* ============================================================
   EDUPULSE — Supabase REST Client
   Lightweight fetch-based client for new UUID-based schema.
   ============================================================ */

const SUPABASE_URL  = 'https://olaqwoxycxdbcmqegifi.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sYXF3b3h5Y3hkYmNtcWVnaWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDYyODgsImV4cCI6MjA5ODM4MjI4OH0.JUYUKKGAAd7fx8s840meU0Ayd5VE7sfSMwDbiG8twlU';

const SupaDB = {
  _headers() {
    return {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    };
  },

  async _fetch(path, opts = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;
    try {
      const res = await fetch(url, { headers: this._headers(), ...opts });
      if (res.status === 204) return [];
      const data = await res.json();
      if (!res.ok) throw data;
      return data;
    } catch (err) {
      console.warn('Supabase Offline:', err);
      throw err;
    }
  },

  async select(table, params = {}) {
    const qs = new URLSearchParams({ select: '*', ...params }).toString();
    return this._fetch(`${table}?${qs}`);
  },

  async insert(table, body) {
    return this._fetch(table, {
      method: 'POST',
      body:   JSON.stringify(body),
    });
  },

  async update(table, filter, body) {
    const qs = new URLSearchParams(filter).toString();
    return this._fetch(`${table}?${qs}`, {
      method:  'PATCH',
      body:    JSON.stringify(body),
    });
  },

  async delete(table, filter) {
    const qs = new URLSearchParams(filter).toString();
    return this._fetch(`${table}?${qs}`, { method: 'DELETE' });
  },
};

// ---- Supabase API Endpoints ----
const SupaAPI = {
  content: {
    bySubject: (subjId)  => SupaDB.select('content', { subject_id: `eq.${subjId}`, is_active: 'eq.true', order: 'uploaded_at.desc' }),
    byFaculty: (facId)   => SupaDB.select('content', { faculty_id: `eq.${facId}`, is_active: 'eq.true', order: 'uploaded_at.desc' }),
    all:       ()        => SupaDB.select('content', { is_active: 'eq.true', order: 'uploaded_at.desc' }),
    add:       (data)    => SupaDB.insert('content', data),
    delete:    (id)      => SupaDB.delete('content', { content_id: `eq.${id}` }),
  },

  doubts: {
    byStudent: (studId) => SupaDB.select('doubts', { student_id: `eq.${studId}`, order: 'submitted_at.desc' }),
    byFaculty: (facId)  => SupaDB.select('doubts', { assigned_faculty_id: `eq.${facId}`, order: 'submitted_at.desc' }),
    all:       ()       => SupaDB.select('doubts', { order: 'submitted_at.desc' }),
    add:       (data)   => SupaDB.insert('doubts', data),
    resolve:   (id, res)=> SupaDB.update('doubts', { doubt_id: `eq.${id}` }, { status: 'resolved', resolution: res, resolved_at: new Date().toISOString() }),
  },

  companies: {
    all: () => SupaDB.select('placement_companies', { is_active: 'eq.true' }),
  },

  placement: {
    forStudent: (studId) => SupaDB.select('placement_scores', { student_id: `eq.${studId}` }),
    all:        ()       => SupaDB.select('placement_scores', { order: 'total_score.desc' }),
  },

  wellness: {
    history: (studId, limit = 12) => SupaDB.select('wellness_records', { student_id: `eq.${studId}`, order: 'assessment_date.desc', limit }),
    submit:  (data)               => SupaDB.insert('wellness_records', data),
  },

  leave: {
    byFaculty: (facId) => SupaDB.select('leave_requests', { faculty_id: `eq.${facId}`, order: 'applied_at.desc' }),
    pending:   ()      => SupaDB.select('leave_requests', { status: 'eq.pending', order: 'applied_at.asc' }),
    apply:     (data)  => SupaDB.insert('leave_requests', data),
  },

  lectureChanges: {
    upcoming: () => SupaDB.select('lecture_changes', { order: 'change_date.asc' }),
  },

  notifications: {
    forUser:  (uId, limit = 20) => SupaDB.select('notifications', { recipient_id: `eq.${uId}`, order: 'sent_at.desc', limit }),
    unread:   (uId)             => SupaDB.select('notifications', { recipient_id: `eq.${uId}`, is_read: 'eq.false', order: 'sent_at.desc' }),
    markRead: (id)              => SupaDB.update('notifications', { notification_id: `eq.${id}` }, { is_read: true }),
  },

  seminars: {
    upcoming: () => SupaDB.select('seminars', { order: 'seminar_date.asc' }),
  },

  audit: {
    log: (actId, act, type, entId) =>
      SupaDB.insert('audit_logs', { actor_id: actId, action: act, entity_type: type, entity_id: entId, ip_address: '127.0.0.1' }),
  },
};
console.log('✅ Supabase UUID API helper initialized.');
