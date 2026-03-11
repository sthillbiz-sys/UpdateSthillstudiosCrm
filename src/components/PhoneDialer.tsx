import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react';
import { Phone, Settings, Trash2, HelpCircle, X, Video, Mic, Users, History, User, Delete } from 'lucide-react';
import { SwEvent, TelnyxRTC, type Call as TelnyxCall, type INotification } from '@telnyx/webrtc';
import { usePresence } from '../lib/presence';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';
import { LOGO_SRC } from '../lib/assets';

interface PhoneDialerProps {
  onClose?: () => void;
}

type DialerConnectionState = 'initializing' | 'ready' | 'error' | 'offline';
type DialerCallState = 'idle' | 'dialing' | 'ringing' | 'active';

type TelnyxAccessTokenResponse = {
  token: string;
  callerNumber?: string;
  callerNumbers?: string[];
  expiresAt?: string;
  expiresIn?: number;
};

type CallHistoryItem = {
  id: number;
  contact_name?: string;
  phone_number?: string;
  duration?: number;
  status?: string;
  timestamp?: string;
  called_at?: string;
};

const PRE_CALL_STATES = new Set(['new', 'requesting', 'trying', 'recovering', 'answering', 'early']);
const TERMINAL_STATES = new Set(['hangup', 'destroy', 'purge']);

function normalizeDestinationNumber(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (trimmed === '') {
    return null;
  }

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D+/g, '');
    if (digits.length >= 8 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  const digits = trimmed.replace(/\D+/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

function formatPhoneNumber(num: string): string {
  const digits = String(num || '').replace(/\D+/g, '');
  if (digits.length === 0) return '000-000-0000';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

function sanitizeDialerInput(raw: string): string {
  const value = String(raw || '').trim();
  if (value === '') {
    return '';
  }

  const hasLeadingPlus = value.startsWith('+');
  const digits = value.replace(/\D+/g, '').slice(0, 15);
  if (digits === '') {
    return hasLeadingPlus ? '+' : '';
  }

  return hasLeadingPlus ? `+${digits}` : digits;
}

function formatDurationSeconds(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function resolveCallOutcome(state: string, answered: boolean): string {
  const normalized = String(state || '').toLowerCase();
  if (normalized === 'active') {
    return 'completed';
  }
  if (normalized === 'ringing' || normalized === 'trying' || normalized === 'requesting') {
    return 'no-answer';
  }
  if (normalized === 'destroy' || normalized === 'purge') {
    return answered ? 'completed' : 'canceled';
  }
  if (normalized === 'hangup') {
    return answered ? 'completed' : 'no-answer';
  }
  return answered ? 'completed' : 'failed';
}

function getCallStateLabel(state: DialerCallState): string {
  switch (state) {
    case 'dialing':
      return 'Dialing';
    case 'ringing':
      return 'Ringing';
    case 'active':
      return 'In Call';
    default:
      return 'Ready';
  }
}

function getConnectionStateLabel(state: DialerConnectionState): string {
  switch (state) {
    case 'initializing':
      return 'Connecting';
    case 'ready':
      return 'Connected';
    case 'error':
      return 'Connection Error';
    case 'offline':
      return 'Offline';
    default:
      return 'Connecting';
  }
}

export function PhoneDialer({ onClose }: PhoneDialerProps = {}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [activeTab, setActiveTab] = useState<'dialer' | 'team'>('dialer');
  const { teamPresence, myPresence, updatePresence, setOnCall } = usePresence();
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<DialerConnectionState>('initializing');
  const [callState, setCallState] = useState<DialerCallState>('idle');
  const [dialerMessage, setDialerMessage] = useState('Connecting to Telnyx...');
  const [isMuted, setIsMuted] = useState(false);
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [callerNumbers, setCallerNumbers] = useState<string[]>([]);
  const [selectedCallerNumber, setSelectedCallerNumber] = useState('');

  const dialerRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const telnyxClientRef = useRef<TelnyxRTC | null>(null);
  const activeCallRef = useRef<TelnyxCall | null>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const dialedNumberRef = useRef('');
  const callLoggedRef = useRef(false);
  const lastTelnyxStateRef = useRef('');
  const outboundSetupInFlightRef = useRef(false);
  const cancelOutboundSetupRef = useRef(false);
  const ringbackAudioContextRef = useRef<AudioContext | null>(null);
  const ringbackLoopTimeoutRef = useRef<number | null>(null);
  const ringbackStopTimeoutRef = useRef<number | null>(null);
  const ringbackOscillatorsRef = useRef<OscillatorNode[]>([]);
  const ringbackGainRef = useRef<GainNode | null>(null);

  const userName = user?.email?.split('@')[0] || 'Agent';
  const formattedName = userName
    .split('.')
    .map((n: string) => n.charAt(0).toUpperCase() + n.slice(1))
    .join(' ');

  const isInCall = callState !== 'idle';
  const isCallableNumber = useMemo(() => normalizeDestinationNumber(phoneNumber) !== null, [phoneNumber]);

  const handleNumberClick = (num: string) => {
    if (phoneNumber.length < 18) {
      setPhoneNumber((prev) => prev + num);
    }
  };

  const handleClear = () => {
    setPhoneNumber('');
  };

  const handlePhoneNumberInput = (value: string) => {
    setPhoneNumber(sanitizeDialerInput(value));
  };

  const handlePhoneNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isInCall) {
      return;
    }

    handlePhoneNumberInput(event.target.value);
  };

  const handlePhoneNumberPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (isInCall) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    handlePhoneNumberInput(event.clipboardData.getData('text'));
  };

  const loadCallHistory = useCallback(async () => {
    if (!user) {
      setCallHistory([]);
      return;
    }

    setLoadingHistory(true);
    try {
      const rows = await apiGet<CallHistoryItem[]>('/calls');
      const next = Array.isArray(rows) ? rows.slice(0, 15) : [];
      setCallHistory(next);
    } catch (error) {
      console.error('Error loading call history:', error);
      setCallHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  const ensureRemoteAudioPlayback = useCallback(async () => {
    const element = remoteAudioRef.current;
    if (!element) {
      return;
    }

    element.autoplay = true;
    element.playsInline = true;
    element.muted = false;
    element.volume = 1;

    try {
      await element.play();
    } catch (error) {
      const domError = error as DOMException | undefined;
      if (domError?.name !== 'NotSupportedError' && domError?.name !== 'AbortError') {
        console.debug('Remote audio playback is not ready yet:', error);
      }
    }
  }, []);

  const clearRingbackBurst = useCallback(() => {
    for (const oscillator of ringbackOscillatorsRef.current) {
      try {
        oscillator.stop();
      } catch {
        // Oscillator may already be stopped.
      }
      try {
        oscillator.disconnect();
      } catch {
        // Ignore disconnect errors during cleanup.
      }
    }

    ringbackOscillatorsRef.current = [];

    if (ringbackGainRef.current) {
      try {
        ringbackGainRef.current.disconnect();
      } catch {
        // Ignore disconnect errors during cleanup.
      }
      ringbackGainRef.current = null;
    }
  }, []);

  const stopRingbackTone = useCallback(() => {
    if (ringbackLoopTimeoutRef.current !== null) {
      window.clearTimeout(ringbackLoopTimeoutRef.current);
      ringbackLoopTimeoutRef.current = null;
    }
    if (ringbackStopTimeoutRef.current !== null) {
      window.clearTimeout(ringbackStopTimeoutRef.current);
      ringbackStopTimeoutRef.current = null;
    }
    clearRingbackBurst();
  }, [clearRingbackBurst]);

  const playRingbackTone = useCallback(async () => {
    if (typeof window === 'undefined' || ringbackLoopTimeoutRef.current !== null) {
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    let context = ringbackAudioContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContextCtor();
      ringbackAudioContextRef.current = context;
    }

    try {
      if (context.state === 'suspended') {
        await context.resume();
      }
    } catch (error) {
      console.debug('Unable to resume ringback audio context:', error);
      return;
    }

    clearRingbackBurst();

    const gain = context.createGain();
    const oscillators = [440, 480].map((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      return oscillator;
    });

    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.02);
    gain.gain.setValueAtTime(0.045, now + 1.95);
    gain.gain.linearRampToValueAtTime(0.0001, now + 2);
    gain.connect(context.destination);

    oscillators.forEach((oscillator) => oscillator.start(now));
    oscillators.forEach((oscillator) => oscillator.stop(now + 2.05));

    ringbackGainRef.current = gain;
    ringbackOscillatorsRef.current = oscillators;
    ringbackStopTimeoutRef.current = window.setTimeout(() => {
      ringbackStopTimeoutRef.current = null;
      clearRingbackBurst();
    }, 2200);
    ringbackLoopTimeoutRef.current = window.setTimeout(() => {
      ringbackLoopTimeoutRef.current = null;
      void playRingbackTone();
    }, 6000);
  }, [clearRingbackBurst]);

  const resetCallUiState = useCallback(() => {
    activeCallRef.current = null;
    callStartedAtRef.current = null;
    lastTelnyxStateRef.current = '';
    dialedNumberRef.current = '';
    outboundSetupInFlightRef.current = false;
    cancelOutboundSetupRef.current = false;
    stopRingbackTone();
    setCallState('idle');
    setIsMuted(false);
  }, [stopRingbackTone]);

  const hasMultipleCallerNumbers = callerNumbers.length > 1;
  const currentUserEmail = String(user?.email || '').trim().toLowerCase();
  const unavailableCallerNumbers = useMemo(() => {
    const active = new Set<string>();

    for (const member of teamPresence) {
      const memberEmail = String(member.employee?.email || '').trim().toLowerCase();
      if ((member.user_id > 0 && member.user_id === user?.id) || (memberEmail !== '' && memberEmail === currentUserEmail)) {
        continue;
      }

      const callerNumber = String(member.active_caller_number || '').trim();
      if (member.is_on_call && callerNumber !== '') {
        active.add(callerNumber);
      }
    }

    return active;
  }, [currentUserEmail, teamPresence, user?.id]);
  const selectedCallerNumberUnavailable = selectedCallerNumber !== '' && unavailableCallerNumbers.has(selectedCallerNumber);
  const availableCallerNumbers = useMemo(
    () => callerNumbers.filter((number) => !unavailableCallerNumbers.has(number)),
    [callerNumbers, unavailableCallerNumbers],
  );

  useEffect(() => {
    if (callerNumbers.length === 0 || isInCall) {
      return;
    }

    if (selectedCallerNumber !== '' && !unavailableCallerNumbers.has(selectedCallerNumber)) {
      return;
    }

    const nextAvailable = availableCallerNumbers[0] || '';
    if (nextAvailable !== '' && nextAvailable !== selectedCallerNumber) {
      setSelectedCallerNumber(nextAvailable);
      setDialerMessage(`Caller ID ${selectedCallerNumber || 'selection'} is in use. Switched to ${nextAvailable}.`);
      return;
    }

    if (nextAvailable === '' && selectedCallerNumber !== '') {
      setDialerMessage(`Caller ID ${selectedCallerNumber} is currently in use by another employee.`);
    }
  }, [availableCallerNumbers, callerNumbers.length, isInCall, selectedCallerNumber, unavailableCallerNumbers]);

  const finalizeAndLogCall = useCallback(
    async (finalTelnyxState: string) => {
      if (callLoggedRef.current) {
        return;
      }
      callLoggedRef.current = true;

      const startedAt = callStartedAtRef.current;
      const answered = startedAt !== null;
      const duration = startedAt === null ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const status = resolveCallOutcome(finalTelnyxState, answered);
      const dialed = dialedNumberRef.current;

      try {
        if (dialed !== '') {
          await apiPost('/calls', {
            contact_name: 'Outbound Call',
            phone_number: dialed,
            duration,
            status,
          });
        }
      } catch (error) {
        console.error('Error logging call:', error);
      }

      resetCallUiState();

      try {
        await setOnCall(false, null);
      } catch (error) {
        console.error('Error resetting presence after call:', error);
      }

      if (status === 'completed') {
        setDialerMessage(`Call ended (${formatDurationSeconds(duration)})`);
      } else {
        setDialerMessage(`Call ended (${status})`);
      }

      await loadCallHistory();
    },
    [loadCallHistory, resetCallUiState, setOnCall],
  );

  const cancelPendingOutboundSetup = useCallback(async () => {
    cancelOutboundSetupRef.current = true;
    outboundSetupInFlightRef.current = false;
    stopRingbackTone();
    activeCallRef.current = null;
    callStartedAtRef.current = null;
    lastTelnyxStateRef.current = 'hangup';
    setCallState('idle');
    setIsMuted(false);
    setDialerMessage('Call canceled');

    try {
      await setOnCall(false, null);
    } catch (error) {
      console.error('Error clearing caller number reservation after cancel:', error);
    }

    try {
      await updatePresence('available');
    } catch (error) {
      console.error('Error resetting presence after cancel:', error);
    }
  }, [setOnCall, stopRingbackTone, updatePresence]);

  const reserveCallerNumberForCall = useCallback((callerNumber: string) => {
    void setOnCall(true, callerNumber).catch((error) => {
      console.error('Error reserving caller number for outbound call:', error);
    });

    void updatePresence('busy').catch((error) => {
      console.error('Error updating presence for outbound call:', error);
    });
  }, [setOnCall, updatePresence]);

  const handleTelnyxNotification = useCallback(
    (notification: INotification) => {
      if (notification.type !== 'callUpdate' || !notification.call) {
        return;
      }

      const call = notification.call;
      const state = String(call.state || '').toLowerCase();
      lastTelnyxStateRef.current = state;
      activeCallRef.current = call;

      const remoteStream = (call as TelnyxCall & { remoteStream?: MediaStream | null }).remoteStream;
      if (remoteAudioRef.current && remoteStream && remoteAudioRef.current.srcObject !== remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
      }

      if (PRE_CALL_STATES.has(state)) {
        setCallState('dialing');
        setDialerMessage('Connecting call...');
        void ensureRemoteAudioPlayback();
        void playRingbackTone();
        return;
      }

      if (state === 'ringing') {
        setCallState('ringing');
        setDialerMessage('Ringing...');
        void ensureRemoteAudioPlayback();
        void playRingbackTone();
        return;
      }

      if (state === 'active') {
        if (callStartedAtRef.current === null) {
          callStartedAtRef.current = Date.now();
        }
        stopRingbackTone();
        setCallState('active');
        setDialerMessage('Call in progress');
        void ensureRemoteAudioPlayback();
        void setOnCall(true, selectedCallerNumber);
        return;
      }

      if (TERMINAL_STATES.has(state)) {
        stopRingbackTone();
        void finalizeAndLogCall(state);
      }
    },
    [ensureRemoteAudioPlayback, finalizeAndLogCall, playRingbackTone, selectedCallerNumber, setOnCall, stopRingbackTone],
  );

  const initializeDialer = useCallback(async () => {
    if (!user) {
      setConnectionState('offline');
      setDialerMessage('Sign in to use the dialer.');
      return;
    }

    setConnectionState('initializing');
    setDialerMessage('Connecting to Telnyx...');

    const payload = await apiPost<TelnyxAccessTokenResponse>('/telnyx/access-token', {});
    const token = String(payload?.token || '').trim();
    const callerNumber = String(payload?.callerNumber || '').trim();
    const configuredCallerNumbers = Array.from(
      new Set(
        [
          ...(Array.isArray(payload?.callerNumbers) ? payload.callerNumbers : []),
          callerNumber,
        ]
          .map((value) => String(value || '').trim())
          .filter((value) => value !== ''),
      ),
    );
    if (token === '') {
      throw new Error('Missing Telnyx token response.');
    }
    if (configuredCallerNumbers.length === 0) {
      throw new Error('Missing Telnyx caller number configuration.');
    }

    setCallerNumbers(configuredCallerNumbers);
    setSelectedCallerNumber((current) => (
      current !== '' && configuredCallerNumbers.includes(current) ? current : configuredCallerNumbers[0]
    ));

    const client = new TelnyxRTC({
      login_token: token,
      debug: false,
    });
    client.remoteElement = remoteAudioRef.current || 'telnyx-remote-audio';

    client
      .on(SwEvent.Ready, () => {
        setConnectionState('ready');
        setDialerMessage('');
      })
      .on(SwEvent.Error, (errorPayload: unknown) => {
        const message =
          (errorPayload as { error?: { message?: string } })?.error?.message ||
          (errorPayload instanceof Error ? errorPayload.message : '') ||
          'Telnyx connection failed.';
        console.error('Telnyx error:', errorPayload);
        setConnectionState('error');
        setDialerMessage(message);
      })
      .on(SwEvent.Notification, (notification: INotification) => {
        handleTelnyxNotification(notification);
      });

    telnyxClientRef.current = client;
    client.connect();
  }, [handleTelnyxNotification, user]);

  useEffect(() => {
    let disposed = false;

    const boot = async () => {
      try {
        await initializeDialer();
        if (!disposed) {
          await loadCallHistory();
        }
      } catch (error) {
        if (disposed) {
          return;
        }
        console.error('Error initializing Telnyx dialer:', error);
        setConnectionState('error');
        setDialerMessage(error instanceof Error ? error.message : 'Unable to initialize Telnyx dialer.');
      }
    };

    void boot();

    return () => {
      disposed = true;
      const client = telnyxClientRef.current;
      telnyxClientRef.current = null;

      if (client) {
        try {
          client.off(SwEvent.Ready);
          client.off(SwEvent.Error);
          client.off(SwEvent.Notification);
          client.disconnect();
        } catch (error) {
          console.error('Error disconnecting Telnyx client:', error);
        }
      }

      resetCallUiState();
      const remoteAudio = remoteAudioRef.current;
      if (remoteAudio) {
        remoteAudio.pause();
        remoteAudio.srcObject = null;
      }
      const ringbackContext = ringbackAudioContextRef.current;
      ringbackAudioContextRef.current = null;
      if (ringbackContext && ringbackContext.state !== 'closed') {
        void ringbackContext.close().catch(() => undefined);
      }
      void setOnCall(false, null);
    };
  }, [initializeDialer, loadCallHistory, resetCallUiState, setOnCall]);

  const startCall = useCallback(async () => {
    if (connectionState !== 'ready') {
      setDialerMessage('Dialer is not connected yet.');
      return;
    }

    const client = telnyxClientRef.current;
    if (!client) {
      setDialerMessage('Dialer is not available.');
      return;
    }

    const destination = normalizeDestinationNumber(phoneNumber);
    if (destination === null) {
      setDialerMessage('Enter a valid number (US 10 digits or E.164).');
      return;
    }
    if (selectedCallerNumber === '') {
      setDialerMessage('Select a caller ID before placing a call.');
      return;
    }
    if (selectedCallerNumberUnavailable) {
      setDialerMessage(`Caller ID ${selectedCallerNumber} is already in use by another employee.`);
      return;
    }

    try {
      outboundSetupInFlightRef.current = true;
      cancelOutboundSetupRef.current = false;
      dialedNumberRef.current = destination;
      callStartedAtRef.current = null;
      callLoggedRef.current = false;
      lastTelnyxStateRef.current = 'requesting';
      setCallState('dialing');
      setDialerMessage('Placing call...');
      void ensureRemoteAudioPlayback();
      void playRingbackTone();
      if (cancelOutboundSetupRef.current) {
        await cancelPendingOutboundSetup();
        return;
      }

      const call = client.newCall({
        destinationNumber: destination,
        callerNumber: selectedCallerNumber,
        remoteElement: remoteAudioRef.current || 'telnyx-remote-audio',
        audio: true,
      });

      activeCallRef.current = call;
      outboundSetupInFlightRef.current = false;
      reserveCallerNumberForCall(selectedCallerNumber);
      void ensureRemoteAudioPlayback();

      if (cancelOutboundSetupRef.current) {
        try {
          call.hangup();
        } catch (hangupError) {
          console.error('Error canceling outbound Telnyx call during setup:', hangupError);
        }
        await cancelPendingOutboundSetup();
      }
    } catch (error) {
      console.error('Error starting Telnyx call:', error);
      outboundSetupInFlightRef.current = false;
      stopRingbackTone();
      setCallState('idle');
      setDialerMessage(error instanceof Error ? error.message : 'Failed to start call.');
      void setOnCall(false, null);
      void updatePresence('available');
    }
  }, [cancelPendingOutboundSetup, connectionState, ensureRemoteAudioPlayback, phoneNumber, playRingbackTone, reserveCallerNumberForCall, selectedCallerNumber, selectedCallerNumberUnavailable, setOnCall, stopRingbackTone, updatePresence]);

  const hangupCall = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) {
      if (callState === 'dialing' || outboundSetupInFlightRef.current) {
        void cancelPendingOutboundSetup();
      }
      return;
    }

    try {
      call.hangup();
    } catch (error) {
      console.error('Error hanging up call:', error);
    }

    window.setTimeout(() => {
      if (activeCallRef.current === call) {
        void finalizeAndLogCall(lastTelnyxStateRef.current || 'hangup');
      }
    }, 1500);
  }, [callState, cancelPendingOutboundSetup, finalizeAndLogCall]);

  const handlePrimaryCallAction = useCallback(() => {
    if (isInCall) {
      hangupCall();
      return;
    }
    void startCall();
  }, [hangupCall, isInCall, startCall]);

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call || callState !== 'active') {
      return;
    }

    try {
      if (isMuted) {
        call.unmuteAudio();
        setIsMuted(false);
      } else {
        call.muteAudio();
        setIsMuted(true);
      }
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  }, [callState, isMuted]);

  const buttons = [
    { num: '1', letters: '' },
    { num: '2', letters: 'ABC' },
    { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' },
    { num: '5', letters: 'JKL' },
    { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' },
    { num: '8', letters: 'TUV' },
    { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' },
    { num: '0', letters: '+' },
    { num: '#', letters: '' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'busy':
      case 'in_meeting':
        return 'bg-red-500';
      case 'on_break':
      case 'lunch':
        return 'bg-yellow-500';
      case 'away':
        return 'bg-orange-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'busy':
        return 'Busy';
      case 'in_meeting':
        return 'In a Meeting';
      case 'on_break':
        return 'On Break';
      case 'lunch':
        return 'At Lunch';
      case 'away':
        return 'Away';
      case 'offline':
        return 'Offline';
      default:
        return status;
    }
  };

  const callButtonDisabled = !isInCall && (!isCallableNumber || connectionState !== 'ready' || selectedCallerNumberUnavailable || availableCallerNumbers.length === 0);

  if (onClose) {
    return (
      <div
        ref={dialerRef}
        className="fixed z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-80 border border-slate-700"
        style={{ right: '20px', bottom: '20px' }}
      >
        <audio ref={remoteAudioRef} id="telnyx-remote-audio" autoPlay playsInline className="hidden" />
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white px-4 py-3 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400/20 via-transparent to-transparent"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <img
                  src={LOGO_SRC}
                  alt="SthillStudios"
                  className="h-6 w-auto drop-shadow-lg"
                />
                <div>
                  <h2 className="text-base font-bold">Phone</h2>
                  <p className="text-xs text-blue-100">{formattedName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('dialer')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'dialer'
                    ? 'bg-white text-blue-700 shadow-lg'
                    : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                }`}
              >
                Dialer
              </button>
              <button
                onClick={() => setActiveTab('team')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'team'
                    ? 'bg-white text-blue-700 shadow-lg'
                    : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                }`}
              >
                Team
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'dialer' && (
          <div className="p-4 bg-gradient-to-b from-slate-800 to-slate-900">
            <div className="mb-3 relative">
              <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-3 shadow-inner border border-slate-600">
                <div className="flex items-center justify-center mb-1">
                  <img
                    src={LOGO_SRC}
                    alt="SthillStudios"
                    className="h-4 w-auto opacity-40"
                  />
                </div>
                <input
                  type="text"
                  value={formatPhoneNumber(phoneNumber)}
                  onChange={handlePhoneNumberChange}
                  onPaste={handlePhoneNumberPaste}
                  placeholder="Enter phone number"
                  inputMode="tel"
                  autoComplete="tel"
                  disabled={isInCall}
                  className="w-full text-center text-xl font-mono font-bold py-2 bg-transparent text-cyan-300 outline-none tracking-wider"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {buttons.map((btn) => (
                <button
                  key={btn.num}
                  onClick={() => handleNumberClick(btn.num)}
                  className="relative bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 rounded-lg p-2 transition-all active:scale-95 shadow-lg border border-slate-600 hover:border-cyan-500/50 group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/0 to-blue-400/0 group-hover:from-cyan-400/10 group-hover:to-blue-400/10 rounded-lg transition-all"></div>
                  <div className="relative">
                    <div className="text-2xl font-bold text-white drop-shadow-lg">{btn.num}</div>
                    <div className="text-[10px] text-cyan-300/60 tracking-wider leading-none">{btn.letters}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3 mb-3">
              <button
                onClick={handleClear}
                disabled={!phoneNumber || isInCall}
                className="p-3 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-red-600 hover:to-red-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-all shadow-lg border border-slate-600 hover:border-red-500"
              >
                <Delete className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={handlePrimaryCallAction}
                disabled={callButtonDisabled}
                className={`relative p-4 text-white rounded-full transition-all shadow-2xl active:scale-95 border-2 group ${
                  isInCall
                    ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 border-red-400'
                    : 'bg-gradient-to-br from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 border-green-400 disabled:from-slate-700 disabled:to-slate-800 disabled:border-slate-600 disabled:cursor-not-allowed'
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-full group-hover:from-white/30"></div>
                <Phone className="w-5 h-5 relative z-10" />
              </button>
            </div>

            <div className="mb-3 text-center text-[11px]">
              <p className="text-cyan-300 font-semibold">
                {getConnectionStateLabel(connectionState)} • {getCallStateLabel(callState)}
              </p>
              {dialerMessage !== '' && (
                <p className={`${connectionState === 'error' ? 'text-red-300' : 'text-slate-300'} mt-1`}>
                  {dialerMessage}
                </p>
              )}
              {selectedCallerNumber !== '' && (
                <p className="text-slate-400 mt-1">
                  Caller ID: {selectedCallerNumber}
                </p>
              )}
            </div>

            {callerNumbers.length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
                  Outbound Number
                </label>
                <select
                  value={selectedCallerNumber}
                  onChange={(e) => setSelectedCallerNumber(e.target.value)}
                  disabled={isInCall || callerNumbers.length === 1}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {callerNumbers.map((number) => (
                    <option key={number} value={number} disabled={unavailableCallerNumbers.has(number)}>
                      {hasMultipleCallerNumbers ? `Use ${number}` : number}{unavailableCallerNumbers.has(number) ? ' (In use)' : ''}
                    </option>
                  ))}
                </select>
                {selectedCallerNumberUnavailable && (
                  <p className="mt-2 text-[11px] text-amber-300">
                    {selectedCallerNumber} is currently being used by another employee.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              <button className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600">
                <Video className="w-4 h-4 text-cyan-300" />
                <span className="text-[10px] text-gray-300">Video</span>
              </button>
              <button
                onClick={toggleMute}
                disabled={callState !== 'active'}
                className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Mic className={`w-4 h-4 ${isMuted ? 'text-red-400' : 'text-cyan-300'}`} />
                <span className="text-[10px] text-gray-300">{isMuted ? 'Muted' : 'Voice'}</span>
              </button>
              <button
                onClick={() => void loadCallHistory()}
                className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600"
              >
                <History className="w-4 h-4 text-cyan-300" />
                <span className="text-[10px] text-gray-300">History</span>
              </button>
              <button className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600">
                <Users className="w-4 h-4 text-cyan-300" />
                <span className="text-[10px] text-gray-300">Contacts</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="p-4 bg-gradient-to-b from-slate-800 to-slate-900 max-h-96 overflow-y-auto">
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-cyan-300 mb-2">My Status</h3>
              <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg p-3 mb-3 border border-slate-600">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(myPresence?.status || 'offline')} shadow-lg`} />
                  <span className="text-sm font-medium text-white">
                    {getStatusLabel(myPresence?.status || 'offline')}
                  </span>
                </div>
                <select
                  value={myPresence?.status || 'available'}
                  onChange={(e) => updatePresence(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 text-white rounded-lg text-xs focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="available">Available</option>
                  <option value="busy">Busy</option>
                  <option value="in_meeting">In a Meeting</option>
                  <option value="on_break">On Break</option>
                  <option value="lunch">At Lunch</option>
                  <option value="away">Away</option>
                </select>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-cyan-300 mb-2">
                Team ({teamPresence.length})
              </h3>
              <div className="space-y-2">
                {teamPresence.map((member) => {
                  const candidate = String(member.employee?.contact_info || '').trim();
                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between p-2 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 rounded-lg transition-all border border-slate-600"
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-lg">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <div
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-800 ${getStatusColor(member.status)} shadow-lg`}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-white text-xs">{member.employee?.full_name || member.name || 'Team Member'}</p>
                          <p className="text-[10px] text-cyan-300">{getStatusLabel(member.status)}</p>
                        </div>
                      </div>
                      {member.status === 'available' && !member.is_on_call && candidate !== '' && (
                        <button
                          onClick={() => {
                            setPhoneNumber(candidate);
                            setActiveTab('dialer');
                          }}
                          className="p-1.5 bg-gradient-to-br from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white rounded-full transition-all shadow-lg"
                        >
                          <Phone className="w-3 h-3" />
                        </button>
                      )}
                      {member.is_on_call && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium border border-red-500/30">
                          On Call
                        </span>
                      )}
                    </div>
                  );
                })}
                {teamPresence.length === 0 && (
                  <p className="text-center text-gray-400 py-3 text-xs">No team members online</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <audio ref={remoteAudioRef} id="telnyx-remote-audio" autoPlay playsInline className="hidden" />
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <img
                src={LOGO_SRC}
                alt="SthillStudios Logo"
                className="w-32 h-auto"
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">
                <HelpCircle className="w-4 h-4" />
                Request Help
              </button>
              <div className={`px-3 py-1.5 rounded-full text-xs font-semibold text-white flex items-center gap-2 ${
                connectionState === 'ready' ? 'bg-green-600' : connectionState === 'error' ? 'bg-red-600' : 'bg-slate-600'
              }`}>
                <div className="w-2 h-2 bg-white rounded-full"></div>
                {getConnectionStateLabel(connectionState).toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-2xl p-8">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-green-400 tracking-wider">{getCallStateLabel(callState).toUpperCase()}</span>
                <span className="text-xs text-blue-400">Telnyx WebRTC</span>
              </div>
              <div className="bg-slate-900 rounded-lg p-6 text-center">
                <div className="text-3xl font-mono font-bold text-white tracking-wider mb-2">
                  {formatPhoneNumber(phoneNumber)}
                </div>
                <div className="text-xs text-slate-400">
                  {dialerMessage || `Caller ID: ${selectedCallerNumber || 'N/A'}`}
                </div>
              </div>
            </div>

            {callerNumbers.length > 0 && (
              <div className="mb-4">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Outbound Number
                </label>
                <select
                  value={selectedCallerNumber}
                  onChange={(e) => setSelectedCallerNumber(e.target.value)}
                  disabled={isInCall || callerNumbers.length === 1}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {callerNumbers.map((number) => (
                    <option key={number} value={number} disabled={unavailableCallerNumbers.has(number)}>
                      {number}{unavailableCallerNumbers.has(number) ? ' (In use)' : ''}
                    </option>
                  ))}
                </select>
                {selectedCallerNumberUnavailable && (
                  <p className="mt-2 text-xs text-amber-300">
                    {selectedCallerNumber} is currently being used by another employee.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-4">
              {buttons.map((btn) => (
                <button
                  key={btn.num}
                  onClick={() => handleNumberClick(btn.num)}
                  className="bg-slate-700 hover:bg-slate-600 rounded-xl p-4 transition-colors group"
                >
                  <div className="text-2xl font-bold text-white mb-0.5">{btn.num}</div>
                  <div className="text-[10px] text-gray-400 tracking-wider">{btn.letters}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handlePrimaryCallAction}
                disabled={callButtonDisabled}
                className={`rounded-xl p-4 flex items-center justify-center transition-colors col-span-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isInCall ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                <Phone className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={toggleMute}
                disabled={callState !== 'active'}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl p-4 flex items-center justify-center transition-colors"
              >
                <Mic className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={handleClear}
                disabled={isInCall}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl p-4 flex items-center justify-center transition-colors col-span-2"
              >
                <Trash2 className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={() => void loadCallHistory()}
                className="bg-slate-700 hover:bg-slate-600 rounded-xl p-4 flex items-center justify-center transition-colors"
              >
                <Settings className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                Call History
              </h2>
              <button
                onClick={() => void loadCallHistory()}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Refresh
              </button>
            </div>
            {loadingHistory ? (
              <div className="text-center py-12 text-sm text-slate-400">Loading call history...</div>
            ) : callHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-500 mb-2">
                  <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                </div>
                <p className="text-gray-400 text-sm">No recent calls</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {callHistory.map((item) => {
                  const ts = item.timestamp || item.called_at || '';
                  return (
                    <div key={item.id} className="border border-slate-700 rounded-lg p-3 bg-slate-900/60">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">{item.phone_number || 'Unknown number'}</p>
                        <span className="text-xs text-cyan-300 uppercase">{item.status || 'completed'}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400 flex items-center justify-between">
                        <span>{ts ? new Date(ts).toLocaleString() : 'Unknown time'}</span>
                        <span>{formatDurationSeconds(Number(item.duration || 0))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
