import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { apiGet, apiPost } from './api';

export type PresenceStatus = 'available' | 'busy' | 'in_meeting' | 'on_break' | 'lunch' | 'away' | 'offline';

export interface UserPresence {
  user_id: number;
  name: string;
  status: PresenceStatus;
  custom_message: string;
  is_on_call: boolean;
  active_caller_number?: string | null;
  last_activity: string;
  employee?: {
    id?: number | null;
    full_name: string;
    email: string;
    assigned_color: string;
    role: string;
    status?: string;
    contact_info?: string;
  };
}

type PresenceContextType = {
  myPresence: UserPresence | null;
  teamPresence: UserPresence[];
  updatePresence: (status: PresenceStatus, customMessage?: string) => Promise<void>;
  setOnCall: (isOnCall: boolean, activeCallerNumber?: string | null) => Promise<void>;
  refreshPresence: () => Promise<void>;
};

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

const HEARTBEAT_INTERVAL_MS = 15000;
const REFRESH_INTERVAL_MS = 15000;

function normalizePresenceStatus(value: unknown): PresenceStatus {
  const status = String(value ?? '').trim().toLowerCase();
  switch (status) {
    case 'available':
    case 'busy':
    case 'in_meeting':
    case 'on_break':
    case 'lunch':
    case 'away':
    case 'offline':
      return status;
    default:
      return 'available';
  }
}

function mapPresenceRow(row: any): UserPresence {
  const employeeName = row?.employee?.full_name || row?.name || row?.email || 'Team Member';
  const employeeEmail = row?.employee?.email || row?.email || '';
  return {
    user_id: Number(row?.user_id || 0),
    name: row?.name || employeeName,
    status: normalizePresenceStatus(row?.status || 'offline'),
    custom_message: String(row?.custom_message || ''),
    is_on_call: Boolean(row?.is_on_call),
    active_caller_number: row?.active_caller_number ? String(row.active_caller_number) : null,
    last_activity: row?.last_activity || row?.last_seen || new Date().toISOString(),
    employee: {
      id: row?.employee?.id ? Number(row.employee.id) : null,
      full_name: employeeName,
      email: employeeEmail,
      assigned_color: row?.employee?.assigned_color || '#3B82F6',
      role: row?.employee?.role || row?.role || 'employee',
      status: row?.employee?.status || 'active',
      contact_info: row?.employee?.contact_info || '',
    },
  };
}

function presenceIdentityKey(presence: UserPresence): string {
  if (presence.user_id > 0) {
    return `id:${presence.user_id}`;
  }

  const email = String(presence.employee?.email || '').trim().toLowerCase();
  if (email !== '') {
    return `email:${email}`;
  }

  return `name:${String(presence.name || '').trim().toLowerCase()}`;
}

function dedupePresenceRows(rows: UserPresence[]): UserPresence[] {
  const seen = new Set<string>();
  const deduped: UserPresence[] = [];

  for (const row of rows) {
    const key = presenceIdentityKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [myPresence, setMyPresence] = useState<UserPresence | null>(null);
  const [teamPresence, setTeamPresence] = useState<UserPresence[]>([]);
  const myPresenceRef = useRef<UserPresence | null>(null);

  useEffect(() => {
    myPresenceRef.current = myPresence;
  }, [myPresence]);

  const sendHeartbeat = useCallback(
    async (status: PresenceStatus, customMessage: string, isOnCall: boolean, activeCallerNumber?: string | null) => {
      if (!user) return;
      await apiPost('/presence/heartbeat', {
        status,
        custom_message: customMessage,
        is_on_call: isOnCall,
        active_caller_number: isOnCall ? String(activeCallerNumber || '').trim() || null : null,
      });
    },
    [user],
  );

  const refreshPresence = useCallback(async () => {
    if (!user) {
      setMyPresence(null);
      setTeamPresence([]);
      return;
    }

    try {
      const rows = await apiGet<any[]>('/presence');
      const mapped = Array.isArray(rows) ? dedupePresenceRows(rows.map(mapPresenceRow)) : [];
      const onlineOnly = mapped.filter((presence) => presence.status !== 'offline');
      setTeamPresence(onlineOnly);

      const mine =
        mapped.find((presence) => presence.user_id === user.id) ||
        onlineOnly.find((presence) => presence.employee?.email?.toLowerCase() === user.email.toLowerCase()) ||
        null;

      if (mine) {
        setMyPresence(mine);
      } else {
        setMyPresence({
          user_id: user.id,
          name: user.name,
          status: 'available',
          custom_message: '',
          is_on_call: false,
          active_caller_number: null,
          last_activity: new Date().toISOString(),
          employee: {
            full_name: user.name,
            email: user.email,
            assigned_color: '#3B82F6',
            role: user.role || 'agent',
          },
        });
      }
    } catch (error) {
      console.error('Error refreshing presence:', error);
      const fallback: UserPresence = {
        user_id: user.id,
        name: user.name,
        status: 'available',
        custom_message: '',
        is_on_call: false,
        active_caller_number: null,
        last_activity: new Date().toISOString(),
        employee: {
          full_name: user.name,
          email: user.email,
          assigned_color: '#3B82F6',
          role: user.role || 'agent',
        },
      };
      setMyPresence(fallback);
      setTeamPresence([fallback]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMyPresence(null);
      setTeamPresence([]);
      return;
    }

    let cancelled = false;
    const boot = async () => {
      try {
        await sendHeartbeat('available', '', false);
      } catch (error) {
        console.error('Error sending initial presence heartbeat:', error);
      }
      if (!cancelled) {
        await refreshPresence();
      }
    };
    void boot();

    const heartbeatId = window.setInterval(() => {
      const current = myPresenceRef.current;
      const status = normalizePresenceStatus(current?.status || 'available');
      const customMessage = current?.custom_message || '';
      const isOnCall = Boolean(current?.is_on_call);
      void sendHeartbeat(
        status === 'offline' ? 'away' : status,
        customMessage,
        isOnCall,
        current?.active_caller_number || null,
      );
    }, HEARTBEAT_INTERVAL_MS);

    const refreshId = window.setInterval(() => {
      void refreshPresence();
    }, REFRESH_INTERVAL_MS);

    const onFocus = () => {
      const current = myPresenceRef.current;
      const status = normalizePresenceStatus(current?.status || 'available');
      void sendHeartbeat(
        status === 'offline' ? 'away' : status,
        current?.custom_message || '',
        Boolean(current?.is_on_call),
        current?.active_caller_number || null,
      )
        .then(() => refreshPresence())
        .catch(() => {
          void refreshPresence();
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onFocus();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      window.clearInterval(refreshId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user, refreshPresence, sendHeartbeat]);

  const updatePresence = useCallback(
    async (status: PresenceStatus, customMessage = '') => {
      if (!user) return;
      const normalizedStatus = normalizePresenceStatus(status);
      const next: UserPresence = {
        user_id: user.id,
        name: myPresenceRef.current?.name || user.name,
        status: normalizedStatus,
        custom_message: customMessage,
        is_on_call: Boolean(myPresenceRef.current?.is_on_call),
        active_caller_number: myPresenceRef.current?.active_caller_number || null,
        last_activity: new Date().toISOString(),
        employee: myPresenceRef.current?.employee || {
          full_name: user.name,
          email: user.email,
          assigned_color: '#3B82F6',
          role: user.role || 'agent',
        },
      };
      setMyPresence(next);
      myPresenceRef.current = next;

      try {
        await sendHeartbeat(
          normalizedStatus === 'offline' ? 'away' : normalizedStatus,
          customMessage,
          next.is_on_call,
          next.active_caller_number || null,
        );
      } finally {
        await refreshPresence();
      }
    },
    [refreshPresence, sendHeartbeat, user],
  );

  const setOnCall = useCallback(
    async (isOnCall: boolean, activeCallerNumber: string | null = null) => {
      if (!user) return;
      const current = myPresenceRef.current;
      const nextStatus = isOnCall
        ? 'busy'
        : normalizePresenceStatus(current?.status || 'available') === 'busy'
          ? 'available'
          : normalizePresenceStatus(current?.status || 'available');

      const next: UserPresence = {
        user_id: user.id,
        name: current?.name || user.name,
        status: nextStatus,
        custom_message: current?.custom_message || '',
        is_on_call: isOnCall,
        active_caller_number: isOnCall ? String(activeCallerNumber || '').trim() || null : null,
        last_activity: new Date().toISOString(),
        employee: current?.employee || {
          full_name: user.name,
          email: user.email,
          assigned_color: '#3B82F6',
          role: user.role || 'agent',
        },
      };
      setMyPresence(next);
      myPresenceRef.current = next;

      try {
        await sendHeartbeat(nextStatus, next.custom_message, isOnCall, next.active_caller_number || null);
      } finally {
        await refreshPresence();
      }
    },
    [refreshPresence, sendHeartbeat, user],
  );

  const value = useMemo(
    () => ({
      myPresence,
      teamPresence,
      updatePresence,
      setOnCall,
      refreshPresence,
    }),
    [myPresence, refreshPresence, setOnCall, teamPresence, updatePresence],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence(): PresenceContextType {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return context;
}
