import { useState, useEffect, type FormEvent } from 'react';
import { Phone, Video, Plus, X, Calendar as CalendarIcon, Clock, Users, Trash2, ExternalLink } from 'lucide-react';
import { QuickCall } from './QuickCall';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

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
  const [showQuickCall, setShowQuickCall] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedRoomName, setSelectedRoomName] = useState('SthillStudiosMain');
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

  return (
    <>
      <div className="bg-[#FDF8F3] min-h-screen flex items-center justify-center p-8">
        <div className="max-w-5xl w-full">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Meetings & Training</h1>
            <div className="flex gap-3">
              <button
                onClick={() => setShowScheduleModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Plus className="w-5 h-5" />
                Schedule
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-12">
              <div className="text-center mb-8">
                <h2 className="text-4xl font-bold text-white mb-4">Join meeting</h2>
                <h3 className="text-2xl text-gray-300 font-medium">Sthill Studios Main</h3>
              </div>

              <div className="max-w-md mx-auto space-y-6">
                <input
                  type="text"
                  placeholder="j"
                  className="w-full px-6 py-4 bg-gray-700 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg"
                />

                <button
                  onClick={() => {
                    setSelectedRoomName('SthillStudiosMain');
                    setShowQuickCall(true);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg font-semibold text-lg transition-colors shadow-lg flex items-center justify-center gap-3"
                >
                  Join meeting
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className="flex items-center justify-center gap-6 pt-4">
                  <button className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors">
                    <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-600 transition-colors">
                      <Phone className="w-6 h-6" />
                    </div>
                  </button>
                  <button className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors">
                    <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-600 transition-colors">
                      <Video className="w-6 h-6" />
                    </div>
                  </button>
                  <button className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors">
                    <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-600 transition-colors">
                      <Users className="w-6 h-6" />
                    </div>
                  </button>
                  <button className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors">
                    <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center hover:bg-gray-600 transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </button>
                  <button className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors">
                    <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center hover:bg-red-700 transition-colors">
                      <Phone className="w-6 h-6 transform rotate-135" />
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

          {meetings.length > 0 && (
            <div className="mt-12">
              <h3 className="text-xl font-bold text-slate-900 mb-6">Scheduled Meetings</h3>
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
