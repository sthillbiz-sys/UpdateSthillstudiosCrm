import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Phone, Video, Plus, Sparkles, X, Calendar as CalendarIcon, Clock, Users, Trash2, ExternalLink } from 'lucide-react';
import { QuickCall } from './QuickCall';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useEmployee } from '../lib/employee';

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

interface Meeting {
  id: string;
  title: string;
  meeting_type: string;
  scheduled_date: string;
  scheduled_time: string;
  duration: string;
  description: string;
  room_name: string;
  status: string;
  attendees: string[];
  created_at: string;
}

interface EmployeeOption {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status?: string;
}

interface MeetingsProps {
  isActive?: boolean;
  onRequestOpen?: () => void;
}

const PRIMARY_JITSI_DOMAIN = 'meet.sthillstudios.com';
const FALLBACK_JITSI_DOMAIN = 'meet.jit.si';
const JITSI_SCRIPT_TIMEOUT_MS = 10000;
const PENDING_INVITE_STORAGE_KEY = 'crm_pending_meeting_invite';

function loadJitsiExternalApi(domain: string): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  if (window.JitsiMeetExternalAPI) {
    return Promise.resolve(true);
  }

  const scriptSrc = `https://${domain}/external_api.js`;
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timeoutId = window.setTimeout(() => done(Boolean(window.JitsiMeetExternalAPI)), JITSI_SCRIPT_TIMEOUT_MS);
    const cleanup = () => window.clearTimeout(timeoutId);

    if (existing) {
      if (window.JitsiMeetExternalAPI) {
        cleanup();
        done(true);
        return;
      }
      existing.addEventListener(
        'load',
        () => {
          cleanup();
          done(Boolean(window.JitsiMeetExternalAPI));
        },
        { once: true },
      );
      existing.addEventListener(
        'error',
        () => {
          cleanup();
          done(false);
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => {
      cleanup();
      done(Boolean(window.JitsiMeetExternalAPI));
    };
    script.onerror = () => {
      cleanup();
      done(false);
    };
    document.head.appendChild(script);
  });
}

function normalizeRoomNameForDomain(roomName: string, domain: string): string {
  const cleanRoom = roomName.trim() || 'SthillStudiosMain';
  if (domain === FALLBACK_JITSI_DOMAIN) {
    return `SthillStudios-${cleanRoom}`;
  }
  return cleanRoom;
}

function formatMeetingDate(dateValue: string): string {
  if (!dateValue) {
    return 'Date TBD';
  }

  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return parsed.toLocaleDateString();
}

function getMeetingTypeLabel(meetingType: string): string {
  if (meetingType === 'phone') {
    return 'Voice';
  }
  if (meetingType === 'in-person') {
    return 'In person';
  }
  return 'Video';
}

export function Meetings({ isActive = true, onRequestOpen }: MeetingsProps = {}) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'join'>('join');
  const [showQuickCall, setShowQuickCall] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedRoomName, setSelectedRoomName] = useState('SthillStudiosMain');
  const [roomInput, setRoomInput] = useState('');
  const [inMeeting, setInMeeting] = useState(false);
  const [jitsiDomain, setJitsiDomain] = useState(PRIMARY_JITSI_DOMAIN);
  const [jitsiLoaded, setJitsiLoaded] = useState(false);
  const [jitsiError, setJitsiError] = useState(false);
  const [meetingControlsReady, setMeetingControlsReady] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [backgroundBlurred, setBackgroundBlurred] = useState(false);
  const [activeMeetingType, setActiveMeetingType] = useState<'video' | 'phone'>('video');
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const { user } = useAuth();
  const { isAdmin, allEmployees } = useEmployee();

  const [formData, setFormData] = useState({
    title: '',
    meeting_type: 'video',
    scheduled_date: '',
    scheduled_time: '',
    duration: '30 minutes',
    description: '',
    attendees: '',
  });
  const [selectedEmployeeEmails, setSelectedEmployeeEmails] = useState<string[]>([]);
  const [instantMeetingTitle, setInstantMeetingTitle] = useState('');
  const [instantMeetingType, setInstantMeetingType] = useState<'video' | 'phone'>('video');
  const [instantSelectedEmployeeEmails, setInstantSelectedEmployeeEmails] = useState<string[]>([]);
  const [startingInstantMeeting, setStartingInstantMeeting] = useState(false);
  const [joinMeetingTitle, setJoinMeetingTitle] = useState('');
  const [joinSelectedEmployeeEmails, setJoinSelectedEmployeeEmails] = useState<string[]>([]);
  const [startingJoinMeeting, setStartingJoinMeeting] = useState(false);

  const employeeOptions = useMemo<EmployeeOption[]>(
    () =>
      allEmployees
        .filter((employee) => String(employee.email || '').trim() !== '')
        .filter((employee) => String(employee.email || '').trim().toLowerCase() !== String(user?.email || '').trim().toLowerCase())
        .filter((employee) => String(employee.status || 'active').toLowerCase() !== 'inactive')
        .map((employee) => ({
          id: String(employee.id),
          email: String(employee.email || '').trim(),
          full_name: String(employee.full_name || employee.email || 'Employee'),
          role: String(employee.role || 'employee'),
          status: employee.status,
        })),
    [allEmployees, user?.email],
  );
  const hasManualRoomInput = roomInput.trim().length > 0;

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      await fetchMeetings();

      const primaryLoaded = await loadJitsiExternalApi(PRIMARY_JITSI_DOMAIN);
      if (cancelled) return;
      if (primaryLoaded) {
        setJitsiDomain(PRIMARY_JITSI_DOMAIN);
        setJitsiLoaded(true);
        setJitsiError(false);
        return;
      }

      const fallbackLoaded = await loadJitsiExternalApi(FALLBACK_JITSI_DOMAIN);
      if (cancelled) return;
      if (fallbackLoaded) {
        setJitsiDomain(FALLBACK_JITSI_DOMAIN);
        setJitsiLoaded(true);
        setJitsiError(false);
        return;
      }

      setJitsiLoaded(false);
      setJitsiError(true);
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMeetings = async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (!error && data) {
      setMeetings(data);
    }
  };

  const toggleEmailSelection = (
    email: string,
    selected: string[],
    setter: Dispatch<SetStateAction<string[]>>,
  ) => {
    setter((current) =>
      current.includes(email)
        ? current.filter((item) => item !== email)
        : [...current, email],
    );
  };

  const buildMeetingAttendees = (selectedEmails: string[], extraEmails: string) => {
    const manualEmails = extraEmails
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    return Array.from(new Set([...selectedEmails, ...manualEmails]));
  };

  const createMeetingRecord = async ({
    title,
    meetingType,
    duration,
    description,
    attendees,
    scheduledDate,
    scheduledTime,
    status,
    roomName,
  }: {
    title: string;
    meetingType: string;
    duration: string;
    description: string;
    attendees: string[];
    scheduledDate: string;
    scheduledTime: string;
    status: string;
    roomName?: string;
  }) => {
    const resolvedRoomName =
      roomName?.trim() || `Sthill-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const { data, error } = await supabase.from('meetings').insert({
      title,
      meeting_type: meetingType,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      duration,
      description,
      room_name: resolvedRoomName,
      status,
      attendees,
      created_by_user_id: user?.id,
    });

    if (error) {
      throw error;
    }

    if (attendees.length > 0 && meetingType !== 'in-person') {
      window.dispatchEvent(new CustomEvent('meetingInviteCreated', {
        detail: {
          meetingId: data?.id ?? null,
          title,
          meetingType,
          roomName: resolvedRoomName,
          status,
          scheduledDate,
          scheduledTime,
          attendees,
        },
      }));
    }

    return resolvedRoomName;
  };

  const buildSelectedEmployeeTitle = (selectedEmails: string[], fallbackTitle: string) => {
    if (selectedEmails.length === 0) {
      return fallbackTitle;
    }

    const selectedNames = selectedEmails
      .map((email) => employeeOptions.find((employee) => employee.email === email)?.full_name || email)
      .filter(Boolean);

    if (selectedNames.length === 1) {
      return `Meeting with ${selectedNames[0]}`;
    }

    if (selectedNames.length === 2) {
      return `Meeting with ${selectedNames[0]} and ${selectedNames[1]}`;
    }

    return `Meeting with ${selectedNames.length} team members`;
  };

  const handleScheduleMeeting = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const attendeesArray = buildMeetingAttendees(selectedEmployeeEmails, formData.attendees);
      await createMeetingRecord({
        title: formData.title,
        meetingType: formData.meeting_type,
        scheduledDate: formData.scheduled_date,
        scheduledTime: formData.scheduled_time,
        duration: formData.duration,
        description: formData.description,
        attendees: attendeesArray,
        status: 'scheduled',
      });

      setShowScheduleModal(false);
      setFormData({
        title: '',
        meeting_type: 'video',
        scheduled_date: '',
        scheduled_time: '',
        duration: '30 minutes',
        description: '',
        attendees: '',
      });
      setSelectedEmployeeEmails([]);
      await fetchMeetings();
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      alert(error instanceof Error ? error.message : 'Failed to schedule meeting.');
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    const { error } = await supabase.from('meetings').delete().eq('id', id);

    if (!error) {
      fetchMeetings();
    }
  };

  const leaveMeeting = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }

    setMeetingControlsReady(false);
    setInMeeting(false);
    setAudioMuted(false);
    setVideoMuted(false);
    setBackgroundBlurred(false);
  };

  const openQuickCallFallback = (roomName: string, meetingType: 'video' | 'phone' = 'video') => {
    setSelectedRoomName(roomName.trim() || 'SthillStudiosMain');
    setActiveMeetingType(meetingType);
    setShowQuickCall(true);
  };

  const joinMeetingRoom = (roomName: string, meetingType: string = 'video') => {
    if (meetingType === 'in-person') {
      alert('This meeting is marked as in-person and does not have an online room to join.');
      return;
    }

    const room = roomName.trim() || 'SthillStudiosMain';
    setSelectedRoomName(room);
    setRoomInput(room);
    setActiveTab('join');
    setActiveMeetingType(meetingType === 'phone' ? 'phone' : 'video');

    if (jitsiLoaded) {
      setShowQuickCall(false);
      setInMeeting(true);
      return;
    }

    openQuickCallFallback(room, meetingType === 'phone' ? 'phone' : 'video');
  };

  useEffect(() => {
    const consumePendingInvite = (invite: any) => {
      if (!invite?.roomName) {
        return;
      }

      joinMeetingRoom(String(invite.roomName), String(invite.meetingType || 'video'));
      sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    };

    const rawPendingInvite = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
    if (rawPendingInvite) {
      try {
        consumePendingInvite(JSON.parse(rawPendingInvite));
      } catch {
        sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
      }
    }

    const handleMeetingInviteJoin = (event: CustomEvent<{ roomName: string; meetingType?: string }>) => {
      consumePendingInvite(event.detail);
    };

    window.addEventListener('meetingInviteJoin' as any, handleMeetingInviteJoin);
    return () => window.removeEventListener('meetingInviteJoin' as any, handleMeetingInviteJoin);
  }, [jitsiLoaded, jitsiError]);

  const renderEmployeeSelector = (
    selectedEmails: string[],
    setter: Dispatch<SetStateAction<string[]>>,
    emptyText: string,
  ) => {
    if (employeeOptions.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {selectedEmails.length === 0 && (
            <span className="text-sm text-gray-500">No employees selected yet.</span>
          )}
          {selectedEmails.map((email) => {
            const selectedEmployee = employeeOptions.find((employee) => employee.email === email);
            return (
              <span
                key={email}
                className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
              >
                {selectedEmployee?.full_name || email}
                <button
                  type="button"
                  onClick={() => toggleEmailSelection(email, selectedEmails, setter)}
                  className="text-blue-500 transition-colors hover:text-blue-700"
                  aria-label={`Remove ${selectedEmployee?.full_name || email}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>

        <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
          {employeeOptions.map((employee) => {
            const checked = selectedEmails.includes(employee.email);
            return (
              <label
                key={employee.email}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-3 transition-colors ${
                  checked
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-transparent bg-white hover:border-gray-200'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{employee.full_name}</p>
                  <p className="text-xs text-gray-500">{employee.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
                    {employee.role}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEmailSelection(employee.email, selectedEmails, setter)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const startJitsiMeeting = (roomName: string, meetingType: 'video' | 'phone') => {
    if (!jitsiContainerRef.current) {
      console.error('Jitsi container not found');
      return;
    }

    if (!window.JitsiMeetExternalAPI) {
      console.error('Jitsi API not loaded');
      alert('Meeting system is loading. Please try again in a moment.');
      setInMeeting(false);
      return;
    }

    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
    }

    try {
      setMeetingControlsReady(false);
      const domain = jitsiDomain;
      const normalizedRoomName = normalizeRoomNameForDomain(roomName, domain);
      const options = {
        roomName: normalizedRoomName,
        parentNode: jitsiContainerRef.current,
        width: '100%',
        height: '100%',
        userInfo: {
          displayName: user?.email?.split('@')[0] || 'User',
          email: user?.email || '',
        },
        configOverwrite: {
          startWithAudioMuted: audioMuted,
          startWithVideoMuted: meetingType === 'phone' || videoMuted,
          enableLobby: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_POWERED_BY: false,
        },
      };

      jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);
      setMeetingControlsReady(true);

      jitsiApiRef.current.addListener('readyToClose', () => {
        leaveMeeting();
      });

      jitsiApiRef.current.addListener('audioMuteStatusChanged', (data: any) => {
        setAudioMuted(data.muted);
      });

      jitsiApiRef.current.addListener('videoMuteStatusChanged', (data: any) => {
        setVideoMuted(data.muted);
      });

      jitsiApiRef.current.addListener('videoConferenceJoined', () => {
        if (backgroundBlurred && jitsiApiRef.current) {
          try {
            jitsiApiRef.current.executeCommand('setBlurredBackground', 'blur');
          } catch (error) {
            console.error('Error applying blur background:', error);
          }
        }
      });
    } catch (error) {
      console.error('Error starting Jitsi meeting:', error);
      alert('Failed to start meeting. Please try again.');
      setMeetingControlsReady(false);
      setInMeeting(false);
    }
  };

  const toggleBlurBackground = () => {
    const nextBlurred = !backgroundBlurred;

    if (!meetingControlsReady || !jitsiApiRef.current) {
      setBackgroundBlurred(nextBlurred);
      return;
    }

    try {
      jitsiApiRef.current.executeCommand('setBlurredBackground', nextBlurred ? 'blur' : '');
      setBackgroundBlurred(nextBlurred);
    } catch (error) {
      console.error('Error toggling blur background:', error);
      alert('Background blur is not available on this meeting server or browser.');
    }
  };

  const handleAudioToggle = () => {
    if (!meetingControlsReady || !jitsiApiRef.current) {
      setAudioMuted((current) => !current);
      return;
    }

    jitsiApiRef.current.executeCommand('toggleAudio');
  };

  const handleVideoToggle = () => {
    if (!meetingControlsReady || !jitsiApiRef.current) {
      setVideoMuted((current) => !current);
      return;
    }

    jitsiApiRef.current.executeCommand('toggleVideo');
  };

  const handleParticipantsToggle = () => {
    if (!meetingControlsReady || !jitsiApiRef.current) {
      return;
    }

    jitsiApiRef.current.executeCommand('toggleParticipantsPane');
  };

  const handleChatToggle = () => {
    if (!meetingControlsReady || !jitsiApiRef.current) {
      return;
    }

    jitsiApiRef.current.executeCommand('toggleChat');
  };

  const handleStartInstantMeeting = async () => {
    if (!isAdmin) {
      return;
    }

    if (instantSelectedEmployeeEmails.length === 0) {
      alert('Select at least one employee for the meeting.');
      return;
    }

    setStartingInstantMeeting(true);
    try {
      const now = new Date();
      const scheduledDate = now.toISOString().split('T')[0];
      const scheduledTime = now.toTimeString().slice(0, 5);
      const title =
        instantMeetingTitle.trim() ||
        `${instantMeetingType === 'phone' ? 'Voice' : 'Video'} meeting with team`;

      const roomName = await createMeetingRecord({
        title,
        meetingType: instantMeetingType,
        scheduledDate,
        scheduledTime,
        duration: '30 minutes',
        description: '',
        attendees: instantSelectedEmployeeEmails,
        status: 'live',
      });

      await fetchMeetings();
      setInstantMeetingTitle('');
      setInstantSelectedEmployeeEmails([]);
      joinMeetingRoom(roomName, instantMeetingType);
    } catch (error) {
      console.error('Error starting instant meeting:', error);
      alert(error instanceof Error ? error.message : 'Failed to start meeting.');
    } finally {
      setStartingInstantMeeting(false);
    }
  };

  const handleJoinMeeting = async () => {
    const requestedRoom = roomInput.trim();

    if (!jitsiLoaded) {
      const fallbackRoom = requestedRoom || 'SthillStudiosMain';
      if (jitsiError) {
        openQuickCallFallback(fallbackRoom, 'video');
        return;
      }
      alert('Meeting system is still loading. Please wait a moment and try again.');
      return;
    }

    // A manually entered room name should always join that room directly.
    if (requestedRoom) {
      const room = requestedRoom || 'SthillStudiosMain';
      setSelectedRoomName(room);
      setRoomInput(room);
      setActiveMeetingType('video');
      setInMeeting(true);
      return;
    }

    if (!isAdmin || joinSelectedEmployeeEmails.length === 0) {
      const room = 'SthillStudiosMain';
      setSelectedRoomName(room);
      setRoomInput(room);
      setActiveMeetingType('video');
      setInMeeting(true);
      return;
    }

    setStartingJoinMeeting(true);
    try {
      const now = new Date();
      const scheduledDate = now.toISOString().split('T')[0];
      const scheduledTime = now.toTimeString().slice(0, 5);
      const title =
        joinMeetingTitle.trim() ||
        buildSelectedEmployeeTitle(joinSelectedEmployeeEmails, 'Live team meeting');

      const roomName = await createMeetingRecord({
        title,
        meetingType: 'video',
        scheduledDate,
        scheduledTime,
        duration: '30 minutes',
        description: '',
        attendees: joinSelectedEmployeeEmails,
        status: 'live',
      });

      await fetchMeetings();
      setJoinMeetingTitle('');
      setJoinSelectedEmployeeEmails([]);
      setRoomInput(roomName);
      setSelectedRoomName(roomName);
      setActiveMeetingType('video');
      setInMeeting(true);
    } catch (error) {
      console.error('Error starting join-tab meeting:', error);
      alert(error instanceof Error ? error.message : 'Failed to start meeting.');
    } finally {
      setStartingJoinMeeting(false);
    }
  };

  useEffect(() => {
    if (inMeeting && selectedRoomName) {
      startJitsiMeeting(selectedRoomName, activeMeetingType);
    }

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
      setMeetingControlsReady(false);
      setBackgroundBlurred(false);
    };
  }, [activeMeetingType, inMeeting, selectedRoomName]);

  const shouldRenderMainUi = isActive || inMeeting || showQuickCall;

  return (
    <>
      {shouldRenderMainUi && (
        <div
          className={isActive ? 'bg-[#FDF8F3] min-h-screen p-8' : 'pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-0'}
          aria-hidden={!isActive}
        >
          <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-6">Meetings & Training</h1>

            <div className="flex gap-4 border-b border-gray-300 mb-8">
              <button
                onClick={() => setActiveTab('schedule')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'schedule'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab('join')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'join'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Join Meeting
              </button>
            </div>
          </div>

          {activeTab === 'join' && !inMeeting && (
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-12">
              <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-white mb-4">Join meeting</h2>
                <h3 className="text-2xl text-gray-300 font-medium">Sthill Studios Team</h3>
              </div>

              {jitsiError && (
                <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg p-4 mb-6 text-center">
                  <p className="text-yellow-200 text-sm">
                    Video conferencing system could not be loaded. The meeting feature requires access to meet.sthillstudios.com.
                  </p>
                </div>
              )}

              {jitsiLoaded && jitsiDomain === FALLBACK_JITSI_DOMAIN && (
                <div className="bg-blue-900/50 border border-blue-500 rounded-lg p-4 mb-6 text-center">
                  <p className="text-blue-100 text-sm">
                    Connected with backup meeting provider (meet.jit.si).
                  </p>
                </div>
              )}

              <div className="max-w-md mx-auto space-y-6">
                {isAdmin && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-blue-200">
                          Admin Invite
                        </p>
                        <p className="mt-1 text-sm text-gray-300">
                          Select employees here to start a live meeting directly from this tab.
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100">
                        {joinSelectedEmployeeEmails.length} selected
                      </span>
                    </div>

                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-gray-200">
                        Meeting Title
                      </label>
                      <input
                        type="text"
                        value={joinMeetingTitle}
                        onChange={(e) => setJoinMeetingTitle(e.target.value)}
                        placeholder="e.g., Quick coaching session"
                        className="w-full rounded-lg border border-white/10 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {renderEmployeeSelector(
                      joinSelectedEmployeeEmails,
                      setJoinSelectedEmployeeEmails,
                      'No employee records with email addresses are available yet.',
                    )}
                  </div>
                )}

                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder={
                    isAdmin && joinSelectedEmployeeEmails.length > 0 && !hasManualRoomInput
                      ? 'Optional private room name. Leave blank to generate one.'
                      : 'Enter room name or leave blank for main room'
                  }
                  className="w-full px-6 py-4 bg-gray-700 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg"
                />

                <button
                  onClick={() => {
                    void handleJoinMeeting();
                  }}
                  disabled={startingJoinMeeting || (!jitsiLoaded && !jitsiError)}
                  className={`w-full px-6 py-4 rounded-lg font-semibold text-lg transition-colors shadow-lg flex items-center justify-center gap-3 ${
                    startingJoinMeeting || (!jitsiLoaded && !jitsiError)
                      ? 'bg-gray-400 cursor-not-allowed text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {startingJoinMeeting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Starting meeting...
                    </>
                  ) : !jitsiLoaded && !jitsiError ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Loading meeting system...
                    </>
                  ) : jitsiError ? (
                    <>
                      {isAdmin && joinSelectedEmployeeEmails.length > 0 && !hasManualRoomInput
                        ? 'Start meeting (Fallback mode)'
                        : 'Join meeting (Fallback mode)'}
                      <Video className="w-6 h-6" />
                    </>
                  ) : jitsiDomain === FALLBACK_JITSI_DOMAIN ? (
                    <>
                      {isAdmin && joinSelectedEmployeeEmails.length > 0 && !hasManualRoomInput
                        ? 'Start meeting (Backup provider)'
                        : 'Join meeting (Backup provider)'}
                      <Video className="w-6 h-6" />
                    </>
                  ) : (
                    <>
                      {isAdmin && joinSelectedEmployeeEmails.length > 0 && !hasManualRoomInput ? 'Start meeting' : 'Join meeting'}
                      <Video className="w-6 h-6" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-4 pt-4">
                  <button
                    onClick={handleAudioToggle}
                    className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors"
                    title="Toggle Audio"
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                      audioMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}>
                      <Phone className="w-5 h-5" />
                    </div>
                  </button>
                  <button
                    onClick={handleVideoToggle}
                    className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors"
                    title="Toggle Video"
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                      videoMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}>
                      <Video className="w-5 h-5" />
                    </div>
                  </button>
                  <button
                    onClick={toggleBlurBackground}
                    className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors"
                    title="Toggle Background Blur"
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                      backgroundBlurred ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
                    }`}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleParticipantsToggle}
                    disabled={!meetingControlsReady}
                    className={`flex flex-col items-center gap-2 transition-colors ${
                      meetingControlsReady
                        ? 'text-gray-300 hover:text-white'
                        : 'cursor-not-allowed text-gray-500'
                    }`}
                    title={meetingControlsReady ? 'Toggle Participants' : 'Available after joining the meeting'}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                      meetingControlsReady
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-800/70'
                    }`}>
                      <Users className="w-5 h-5" />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleChatToggle}
                    disabled={!meetingControlsReady}
                    className={`flex flex-col items-center gap-2 transition-colors ${
                      meetingControlsReady
                        ? 'text-gray-300 hover:text-white'
                        : 'cursor-not-allowed text-gray-500'
                    }`}
                    title={meetingControlsReady ? 'Toggle Chat' : 'Available after joining the meeting'}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                      meetingControlsReady
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-800/70'
                    }`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={leaveMeeting}
                    disabled={!meetingControlsReady}
                    className={`flex flex-col items-center gap-2 transition-colors ${
                      meetingControlsReady
                        ? 'text-white hover:text-red-200'
                        : 'cursor-not-allowed text-red-300/70'
                    }`}
                    title={meetingControlsReady ? 'Leave Meeting' : 'Available after joining the meeting'}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                      meetingControlsReady
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-red-900/40'
                    }`}>
                      <Phone className="w-5 h-5 transform rotate-135" />
                    </div>
                  </button>
                </div>

                {!meetingControlsReady && (
                  <p className="text-center text-xs text-gray-400">
                    Mic, camera, and background settings will apply when the meeting starts. Chat, participants, and hang up become available after joining.
                  </p>
                )}

                <div className="flex items-center justify-center gap-2 text-green-400 pt-4">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span className="text-sm">Your devices are working properly</span>
                </div>
              </div>
            </div>
          </div>
          )}

          {activeTab === 'join' && inMeeting && (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                    <Video className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedRoomName}</h2>
                    <p className="text-blue-100 text-xs">Meeting in progress</p>
                  </div>
                </div>
                <button
                  onClick={leaveMeeting}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Phone className="w-4 h-4 transform rotate-135" />
                  Leave
                </button>
              </div>

              <div
                ref={jitsiContainerRef}
                style={{ width: '100%', height: '750px' }}
                className="bg-gray-900"
              />
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-8">
              <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm border border-gray-200 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Meetings Hub</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Schedule meetings or launch a live voice/video session from this page.
                  </p>
                </div>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Schedule Meeting
                </button>
              </div>

              {isAdmin && (
                <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">Start Instant Meeting</h3>
                        <p className="mt-1 text-sm text-gray-600">
                          Pick employees and launch a meeting without leaving this screen.
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Admin only
                      </span>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Meeting Title
                        </label>
                        <input
                          type="text"
                          value={instantMeetingTitle}
                          onChange={(e) => setInstantMeetingTitle(e.target.value)}
                          placeholder="e.g., Morning sales huddle"
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Meeting Mode
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setInstantMeetingType('video')}
                            className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                              instantMeetingType === 'video'
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <Video className="h-4 w-4" />
                            Video
                          </button>
                          <button
                            type="button"
                            onClick={() => setInstantMeetingType('phone')}
                            className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                              instantMeetingType === 'phone'
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <Phone className="h-4 w-4" />
                            Voice
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="block text-sm font-medium text-gray-700">
                            Invite Employees
                          </label>
                          <span className="text-xs font-medium text-gray-500">
                            {instantSelectedEmployeeEmails.length} selected
                          </span>
                        </div>
                        {renderEmployeeSelector(
                          instantSelectedEmployeeEmails,
                          setInstantSelectedEmployeeEmails,
                          'No employee records with email addresses are available yet.',
                        )}
                      </div>

                      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-gray-500">
                          {jitsiLoaded
                            ? `Meetings are ready on ${jitsiDomain === FALLBACK_JITSI_DOMAIN ? 'the backup provider' : 'the primary provider'}.`
                            : jitsiError
                              ? 'Primary provider is unavailable. The backup meeting window will be used.'
                              : 'Meeting system is still loading.'}
                        </p>
                        <button
                          type="button"
                          onClick={handleStartInstantMeeting}
                          disabled={startingInstantMeeting || instantSelectedEmployeeEmails.length === 0}
                          className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors ${
                            startingInstantMeeting || instantSelectedEmployeeEmails.length === 0
                              ? 'cursor-not-allowed bg-gray-300 text-white'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {startingInstantMeeting ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Starting...
                            </>
                          ) : instantMeetingType === 'phone' ? (
                            <>
                              <Phone className="h-4 w-4" />
                              Start Voice Meeting
                            </>
                          ) : (
                            <>
                              <Video className="h-4 w-4" />
                              Start Video Meeting
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-sm">
                    <h3 className="text-lg font-bold">Meeting Readiness</h3>
                    <div className="mt-5 space-y-4 text-sm text-slate-200">
                      <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                        <span>Video meetings</span>
                        <span className="font-semibold text-emerald-300">Available</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                        <span>Voice meetings</span>
                        <span className="font-semibold text-emerald-300">Available</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                        <span>Provider</span>
                        <span className="font-semibold">
                          {jitsiLoaded
                            ? jitsiDomain === FALLBACK_JITSI_DOMAIN
                              ? 'Backup'
                              : 'Primary'
                            : 'Loading'}
                        </span>
                      </div>
                      <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-slate-300">
                        Voice meetings launch Jitsi with the camera muted by default. Video meetings start with camera controls enabled on the same page.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">Scheduled Meetings</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                    {meetings.length} total
                  </span>
                </div>

                {meetings.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
                    <CalendarIcon className="mx-auto mb-4 h-16 w-16 text-gray-400" />
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">No scheduled meetings</h3>
                    <p className="mb-4 text-gray-600">Schedule your first meeting to get started.</p>
                    <button
                      onClick={() => setShowScheduleModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      <Plus className="h-5 w-5" />
                      Schedule Meeting
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {meetings.map((meeting) => (
                      <div
                        key={meeting.id}
                        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div>
                            <div className="mb-2 flex flex-wrap gap-2">
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                                {getMeetingTypeLabel(meeting.meeting_type)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                {meeting.status || 'scheduled'}
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900">{meeting.title}</h3>
                          </div>
                          <button
                            onClick={() => handleDeleteMeeting(meeting.id)}
                            className="text-gray-400 transition-colors hover:text-red-600"
                            aria-label={`Delete ${meeting.title}`}
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>

                        <div className="mb-4 space-y-3">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <CalendarIcon className="h-4 w-4" />
                            <span>{formatMeetingDate(meeting.scheduled_date)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>{meeting.scheduled_time} ({meeting.duration})</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Users className="h-4 w-4" />
                            <span>
                              {meeting.attendees && meeting.attendees.length > 0
                                ? `${meeting.attendees.length} attendee${meeting.attendees.length === 1 ? '' : 's'}`
                                : 'No attendees added'}
                            </span>
                          </div>
                        </div>

                        {meeting.attendees && meeting.attendees.length > 0 && (
                          <div className="mb-4 flex flex-wrap gap-2">
                            {meeting.attendees.slice(0, 3).map((attendee) => (
                              <span
                                key={attendee}
                                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                              >
                                {attendee}
                              </span>
                            ))}
                            {meeting.attendees.length > 3 && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                +{meeting.attendees.length - 3} more
                              </span>
                            )}
                          </div>
                        )}

                        {meeting.description && (
                          <p className="mb-4 line-clamp-2 text-sm text-gray-600">{meeting.description}</p>
                        )}

                        <button
                          onClick={() => joinMeetingRoom(meeting.room_name, meeting.meeting_type)}
                          disabled={meeting.meeting_type === 'in-person'}
                          className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
                            meeting.meeting_type === 'in-person'
                              ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          <ExternalLink className="h-4 w-4" />
                          {meeting.meeting_type === 'in-person'
                            ? 'In-Person Meeting'
                            : `Join ${getMeetingTypeLabel(meeting.meeting_type)}`}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {!isActive && inMeeting && !showQuickCall && (
        <div className="fixed bottom-24 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-2xl backdrop-blur sm:bottom-6 sm:right-24">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Meeting minimized</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedRoomName}</p>
              <p className="mt-1 text-xs text-gray-600">
                Your {activeMeetingType === 'phone' ? 'voice' : 'video'} meeting is still active. Return to the Meetings tab to continue.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onRequestOpen?.();
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Return
              </button>
              <button
                type="button"
                onClick={leaveMeeting}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-slate-900">Schedule a Meeting</h2>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleScheduleMeeting} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meeting Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Client Strategy Session"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meeting Type *
                  </label>
                  <select
                    required
                    value={formData.meeting_type}
                    onChange={(e) => setFormData({ ...formData, meeting_type: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="video">Video Conference</option>
                    <option value="phone">Phone Call</option>
                    <option value="in-person">In Person</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration *
                  </label>
                  <select
                    required
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option>15 minutes</option>
                    <option>30 minutes</option>
                    <option>45 minutes</option>
                    <option>1 hour</option>
                    <option>1.5 hours</option>
                    <option>2 hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Employee Attendees
                  </label>
                  {renderEmployeeSelector(
                    selectedEmployeeEmails,
                    setSelectedEmployeeEmails,
                    'No employee records with email addresses are available yet.',
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Attendee Emails
                  </label>
                  <input
                    type="text"
                    value={formData.attendees}
                    onChange={(e) => setFormData({ ...formData, attendees: e.target.value })}
                    placeholder="Enter email addresses, separated by commas"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Meeting agenda and notes..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  ></textarea>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <Video className="w-5 h-5" />
                  Schedule Meeting
                </button>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQuickCall && (
        <QuickCall
          onClose={() => {
            setShowQuickCall(false);
            setSelectedRoomName('SthillStudiosMain');
          }}
          meetingType={activeMeetingType}
          roomName={selectedRoomName}
        />
      )}
    </>
  );
}
