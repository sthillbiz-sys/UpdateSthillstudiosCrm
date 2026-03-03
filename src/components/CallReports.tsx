import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Phone, Clock, TrendingUp, BarChart3, Download } from 'lucide-react';

interface CallReport {
  id: string;
  user_email: string;
  contact_name: string;
  contact_phone: string;
  duration: number;
  outcome: string;
  notes: string;
  called_at: string;
}

export function CallReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<CallReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    loadReports();
  }, [user, filter]);

  const loadReports = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('call_history')
        .select('*')
        .order('called_at', { ascending: false });

      const now = new Date();
      if (filter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('called_at', today.toISOString());
      } else if (filter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte('called_at', weekAgo.toISOString());
      } else if (filter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query = query.gte('called_at', monthAgo.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      if (data) setReports(data);
    } catch (error) {
      console.error('Error loading call reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTotalCalls = () => reports.length;

  const getTotalDuration = () => {
    const totalMinutes = reports.reduce((sum, report) => sum + (report.duration || 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const getAverageDuration = () => {
    if (reports.length === 0) return '0m';
    const avgMinutes = Math.floor(reports.reduce((sum, report) => sum + (report.duration || 0), 0) / reports.length);
    return `${avgMinutes}m`;
  };

  const getSuccessRate = () => {
    if (reports.length === 0) return '0%';
    const successful = reports.filter(r => r.outcome === 'successful' || r.outcome === 'completed').length;
    return `${Math.round((successful / reports.length) * 100)}%`;
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const handleExportReport = () => {
    const headers = ['Agent', 'Contact', 'Phone', 'DurationMinutes', 'Outcome', 'CalledAt', 'Notes'];
    const rows = reports.map((report) => [
      report.user_email || '',
      report.contact_name || '',
      report.contact_phone || '',
      String(report.duration || 0),
      report.outcome || '',
      report.called_at || '',
      report.notes || '',
    ]);
    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `call-reports-${filter}-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Call Reports</h1>
          <p className="text-sm text-gray-600">Track call activity and performance</p>
        </div>
        <button
          onClick={handleExportReport}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          All Time
        </button>
        <button
          onClick={() => setFilter('today')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'today'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setFilter('week')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'week'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          This Week
        </button>
        <button
          onClick={() => setFilter('month')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'month'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          This Month
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Calls</h3>
            <Phone className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{getTotalCalls()}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Duration</h3>
            <Clock className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{getTotalDuration()}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Avg Duration</h3>
            <BarChart3 className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{getAverageDuration()}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Success Rate</h3>
            <TrendingUp className="w-5 h-5 text-orange-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{getSuccessRate()}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-slate-900">Call History</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Outcome
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 text-sm">
                    No call reports available for the selected period.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {report.user_email}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      {report.contact_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {report.contact_phone}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatDuration(report.duration)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          report.outcome === 'successful' || report.outcome === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : report.outcome === 'no_answer'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {report.outcome}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(report.called_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                      {report.notes || '-'}
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
