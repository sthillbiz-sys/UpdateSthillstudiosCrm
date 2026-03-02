import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, StickyNote } from 'lucide-react';
import { CalendarDayModal } from './CalendarDayModal';
import { QuickCall } from './QuickCall';
import { supabase } from '../lib/supabase';

interface DayNotes {
  [key: string]: number;
}

export function Calendar() {
  const [activeTab, setActiveTab] = useState<'internal' | 'calendly'>('internal');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showMeeting, setShowMeeting] = useState(false);
  const [dayNotes, setDayNotes] = useState<DayNotes>({});

  const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const days = getDaysInMonth(currentDate);
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  useEffect(() => {
    loadMonthNotes();
  }, [currentDate]);

  const loadMonthNotes = async () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

    try {
      const { data, error } = await supabase
        .from('calendar_notes')
        .select('note_date')
        .gte('note_date', firstDay)
        .lte('note_date', lastDay);

      if (error) throw error;

      const noteCounts: DayNotes = {};
      data?.forEach((note) => {
        noteCounts[note.note_date] = (noteCounts[note.note_date] || 0) + 1;
      });

      setDayNotes(noteCounts);
    } catch (error) {
      console.error('Error loading month notes:', error);
    }
  };

  const handleDayClick = (day: number) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(clickedDate);
  };

  const handleScheduleMeeting = (date: Date) => {
    setSelectedDate(null);
    setShowMeeting(true);
  };

  const getNotesForDay = (day: number) => {
    const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      .toISOString()
      .split('T')[0];
    return dayNotes[dateStr] || 0;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="p-8 bg-[#FDF8F3] min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Calendar</h1>
          <p className="text-sm text-gray-600">Manage appointments & schedule</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('internal')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'internal'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Internal Calendar
            </button>
            <button
              onClick={() => setActiveTab('calendly')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'calendly'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              Sthillstudios Meeting
            </button>
          </div>
        </div>

        {activeTab === 'internal' && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={previousMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h2 className="text-2xl font-bold text-slate-900">{monthYear}</h2>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200">
              {daysOfWeek.map((day) => (
                <div
                  key={day}
                  className="bg-gray-50 p-3 text-center text-xs font-semibold text-gray-500"
                >
                  {day}
                </div>
              ))}
              {days.map((day, index) => {
                const noteCount = day ? getNotesForDay(day) : 0;
                const today = day ? isToday(day) : false;

                return (
                  <div
                    key={index}
                    onClick={() => day && handleDayClick(day)}
                    className={`bg-white p-4 min-h-[100px] relative ${
                      day ? 'hover:bg-blue-50 cursor-pointer transition-colors' : ''
                    } ${today ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    {day && (
                      <>
                        <div className={`text-sm font-medium mb-2 ${today ? 'text-blue-600 font-bold' : 'text-gray-900'}`}>
                          {day}
                        </div>
                        {noteCount > 0 && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full w-fit">
                            <StickyNote className="w-3 h-3" />
                            <span className="font-semibold">{noteCount}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'calendly' && (
          <div className="p-8 min-h-screen">
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Sthillstudios Meeting Link:</strong>
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value="https://calendly.com/thesthillstudios/sthill-studios-website-design-marketing-and-seo-meeting"
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-xs font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('https://calendly.com/thesthillstudios/sthill-studios-website-design-marketing-and-seo-meeting');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Share this link with customers who want to schedule a meeting to discuss websites and possibly purchase.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden" style={{ minHeight: '700px' }}>
              <iframe
                src="https://calendly.com/thesthillstudios/sthill-studios-website-design-marketing-and-seo-meeting?embed_domain=localhost&embed_type=Inline"
                width="100%"
                height="700"
                frameBorder="0"
                title="Sthillstudios Meeting Scheduling"
                style={{ border: 'none' }}
              ></iframe>
            </div>
          </div>
        )}
      </div>

      {selectedDate && (
        <CalendarDayModal
          date={selectedDate}
          onClose={() => {
            setSelectedDate(null);
            loadMonthNotes();
          }}
          onScheduleMeeting={handleScheduleMeeting}
        />
      )}

      {showMeeting && (
        <QuickCall
          onClose={() => setShowMeeting(false)}
          roomName="SthillStudiosMain"
        />
      )}
    </div>
  );
}
