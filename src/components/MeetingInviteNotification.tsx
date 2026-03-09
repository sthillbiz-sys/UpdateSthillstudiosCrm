import { useEffect, useMemo, useState } from 'react';
import { BellRing, Video, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type MeetingInvite = {
  id: string;
  meetingId?: string | number | null;
  title: string;
  meetingType: string;
  roomName: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string;
  senderName: string;
  attendees: string[];
  timestamp: string;
};

type Props = {
  onJoinMeeting: () => void;
};

const SEEN_INVITES_STORAGE_KEY = 'crm_seen_meeting_invites';
const ACTIVE_INVITES_STORAGE_KEY = 'crm_active_meeting_invites';
const PENDING_INVITE_STORAGE_KEY = 'crm_pending_meeting_invite';

function normalizeInviteEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function isLiveInvite(value: string | null | undefined): boolean {
  return String(value || '').trim().toLowerCase() === 'live';
}

function readSeenInvites(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(SEEN_INVITES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function writeSeenInvites(ids: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(SEEN_INVITES_STORAGE_KEY, JSON.stringify(ids.slice(-50)));
}

function readActiveInvites(): MeetingInvite[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(ACTIVE_INVITES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeActiveInvites(invites: MeetingInvite[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(ACTIVE_INVITES_STORAGE_KEY, JSON.stringify(invites.slice(0, 20)));
}

function buildInviteId(invite: Pick<MeetingInvite, 'meetingId' | 'roomName' | 'scheduledDate' | 'scheduledTime'>): string {
  if (invite.meetingId !== undefined && invite.meetingId !== null && String(invite.meetingId).trim() !== '') {
    return `meeting:${String(invite.meetingId).trim()}`;
  }

  return `room:${String(invite.roomName || 'SthillStudiosMain').trim().toLowerCase()}|${String(invite.scheduledDate || '').trim()}|${String(invite.scheduledTime || '').trim()}`;
}

function normalizeInvite(invite: MeetingInvite): MeetingInvite {
  return {
    ...invite,
    attendees: Array.isArray(invite.attendees)
      ? invite.attendees.map((attendee) => normalizeInviteEmail(attendee)).filter(Boolean)
      : [],
    id: buildInviteId(invite),
  };
}

function isInviteForUser(invite: MeetingInvite, currentUserEmail: string): boolean {
  return invite.attendees.some((attendee) => normalizeInviteEmail(attendee) === currentUserEmail);
}

function persistPendingInvite(invite: MeetingInvite): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, JSON.stringify(invite));
}

function formatInviteTime(invite: MeetingInvite): string {
  if (!invite.scheduledDate && !invite.scheduledTime) {
    return 'Join now';
  }

  const date = invite.scheduledDate ? new Date(`${invite.scheduledDate}T${invite.scheduledTime || '00:00'}:00`) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return [invite.scheduledDate, invite.scheduledTime].filter(Boolean).join(' ').trim() || 'Join now';
  }

  return date.toLocaleString();
}

export function MeetingInviteNotification({ onJoinMeeting }: Props) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<MeetingInvite[]>([]);
  const currentUserEmail = useMemo(() => normalizeInviteEmail(user?.email), [user?.email]);

  useEffect(() => {
    if (!currentUserEmail) {
      setInvites([]);
      return;
    }

    const seen = new Set(readSeenInvites());
    const storedInvites = readActiveInvites()
      .map((invite) => normalizeInvite(invite as MeetingInvite))
      .filter((invite) => !seen.has(invite.id))
      .filter((invite) => isInviteForUser(invite, currentUserEmail));

    setInvites(storedInvites);

    const persistInviteList = (nextInvites: MeetingInvite[]) => {
      const latestSeen = new Set(readSeenInvites());
      const activeInvites = readActiveInvites()
        .map((invite) => normalizeInvite(invite as MeetingInvite))
        .filter((invite) => !nextInvites.some((item) => item.id === invite.id))
        .filter((invite) => !latestSeen.has(invite.id));

      writeActiveInvites([...nextInvites, ...activeInvites]);
    };

    const pushInvite = (incomingInvite: MeetingInvite) => {
      const invite = normalizeInvite(incomingInvite);
      const latestSeen = new Set(readSeenInvites());
      if (!invite.id || latestSeen.has(invite.id) || !isInviteForUser(invite, currentUserEmail)) {
        return;
      }

      setInvites((current) => {
        const withoutCurrentInvite = current.filter((item) => item.id !== invite.id);
        const nextInvites = [invite, ...withoutCurrentInvite].slice(0, 3);
        persistInviteList(nextInvites);
        return nextInvites;
      });
    };

    const loadLiveInvites = async () => {
      try {
        const { data, error } = await supabase
          .from('meetings')
          .select('*')
          .order('scheduled_date', { ascending: false })
          .order('scheduled_time', { ascending: false });

        if (error || !Array.isArray(data)) {
          return;
        }

        data
          .filter((meeting: any) => {
            if (!isLiveInvite(meeting?.status) || String(meeting?.meeting_type || '') === 'in-person') {
              return false;
            }

            const attendees = Array.isArray(meeting?.attendees)
              ? meeting.attendees
              : [];

            return attendees.some((attendee: string) => normalizeInviteEmail(attendee) === currentUserEmail);
          })
          .slice(0, 3)
          .forEach((meeting: any) => {
            const attendees = Array.isArray(meeting?.attendees)
              ? meeting.attendees.map((attendee: string) => normalizeInviteEmail(attendee)).filter(Boolean)
              : [];

            pushInvite({
              id: String(meeting?.id || meeting?.room_name || `meeting-${Date.now()}`),
              meetingId: meeting?.id ?? null,
              title: String(meeting?.title || 'Meeting invite'),
              meetingType: String(meeting?.meeting_type || 'video'),
              roomName: String(meeting?.room_name || 'SthillStudiosMain'),
              status: String(meeting?.status || 'live'),
              scheduledDate: String(meeting?.scheduled_date || ''),
              scheduledTime: String(meeting?.scheduled_time || ''),
              senderName: 'Team',
              attendees,
              timestamp: String(meeting?.created_at || new Date().toISOString()),
            });
          });
      } catch {
        // Ignore background recovery failures.
      }
    };

    const handleMeetingInvite = (event: CustomEvent<MeetingInvite>) => {
      const invite = event.detail;
      pushInvite(invite);
    };

    void loadLiveInvites();
    window.addEventListener('meetingInvite' as any, handleMeetingInvite);

    return () => {
      window.removeEventListener('meetingInvite' as any, handleMeetingInvite);
    };
  }, [currentUserEmail]);

  const dismissInvite = (inviteId: string) => {
    const nextSeen = [...readSeenInvites(), inviteId];
    writeSeenInvites(nextSeen);
    setInvites((current) => {
      const nextInvites = current.filter((invite) => invite.id !== inviteId);
      writeActiveInvites(readActiveInvites().map((invite) => normalizeInvite(invite as MeetingInvite)).filter((invite) => invite.id !== inviteId));
      return nextInvites;
    });
  };

  const handleJoin = (invite: MeetingInvite) => {
    persistPendingInvite(invite);
    dismissInvite(invite.id);
    window.dispatchEvent(new CustomEvent('meetingInviteJoin', { detail: invite }));
    onJoinMeeting();
  };

  if (!user || invites.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-[110] space-y-3">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="min-w-[340px] overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              <h3 className="text-sm font-semibold">Meeting Invite</h3>
            </div>
            <button
              onClick={() => dismissInvite(invite.id)}
              className="rounded-full p-1 transition-colors hover:bg-white/10"
              aria-label={`Dismiss ${invite.title}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{invite.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {invite.senderName} invited you to a {invite.meetingType === 'phone' ? 'voice' : 'video'} meeting
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p>{formatInviteTime(invite)}</p>
              <p className="mt-1">Room: {invite.roomName}</p>
            </div>

            <button
              onClick={() => handleJoin(invite)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Video className="h-4 w-4" />
              Join Meeting
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
