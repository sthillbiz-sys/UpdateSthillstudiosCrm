import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Phone, Video, Plus, X, Calendar as CalendarIcon, Clock, Users, Trash2, ExternalLink } from 'lucide-react';
import { QuickCall } from './QuickCall';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

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

export function Meetings() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'join'>('join');
  const [showQuickCall, setShowQuickCall] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedRoomName, setSelectedRoomName] = useState('SthillStudiosMain');
  const [roomInput, setRoomInput] = useState('');
  const [inMeeting, setInMeeting] = useState(false);
  const [jitsiLoaded, setJitsiLoaded] = useState(false);
  const [jitsiError, setJitsiError] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    title: '',
    meeting_type: 'video',
    scheduled_date: '',
    scheduled_time: '',
    duration: '30 minutes',
    description: '',
    attendees: '',
  });

  useEffect(() => {
    fetchMeetings();

    const checkJitsiLoad = setInterval(() => {
      if (window.JitsiMeetExternalAPI) {
        setJitsiLoaded(true);
        clearInterval(checkJitsiLoad);
      }
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(checkJitsiLoad);
      if (!window.JitsiMeetExternalAPI) {
        setJitsiError(true);
      }
    }, 10000);

    return () => {
      clearInterval(checkJitsiLoad);
      clearTimeout(timeout);
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

  const handleScheduleMeeting = async (e: FormEvent) => {
    e.preventDefault();

    const roomName = `Sthill-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const attendeesArray = formData.attendees
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    const { error } = await supabase.from('meetings').insert({
      title: formData.title,
      meeting_type: formData.meeting_type,
      scheduled_date: formData.scheduled_date,
      scheduled_time: formData.scheduled_time,
      duration: formData.duration,
      description: formData.description,
      room_name: roomName,
      status: 'scheduled',
      attendees: attendeesArray,
      created_by: user?.id,
    });

    if (!error) {
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
      fetchMeetings();
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    const { error } = await supabase.from('meetings').delete().eq('id', id);

    if (!error) {
      fetchMeetings();
    }
  };

  const handleJoinMeeting = (roomName: string) => {
    setSelectedRoomName(roomName);
    setShowQuickCall(true);
  };

  const startJitsiMeeting = (roomName: string) => {
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
      const domain = 'meet.sthillstudios.com';
      const options = {
        roomName: roomName,
        parentNode: jitsiContainerRef.current,
        width: '100%',
        height: '100%',
        userInfo: {
          displayName: user?.email?.split('@')[0] || 'User',
          email: user?.email || '',
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          enableLobby: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_POWERED_BY: false,
        },
      };

      jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);

      jitsiApiRef.current.addListener('readyToClose', () => {
        setInMeeting(false);
        setAudioMuted(false);
        setVideoMuted(false);
        if (jitsiApiRef.current) {
          jitsiApiRef.current.dispose();
          jitsiApiRef.current = null;
        }
      });

      jitsiApiRef.current.addListener('audioMuteStatusChanged', (data: any) => {
        setAudioMuted(data.muted);
      });

      jitsiApiRef.current.addListener('videoMuteStatusChanged', (data: any) => {
        setVideoMuted(data.muted);
      });
    } catch (error) {
      console.error('Error starting Jitsi meeting:', error);
      alert('Failed to start meeting. Please try again.');
      setInMeeting(false);
    }
  };

  useEffect(() => {
    if (inMeeting && selectedRoomName) {
      startJitsiMeeting(selectedRoomName);
    }

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [inMeeting, selectedRoomName]);

  return (
    <>
      <div className="bg-[#FDF8F3] min-h-screen p-8">
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

              <div className="max-w-md mx-auto space-y-6">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="Enter room name or leave blank for main room"
                  className="w-full px-6 py-4 bg-gray-700 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg"
                />

                <button
                  onClick={() => {
                    if (!jitsiLoaded) {
                      alert('Meeting system is still loading. Please wait a moment and try again.');
                      return;
                    }
                    const room = roomInput.trim() || 'SthillStudiosMain';
                    setSelectedRoomName(room);
                    setInMeeting(true);
                  }}
                  disabled={!jitsiLoaded && !jitsiError}
                  className={`w-full px-6 py-4 rounded-lg font-semibold text-lg transition-colors shadow-lg flex items-center justify-center gap-3 ${
                    !jitsiLoaded && !jitsiError
                      ? 'bg-gray-400 cursor-not-allowed text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {!jitsiLoaded && !jitsiError ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Loading meeting system...
                    </>
                  ) : jitsiError ? (
                    <>
                      Join meeting (Video disabled)
                      <Video className="w-6 h-6" />
                    </>
                  ) : (
                    <>
                      Join meeting
                      <Video className="w-6 h-6" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-4 pt-4">
                  <button
                    onClick={() => {
                      if (jitsiApiRef.current) {
                        const newMuted = !audioMuted;
                        jitsiApiRef.current.executeCommand('toggleAudio');
                        setAudioMuted(newMuted);
                      }
                    }}
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
                    onClick={() => {
                      if (jitsiApiRef.current) {
                        const newMuted = !videoMuted;
                        jitsiApiRef.current.executeCommand('toggleVideo');
                        setVideoMuted(newMuted);
                      }
                    }}
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
                    onClick={() => {
                      if (jitsiApiRef.current) {
                        jitsiApiRef.current.executeCommand('toggleTileView');
                      }
                    }}
                    className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors"
                    title="Toggle Participants View"
                  >
                    <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-600 transition-colors">
                      <Users className="w-5 h-5" />
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (jitsiApiRef.current) {
                        jitsiApiRef.current.executeCommand('toggleChat');
                      }
                    }}
                    className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors"
                    title="Toggle Chat"
                  >
                    <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-600 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (jitsiApiRef.current) {
                        jitsiApiRef.current.dispose();
                        jitsiApiRef.current = null;
                      }
                      setInMeeting(false);
                      setAudioMuted(false);
                      setVideoMuted(false);
                    }}
                    className="flex flex-col items-center gap-2 text-white hover:text-red-200 transition-colors"
                    title="Leave Meeting"
                  >
                    <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center hover:bg-red-700 transition-colors">
                      <Phone className="w-5 h-5 transform rotate-135" />
                    </div>
                  </button>
                </div>

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
                  onClick={() => {
                    if (jitsiApiRef.current) {
                      jitsiApiRef.current.dispose();
                      jitsiApiRef.current = null;
                    }
                    setInMeeting(false);
                  }}
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

          {activeTab === 'schedule' && meetings.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">Scheduled Meetings</h3>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Schedule
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900">{meeting.title}</h3>
                      <button
                        onClick={() => handleDeleteMeeting(meeting.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <CalendarIcon className="w-4 h-4" />
                        <span>{new Date(meeting.scheduled_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{meeting.scheduled_time} ({meeting.duration})</span>
                      </div>
                      {meeting.attendees && meeting.attendees.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Users className="w-4 h-4" />
                          <span>{meeting.attendees.length} attendees</span>
                        </div>
                      )}
                    </div>

                    {meeting.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{meeting.description}</p>
                    )}

                    <button
                      onClick={() => handleJoinMeeting(meeting.room_name)}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Join Meeting
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'schedule' && meetings.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <CalendarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No scheduled meetings</h3>
              <p className="text-gray-600 mb-4">Schedule your first meeting to get started</p>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-5 h-5" />
                Schedule Meeting
              </button>
            </div>
          )}
        </div>
      </div>

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
                    Attendees
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
          roomName={selectedRoomName}
        />
      )}
    </>
  );
}
