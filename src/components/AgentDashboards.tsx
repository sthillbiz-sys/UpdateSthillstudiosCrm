import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useEmployee } from '../lib/employee';
import { Users as Users2, TrendingUp, Phone, Calendar, DollarSign, Eye, X } from 'lucide-react';

interface Agent {
  id: string;
  email: string;
  full_name: string;
  role: string;
  assigned_color: string;
  status?: string;
  isOnline: boolean;
}

interface AgentStats {
  totalLeads: number;
  completedCalls: number;
  scheduledMeetings: number;
  revenue: number;
}

export function AgentDashboards() {
  const { user } = useAuth();
  const { isAdmin, allEmployees } = useEmployee();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [onlinePresence, setOnlinePresence] = useState<Record<string, boolean>>({});
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
    loadPresence();

    const presenceChannel = supabase.channel('presence-tracking')
      .on('presence', { event: 'sync' }, () => {
        loadPresence();
      })
      .subscribe();

    return () => {
      presenceChannel.unsubscribe();
    };
  }, [allEmployees]);

  useEffect(() => {
    if (agents.length > 0) {
      loadAllAgentStats();
    }
  }, [agents]);

  const loadAgents = async () => {
    try {
      const agentList = allEmployees
        .filter(emp => emp.role === 'agent')
        .map(emp => ({
          id: emp.id,
          email: emp.email,
          full_name: emp.full_name || emp.email.split('@')[0],
          role: emp.role,
          assigned_color: emp.assigned_color || '#3B82F6',
          status: emp.status,
          isOnline: false,
        }));

      setAgents(agentList);
    } catch (error) {
      console.error('Error loading agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPresence = async () => {
    try {
      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, status')
        .neq('status', 'offline');

      if (error) throw error;

      const presenceMap: Record<string, boolean> = {};
      data?.forEach(presence => {
        presenceMap[presence.user_id] = true;
      });

      setOnlinePresence(presenceMap);
      setAgents(prev => prev.map(agent => ({
        ...agent,
        isOnline: presenceMap[agent.id] || false,
      })));
    } catch (error) {
      console.error('Error loading presence:', error);
    }
  };

  const loadAllAgentStats = async () => {
    const statsPromises = agents.map(agent => loadAgentStats(agent.id));
    const results = await Promise.all(statsPromises);

    const statsMap: Record<string, AgentStats> = {};
    agents.forEach((agent, index) => {
      statsMap[agent.id] = results[index];
    });

    setAgentStats(statsMap);
  };

  const loadAgentStats = async (agentId: string): Promise<AgentStats> => {
    try {
      const [leadsData, callsData, meetingsData] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact' }).eq('assigned_to', agentId),
        supabase.from('call_history').select('id', { count: 'exact' }).eq('user_id', agentId),
        supabase.from('meetings').select('id', { count: 'exact' }).eq('assigned_to', agentId),
      ]);

      return {
        totalLeads: leadsData.count || 0,
        completedCalls: callsData.count || 0,
        scheduledMeetings: meetingsData.count || 0,
        revenue: 0,
      };
    } catch (error) {
      console.error('Error loading agent stats:', error);
      return {
        totalLeads: 0,
        completedCalls: 0,
        scheduledMeetings: 0,
        revenue: 0,
      };
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 bg-[#FDF8F3] min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 font-semibold">Access Denied</p>
          <p className="text-red-600 text-sm mt-2">Only administrators can view agent dashboards.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 bg-[#FDF8F3] min-h-screen">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#FDF8F3] min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Agent Dashboards</h1>
        <p className="text-sm text-gray-600">Monitor and manage your team's performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Agents</h3>
            <Users2 className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{agents.length}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Online Now</h3>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {agents.filter(a => a.isOnline).length}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Leads</h3>
            <TrendingUp className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {(Object.values(agentStats) as AgentStats[]).reduce((sum, stats) => sum + stats.totalLeads, 0)}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Calls</h3>
            <Phone className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {(Object.values(agentStats) as AgentStats[]).reduce((sum, stats) => sum + stats.completedCalls, 0)}
          </p>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Users2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No agents found</h3>
          <p className="text-gray-600">Add team members with the agent role to see their dashboards here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => {
            const stats = agentStats[agent.id] || {
              totalLeads: 0,
              completedCalls: 0,
              scheduledMeetings: 0,
              revenue: 0,
            };

            return (
              <div
                key={agent.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: agent.assigned_color }}
                      >
                        {getInitials(agent.full_name)}
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">{agent.full_name}</h3>
                        <p className="text-slate-400 text-xs">{agent.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${agent.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      <span className="text-xs text-slate-300">
                        {agent.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-gray-600">Leads</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">{stats.totalLeads}</p>
                    </div>

                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="w-4 h-4 text-green-600" />
                        <span className="text-xs text-gray-600">Calls</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">{stats.completedCalls}</p>
                    </div>

                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-purple-600" />
                        <span className="text-xs text-gray-600">Meetings</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">{stats.scheduledMeetings}</p>
                    </div>

                    <div className="bg-yellow-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="w-4 h-4 text-yellow-600" />
                        <span className="text-xs text-gray-600">Revenue</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">${stats.revenue}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedAgent(agent.id)}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View Dashboard
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {agents.find(a => a.id === selectedAgent)?.full_name}'s Dashboard
                </h2>
                <p className="text-sm text-gray-600">Detailed performance metrics</p>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <p className="text-gray-600">Detailed dashboard view coming soon...</p>
                <p className="text-sm text-gray-500 mt-2">
                  This will show comprehensive analytics, activity logs, and performance metrics for this agent.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
