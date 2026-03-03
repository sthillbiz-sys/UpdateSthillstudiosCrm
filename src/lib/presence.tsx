import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { apiGet } from './api';

export type PresenceStatus = 'available' | 'busy' | 'in_meeting' | 'on_break' | 'lunch' | 'away' | 'offline';

export interface UserPresence {
  user_id: number;
  name: string;
  status: PresenceStatus;
  custom_message: string;
  is_on_call: boolean;
  last_activity: string;
  employee?: {
    full_name: string;
    email: string;
    assigned_color: string;
    role: string;
  };
}

type PresenceContextType = {
  myPresence: UserPresence | null;
  teamPresence: UserPresence[];
  updatePresence: (status: PresenceStatus, customMessage?: string) => Promise<void>;
  setOnCall: (isOnCall: boolean) => Promise<void>;
  refreshPresence: () => Promise<void>;
};

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

function toPresenceStatus(role: string): PresenceStatus {
  if (!role) return 'offline';
  return 'available';
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [myPresence, setMyPresence] = useState<UserPresence | null>(null);
  const [teamPresence, setTeamPresence] = useState<UserPresence[]>([]);

  useEffect(() => {
    if (!user) {
      setMyPresence(null);
      setTeamPresence([]);
      return;
    }

    const selfPresence: UserPresence = {
      user_id: user.id,
      name: user.name,
      status: 'available',
      custom_message: '',
      is_on_call: false,
      last_activity: new Date().toISOString(),
      employee: {
        full_name: user.name,
        email: user.email,
        assigned_color: '#3B82F6',
        role: user.role || 'agent',
      },
    };

    setMyPresence(selfPresence);
  }, [user]);

  const refreshPresence = async () => {
    if (!user) {
      setTeamPresence([]);
      return;
    }

    try {
      const employees = await apiGet<Array<{ id: number; name: string; email?: string; role?: string }>>('/employees');

      const mapped = employees.map((employee) => ({
        user_id: Number(employee.id),
        name: employee.name,
        status: toPresenceStatus(employee.role || ''),
        custom_message: '',
        is_on_call: false,
        last_activity: new Date().toISOString(),
        employee: {
          full_name: employee.name,
          email: employee.email || '',
          assigned_color: '#3B82F6',
          role: employee.role || 'agent',
        },
      }));

      const deduped = new Map<number, UserPresence>();
      mapped.forEach((entry) => {
        deduped.set(entry.user_id, entry);
      });

      if (myPresence) {
        deduped.set(myPresence.user_id, myPresence);
      }

      setTeamPresence(Array.from(deduped.values()));
    } catch {
      // Graceful fallback in PHP deployments without realtime presence backend.
      setTeamPresence(myPresence ? [myPresence] : []);
    }
  };

  useEffect(() => {
    void refreshPresence();
    const id = window.setInterval(() => {
      void refreshPresence();
    }, 60000);

    return () => {
      window.clearInterval(id);
    };
  }, [user, myPresence?.status, myPresence?.is_on_call]);

  const updatePresence = async (status: PresenceStatus, customMessage = '') => {
    if (!myPresence) return;
    const next = {
      ...myPresence,
      status,
      custom_message: customMessage,
      last_activity: new Date().toISOString(),
    };
    setMyPresence(next);
    setTeamPresence((prev) => {
      const withoutSelf = prev.filter((p) => p.user_id !== next.user_id);
      return [next, ...withoutSelf];
    });
  };

  const setOnCall = async (isOnCall: boolean) => {
    if (!myPresence) return;
    const next: UserPresence = {
      ...myPresence,
      is_on_call: isOnCall,
      status: isOnCall ? 'busy' : myPresence.status === 'busy' ? 'available' : myPresence.status,
      last_activity: new Date().toISOString(),
    };
    setMyPresence(next);
    setTeamPresence((prev) => {
      const withoutSelf = prev.filter((p) => p.user_id !== next.user_id);
      return [next, ...withoutSelf];
    });
  };

  const value = useMemo(
    () => ({
      myPresence,
      teamPresence,
      updatePresence,
      setOnCall,
      refreshPresence,
    }),
    [myPresence, teamPresence],
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
