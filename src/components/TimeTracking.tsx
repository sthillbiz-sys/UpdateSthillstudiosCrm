import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Clock, Coffee, LogOut, Calendar, TrendingUp } from 'lucide-react';

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

export function TimeTracking() {
  const { user } = useAuth();
  const [activeShift, setActiveShift] = useState<ShiftEntry | null>(null);
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [view, setView] = useState<'today' | 'week' | 'month' | 'year'>('today');

  useEffect(() => {
    loadShifts();
    checkActiveShift();
  }, [user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeShift && activeShift.status !== 'clocked_out') {
      interval = setInterval(() => {
        const start = new Date(activeShift.clock_in).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);

        if (activeShift.lunch_duration_minutes) {
          elapsed -= activeShift.lunch_duration_minutes * 60;
        }

        if (activeShift.status === 'on_lunch' && activeShift.lunch_start) {
          const lunchStart = new Date(activeShift.lunch_start).getTime();
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
      const lunchStart = new Date(activeShift.lunch_start);
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
      const clockIn = new Date(activeShift.clock_in);
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
      const shiftDate = new Date(shift.shift_date);

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
                Started at {new Date(activeShift.clock_in).toLocaleTimeString()}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {activeShift.status === 'clocked_in' && (
                <>
                  <button
                    onClick={handleLunchStart}
                    className="flex flex-col items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl p-4 transition-all"
                  >
                    <Coffee className="w-6 h-6" />
                    <span className="text-sm font-medium">Start Lunch</span>
                  </button>
                  <button
                    onClick={handleEndShift}
                    className="col-span-2 flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-blue-700 rounded-xl p-4 font-semibold transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                    End Shift
                  </button>
                </>
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
          </div>
        ) : (
          <button
            onClick={handleStartShift}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-blue-700 rounded-xl p-6 font-bold text-lg transition-all shadow-lg"
          >
            <Clock className="w-6 h-6" />
            Start Shift
          </button>
        )}
      </div>

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
                      {new Date(shift.shift_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(shift.clock_in).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {shift.clock_out ? new Date(shift.clock_out).toLocaleTimeString() : '-'}
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
