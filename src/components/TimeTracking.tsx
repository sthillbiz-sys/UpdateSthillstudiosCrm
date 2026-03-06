import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Clock, Coffee, LogOut, Calendar, TrendingUp, Pause, Play, X } from 'lucide-react';

interface ShiftEntry {
  id: string;
  user_id: string;
  shift_date: string;
  clock_in: string;
  clock_out?: string;
  lunch_start?: string;
  lunch_end?: string;
  lunch_duration_minutes: number;
  total_hours?: number;
  status: 'clocked_in' | 'on_lunch' | 'clocked_out';
  notes?: string;
  created_at: string;
}

interface BreakEntry {
  id: string;
  user_id: string;
  shift_id?: string;
  break_start: string;
  break_end?: string;
  duration_minutes: number;
  break_type: string;
  status: 'in_progress' | 'completed';
  notes?: string;
  created_at: string;
}

export function TimeTracking() {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState<ShiftEntry | null>(null);
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [breaks, setBreaks] = useState<BreakEntry[]>([]);
  const [activeBreak, setActiveBreak] = useState<BreakEntry | null>(null);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [breakType, setBreakType] = useState('15-minute');
  const [loading, setLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [view, setView] = useState<'today' | 'week' | 'month' | 'year'>('today');

  const parseAppDate = (value?: string) => {
    if (!value) {
      return null;
    }
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDateCell = (value?: string) => {
    const date = parseAppDate(value);
    return date ? date.toLocaleDateString() : '-';
  };

  const formatTimeCell = (value?: string) => {
    const date = parseAppDate(value);
    return date ? date.toLocaleTimeString() : '-';
  };

  useEffect(() => {
    loadShifts();
    loadBreaks();
    checkActiveShift();
    checkActiveBreak();
  }, [user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeShift && activeShift.status !== 'clocked_out') {
      interval = setInterval(() => {
        const shiftStart = parseAppDate(activeShift.clock_in);
        if (!shiftStart) {
          setElapsedTime(0);
          return;
        }
        const start = shiftStart.getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);

        if (activeShift.lunch_duration_minutes) {
          elapsed -= activeShift.lunch_duration_minutes * 60;
        }

        if (activeShift.status === 'on_lunch' && activeShift.lunch_start) {
          const lunchStartDate = parseAppDate(activeShift.lunch_start);
          if (!lunchStartDate) {
            setElapsedTime(Math.max(0, elapsed));
            return;
          }
          const lunchStart = lunchStartDate.getTime();
          const currentLunchDuration = Math.floor((now - lunchStart) / 1000);
          elapsed -= currentLunchDuration;
        }

        setElapsedTime(Math.max(0, elapsed));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeShift]);

  const loadShifts = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('shift_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('clock_in', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (data) setShifts(data);
    } catch (error) {
      console.error('Error loading shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBreaks = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('break_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('break_start', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (data) setBreaks(data);
    } catch (error) {
      console.error('Error loading breaks:', error);
    }
  };

  const checkActiveShift = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('shift_entries')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['clocked_in', 'on_lunch'])
        .maybeSingle();

      if (error) throw error;
      if (data) setActiveShift(data);
    } catch (error) {
      console.error('Error checking active shift:', error);
    }
  };

  const checkActiveBreak = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('break_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .maybeSingle();

      if (error) throw error;
      if (data) setActiveBreak(data);
    } catch (error) {
      console.error('Error checking active break:', error);
    }
  };

  const handleStartShift = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('shift_entries')
        .insert([
          {
            user_id: user.id,
            shift_date: new Date().toISOString().split('T')[0],
            clock_in: new Date().toISOString(),
            status: 'clocked_in',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      setActiveShift(data);
      loadShifts();
    } catch (error) {
      console.error('Error starting shift:', error);
    }
  };

  const handleLunchStart = async () => {
    if (!activeShift) return;

    try {
      const { data, error } = await supabase
        .from('shift_entries')
        .update({
          lunch_start: new Date().toISOString(),
          status: 'on_lunch',
        })
        .eq('id', activeShift.id)
        .select()
        .single();

      if (error) throw error;
      setActiveShift(data);
      loadShifts();
    } catch (error) {
      console.error('Error starting lunch:', error);
    }
  };

  const handleLunchEnd = async () => {
    if (!activeShift || !activeShift.lunch_start) return;

    try {
      const lunchEnd = new Date();
      const lunchStart = parseAppDate(activeShift.lunch_start);
      if (!lunchStart) {
        throw new Error('Unable to read lunch start time.');
      }
      const lunchDuration = Math.floor((lunchEnd.getTime() - lunchStart.getTime()) / 60000);

      const { data, error } = await supabase
        .from('shift_entries')
        .update({
          lunch_end: lunchEnd.toISOString(),
          lunch_duration_minutes: lunchDuration,
          status: 'clocked_in',
        })
        .eq('id', activeShift.id)
        .select()
        .single();

      if (error) throw error;
      setActiveShift(data);
      loadShifts();
    } catch (error) {
      console.error('Error ending lunch:', error);
    }
  };

  const handleEndShift = async () => {
    if (!activeShift) return;

    try {
      const clockOut = new Date();
      const clockIn = parseAppDate(activeShift.clock_in);
      if (!clockIn) {
        throw new Error('Unable to read shift start time.');
      }
      const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
      const lunchMinutes = activeShift.lunch_duration_minutes || 0;
      const workedMinutes = totalMinutes - lunchMinutes;
      const totalHours = Number((workedMinutes / 60).toFixed(2));

      const { error } = await supabase
        .from('shift_entries')
        .update({
          clock_out: clockOut.toISOString(),
          total_hours: totalHours,
          status: 'clocked_out',
        })
        .eq('id', activeShift.id);

      if (error) throw error;
      setActiveShift(null);
      setElapsedTime(0);
      loadShifts();
    } catch (error) {
      console.error('Error ending shift:', error);
    }
  };

  const handleStartBreak = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('break_entries')
        .insert([
          {
            user_id: user.id,
            shift_id: activeShift?.id,
            break_start: new Date().toISOString(),
            break_type: breakType,
            status: 'in_progress',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      setActiveBreak(data);
      setShowBreakModal(false);
      loadBreaks();
    } catch (error) {
      console.error('Error starting break:', error);
    }
  };

  const handleEndBreak = async () => {
    if (!activeBreak) return;

    try {
      const breakEnd = new Date();
      const breakStart = parseAppDate(activeBreak.break_start);
      if (!breakStart) {
        throw new Error('Unable to read break start time.');
      }
      const duration = Math.floor((breakEnd.getTime() - breakStart.getTime()) / 60000);

      const { error } = await supabase
        .from('break_entries')
        .update({
          break_end: breakEnd.toISOString(),
          duration_minutes: duration,
          status: 'completed',
        })
        .eq('id', activeBreak.id);

      if (error) throw error;
      setActiveBreak(null);
      loadBreaks();
    } catch (error) {
      console.error('Error ending break:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(2)}h`;
  };

  const getFilteredShifts = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    return shifts.filter((shift) => {
      const shiftDate = parseAppDate(shift.shift_date);
      if (!shiftDate) {
        return false;
      }

      switch (view) {
        case 'today':
          return shift.shift_date === today;
        case 'week':
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          return shiftDate >= weekStart;
        case 'month':
          return (
            shiftDate.getMonth() === now.getMonth() &&
            shiftDate.getFullYear() === now.getFullYear()
          );
        case 'year':
          return shiftDate.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    });
  };

  const getTotalHours = () => {
    const filtered = getFilteredShifts();
    return filtered.reduce((sum, shift) => sum + (shift.total_hours || 0), 0);
  };

  const getAverageHoursPerDay = () => {
    const filtered = getFilteredShifts();
    const uniqueDays = new Set(filtered.map((s) => s.shift_date)).size;
    return uniqueDays > 0 ? getTotalHours() / uniqueDays : 0;
  };

  const getViewLabel = () => {
    switch (view) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      case 'year':
        return 'This Year';
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#FDF8F3] min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Time Tracking</h1>
        <p className="text-sm text-gray-600">Track your shifts and work hours</p>
      </div>

      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-xl p-8 mb-8 text-white">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Current Shift</h2>
            <p className="text-blue-100 text-sm">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <Clock className="w-12 h-12 text-blue-200" />
        </div>

        {activeShift ? (
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center">
              <p className="text-sm text-blue-100 mb-2">Time Worked Today</p>
              <p className="text-5xl font-bold tracking-tight">{formatDuration(elapsedTime)}</p>
              <p className="text-xs text-blue-200 mt-2">
                Started at {formatTimeCell(activeShift.clock_in)}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {activeShift.status === 'clocked_in' && !activeBreak && (
                <>
                  <button
                    onClick={handleLunchStart}
                    className="flex flex-col items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-yellow-900 rounded-xl p-4 transition-all font-medium shadow-lg"
                  >
                    <Coffee className="w-5 h-5" />
                    <span className="text-xs font-semibold">Lunch</span>
                  </button>
                  <button
                    onClick={() => setShowBreakModal(true)}
                    className="flex flex-col items-center gap-2 bg-orange-500 hover:bg-orange-400 text-orange-900 rounded-xl p-4 transition-all font-medium shadow-lg"
                  >
                    <Pause className="w-5 h-5" />
                    <span className="text-xs font-semibold">Break</span>
                  </button>
                  <button
                    onClick={handleEndShift}
                    className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 text-white rounded-xl p-4 font-semibold transition-all shadow-lg"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="text-xs">End Shift</span>
                  </button>
                </>
              )}

              {activeShift.status === 'clocked_in' && activeBreak && (
                <button
                  onClick={handleEndBreak}
                  className="col-span-3 flex items-center justify-center gap-2 bg-orange-400 hover:bg-orange-300 text-orange-900 rounded-xl p-4 font-semibold transition-all"
                >
                  <Play className="w-5 h-5" />
                  End Break
                </button>
              )}

              {activeShift.status === 'on_lunch' && (
                <button
                  onClick={handleLunchEnd}
                  className="col-span-3 flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 rounded-xl p-4 font-semibold transition-all"
                >
                  <Coffee className="w-5 h-5" />
                  End Lunch Break
                </button>
              )}
            </div>

            {activeShift.status === 'on_lunch' && (
              <div className="bg-yellow-400/20 border border-yellow-400/30 rounded-lg p-3 text-center">
                <p className="text-sm font-medium text-yellow-100">Currently on lunch break</p>
              </div>
            )}

            {activeBreak && (
              <div className="bg-orange-400/20 border border-orange-400/30 rounded-lg p-3 text-center">
                <p className="text-sm font-medium text-orange-100">
                  On {activeBreak.break_type} break since{' '}
                  {formatTimeCell(activeBreak.break_start)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleStartShift}
            className="max-w-xs mx-auto flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-blue-700 rounded-xl px-8 py-4 font-bold text-lg transition-all shadow-lg"
          >
            <Clock className="w-6 h-6" />
            Start Shift
          </button>
        )}
      </div>

      {showBreakModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Take a Break</h2>
              <button
                onClick={() => setShowBreakModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Break Duration
                </label>
                <select
                  value={breakType}
                  onChange={(e) => setBreakType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="15-minute">15 Minutes</option>
                  <option value="30-minute">30 Minutes</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={handleStartBreak}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <Pause className="w-5 h-5" />
                  Start Break
                </button>
                <button
                  onClick={() => setShowBreakModal(false)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Time Summary</h2>
            <div className="flex gap-2">
              {(['today', 'week', 'month', 'year'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    view === v
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-blue-900">Total Hours</h3>
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-900">{formatHours(getTotalHours())}</p>
              <p className="text-xs text-blue-700 mt-1">{getViewLabel()}</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-green-900">Average/Day</h3>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-900">
                {formatHours(getAverageHoursPerDay())}
              </p>
              <p className="text-xs text-green-700 mt-1">{getViewLabel()}</p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-orange-900">Shifts Worked</h3>
                <Calendar className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-3xl font-bold text-orange-900">{getFilteredShifts().length}</p>
              <p className="text-xs text-orange-700 mt-1">{getViewLabel()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-slate-900">Recent Breaks</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Break Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Start Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  End Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {breaks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 text-sm">
                    No breaks recorded yet
                  </td>
                </tr>
              ) : (
                breaks.slice(0, 10).map((breakEntry) => (
                  <tr key={breakEntry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {formatDateCell(breakEntry.break_start)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                      {breakEntry.break_type}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatTimeCell(breakEntry.break_start)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {breakEntry.break_end ? formatTimeCell(breakEntry.break_end) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {breakEntry.duration_minutes > 0
                        ? `${breakEntry.duration_minutes} min`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          breakEntry.status === 'in_progress'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {breakEntry.status === 'in_progress' ? 'Active' : 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-slate-900">Shift History - {getViewLabel()}</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Clock In
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Clock Out
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Lunch
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Total Hours
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {getFilteredShifts().length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 text-sm">
                    No shifts recorded for {getViewLabel().toLowerCase()}
                  </td>
                </tr>
              ) : (
                getFilteredShifts().map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {formatDateCell(shift.shift_date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatTimeCell(shift.clock_in)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {shift.clock_out ? formatTimeCell(shift.clock_out) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {shift.lunch_duration_minutes > 0
                        ? `${shift.lunch_duration_minutes} min`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                      {shift.total_hours ? formatHours(shift.total_hours) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          shift.status === 'clocked_in'
                            ? 'bg-green-100 text-green-800'
                            : shift.status === 'on_lunch'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {shift.status === 'clocked_in'
                          ? 'Active'
                          : shift.status === 'on_lunch'
                          ? 'On Lunch'
                          : 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
