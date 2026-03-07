import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Video } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface CalendarNote {
  id: string;
  note_text: string;
  contact_name: string;
  contact_id: string | null;
  follow_up_type: string;
  priority: string;
  completed: boolean;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface CalendarDayModalProps {
  date: Date;
  onClose: () => void;
  onScheduleMeeting: (date: Date) => void;
}

export function CalendarDayModal({ date, onClose, onScheduleMeeting }: CalendarDayModalProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newNote, setNewNote] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [followUpType, setFollowUpType] = useState('call_back');
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(true);

  const dateString = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const dateISO = date.toISOString().split('T')[0];

  useEffect(() => {
    loadNotes();
    loadContacts();
  }, [date]);

  const loadContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone')
        .order('first_name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('calendar_notes')
        .select('*')
        .eq('note_date', dateISO)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !user) return;

    try {
      const selectedContact = contacts.find(c => c.id === selectedContactId);
      const contactName = selectedContact
        ? `${selectedContact.first_name} ${selectedContact.last_name}`.trim()
        : '';

      const { error } = await supabase
        .from('calendar_notes')
        .insert({
          note_date: dateISO,
          note_text: newNote,
          contact_id: selectedContactId || null,
          contact_name: contactName,
          follow_up_type: followUpType,
          priority: priority,
          completed: false,
          created_by: user.id
        });

      if (error) throw error;

      setNewNote('');
      setSelectedContactId('');
      setFollowUpType('call_back');
      setPriority('medium');
      loadNotes();
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const toggleComplete = async (noteId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from('calendar_notes')
        .update({ completed: !completed })
        .eq('id', noteId);

      if (error) throw error;
      loadNotes();
    } catch (error) {
      console.error('Error updating note:', error);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('calendar_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getFollowUpLabel = (type: string) => {
    switch (type) {
      case 'call_back': return 'Call Back';
      case 'meeting': return 'Meeting Scheduled';
      case 'reminder': return 'Reminder';
      case 'other': return 'Other';
      default: return type;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{dateString}</h2>
            <p className="text-blue-100 text-sm mt-1">Team Calendar Notes</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-500 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Add New Note</h3>

            <div className="space-y-3">
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select Contact (optional)</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name}
                    {contact.phone && ` - ${contact.phone}`}
                  </option>
                ))}
              </select>

              <textarea
                placeholder="Enter note... (e.g., 'Customer wants call back today' or 'Follow up on website proposal')"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={followUpType}
                  onChange={(e) => setFollowUpType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="call_back">Call Back</option>
                  <option value="meeting">Meeting Scheduled</option>
                  <option value="reminder">Reminder</option>
                  <option value="other">Other</option>
                </select>

                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>

              <button
                onClick={addNote}
                disabled={!newNote.trim()}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Note
              </button>
            </div>
          </div>

          <div className="mb-6">
            <button
              onClick={() => onScheduleMeeting(date)}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
            >
              <Video className="w-5 h-5" />
              Schedule Sthillstudios Meeting
            </button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Notes for this day ({notes.length})
            </h3>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading notes...</div>
            ) : notes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No notes for this day. Add one above to get started.
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    note.completed
                      ? 'bg-gray-50 border-gray-200 opacity-60'
                      : getPriorityColor(note.priority)
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={note.completed}
                        onChange={() => toggleComplete(note.id, note.completed)}
                        className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        {note.contact_name && (
                          <div className="font-semibold text-sm text-gray-900 mb-1">
                            {note.contact_name}
                          </div>
                        )}
                        <p className={`text-sm ${note.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                          {note.note_text}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs px-2 py-1 bg-white border border-gray-300 rounded">
                            {getFollowUpLabel(note.follow_up_type)}
                          </span>
                          <span className="text-xs px-2 py-1 bg-white border border-gray-300 rounded capitalize">
                            {note.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-2 hover:bg-red-100 text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
