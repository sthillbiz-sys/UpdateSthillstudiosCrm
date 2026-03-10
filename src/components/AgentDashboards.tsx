import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useEmployee } from '../lib/employee';
import { Users as Users2, TrendingUp, Phone, Calendar, DollarSign, Eye, Upload, X } from 'lucide-react';
import { apiGet, apiPut, uploadLeadImportFile } from '../lib/api';

interface Agent {
  id: string;
  userId: string | null;
  email: string;
  full_name: string;
  role: string;
  assigned_color: string;
  status?: string;
  isOnline: boolean;
}

interface AuthUserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AgentStats {
  totalLeads: number;
  completedCalls: number;
  scheduledMeetings: number;
  revenue: number;
}

interface AgentDashboardDetails {
  leads: Array<{ id: string; name?: string; email?: string; source?: string; date?: string; created_at?: string }>;
  calls: Array<{ id: string; contact_name?: string; contact_phone?: string; outcome?: string; called_at?: string; duration?: number }>;
  meetings: Array<{ id: string; title?: string; scheduled_date?: string; scheduled_time?: string; status?: string }>;
}

interface AssignableLead {
  id: number;
  name: string;
  email: string;
  source: string;
  timestamp: string;
  assignedTo: string | null;
}

const ACCEPTED_IMPORT_EXTENSIONS = ['.xlsx', '.xls', '.pdf'];

export function AgentDashboards() {
  const { isAdmin, allEmployees, loading: employeesLoading, refreshAllEmployees } = useEmployee();
  const [onlinePresence, setOnlinePresence] = useState<Record<string, boolean>>({});
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, AgentStats>>({});
  const [overallLeadsCount, setOverallLeadsCount] = useState(0);
  const [overallCallsCount, setOverallCallsCount] = useState(0);
  const [agentDetails, setAgentDetails] = useState<Record<string, AgentDashboardDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [authUsersByEmail, setAuthUsersByEmail] = useState<Record<string, AuthUserRecord>>({});
  const [assigningAgentId, setAssigningAgentId] = useState<string | null>(null);
  const [assignableLeads, setAssignableLeads] = useState<AssignableLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [routingSearch, setRoutingSearch] = useState('');
  const [loadingAssignableLeads, setLoadingAssignableLeads] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [draggingLeadId, setDraggingLeadId] = useState<number | null>(null);
  const [dropTargetAgentId, setDropTargetAgentId] = useState<string | null>(null);
  const [routingLeadId, setRoutingLeadId] = useState<number | null>(null);
  const [uploadingLeadImport, setUploadingLeadImport] = useState(false);
  const [leadImportDragActive, setLeadImportDragActive] = useState(false);
  const [agentLeadImportDragActive, setAgentLeadImportDragActive] = useState(false);
  const [leadImportMessage, setLeadImportMessage] = useState('');
  const [leadImportError, setLeadImportError] = useState('');
  const leadImportInputRef = useRef<HTMLInputElement>(null);
  const agentLeadImportInputRef = useRef<HTMLInputElement>(null);

  const agents = useMemo<Agent[]>(() => {
    const mapped = allEmployees.map((emp) => {
      const email = String(emp.email || '').trim();
      const emailKey = email.toLowerCase();
      const linkedUser = emailKey !== '' ? authUsersByEmail[emailKey] || null : null;
      return {
        id: emp.id,
        userId: linkedUser ? String(linkedUser.id) : null,
        email,
        full_name: emp.full_name || (email !== '' ? email.split('@')[0] : 'Agent'),
        role: emp.role,
        assigned_color: emp.assigned_color || '#3B82F6',
        status: emp.status,
        isOnline:
          Boolean(onlinePresence[`id:${emp.id}`]) ||
          (emailKey !== '' && Boolean(onlinePresence[`email:${emailKey}`])),
      };
    });

    const explicitAgents = mapped.filter((emp) => emp.role === 'agent');
    if (explicitAgents.length > 0) {
      return explicitAgents;
    }

    // Fallback for legacy data where non-admin team members may still be "employee".
    return mapped.filter((emp) => emp.role !== 'admin');
  }, [allEmployees, authUsersByEmail, onlinePresence]);

  const selectedAgentMeta = useMemo(
    () => agents.find((agent) => agent.id === selectedAgent) || null,
    [agents, selectedAgent],
  );

  const assigningAgent = useMemo(
    () => agents.find((agent) => agent.id === assigningAgentId) || null,
    [agents, assigningAgentId],
  );

  const filteredAssignableLeads = useMemo(() => {
    const query = leadSearch.trim().toLowerCase();
    const rows = assignableLeads.filter((lead) => {
      if (!query) {
        return true;
      }
      return (
        lead.name.toLowerCase().includes(query) ||
        lead.email.toLowerCase().includes(query) ||
        lead.source.toLowerCase().includes(query)
      );
    });

    return rows.sort((left, right) => {
      const leftAssigned = left.assignedTo === assigningAgent?.userId ? 1 : 0;
      const rightAssigned = right.assignedTo === assigningAgent?.userId ? 1 : 0;
      if (leftAssigned !== rightAssigned) {
        return leftAssigned - rightAssigned;
      }
      return right.id - left.id;
    });
  }, [assignableLeads, assigningAgent?.userId, leadSearch]);

  const selectableFilteredLeadIds = useMemo(
    () =>
      filteredAssignableLeads
        .filter((lead) => lead.assignedTo !== assigningAgent?.userId)
        .map((lead) => lead.id),
    [assigningAgent?.userId, filteredAssignableLeads],
  );

  const allFilteredLeadsSelected =
    selectableFilteredLeadIds.length > 0 &&
    selectableFilteredLeadIds.every((leadId) => selectedLeadIds.includes(leadId));

  const draggableLeadPool = useMemo(() => {
    const query = routingSearch.trim().toLowerCase();
    return assignableLeads
      .filter((lead) => !lead.assignedTo)
      .filter((lead) => {
        if (!query) {
          return true;
        }
        return (
          lead.name.toLowerCase().includes(query) ||
          lead.email.toLowerCase().includes(query) ||
          lead.source.toLowerCase().includes(query)
        );
      })
      .slice(0, 18);
  }, [assignableLeads, routingSearch]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void refreshAllEmployees();
    void loadAuthUsers();
    void loadAssignableLeads();
    const refreshId = window.setInterval(() => {
      void refreshAllEmployees();
      void loadAuthUsers();
      void loadAssignableLeads();
    }, 30000);
    return () => {
      window.clearInterval(refreshId);
    };
  }, [isAdmin, refreshAllEmployees]);

  useEffect(() => {
    void loadPresence();
    const intervalId = window.setInterval(() => {
      void loadPresence();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [allEmployees]);

  useEffect(() => {
    if (agents.length > 0) {
      void loadAllAgentStats(agents);
    } else {
      setAgentStats({});
    }
  }, [agents]);

  useEffect(() => {
    void loadOverallTotals();
  }, [allEmployees]);

  const buildFallbackPresenceMap = () => {
    const fallbackMap: Record<string, boolean> = {};
    for (const employee of allEmployees) {
      const email = String(employee.email || '').trim().toLowerCase();
      fallbackMap[`id:${employee.id}`] = false;
      if (email !== '') {
        fallbackMap[`email:${email}`] = false;
      }
    }
    return fallbackMap;
  };

  const loadPresence = async () => {
    if (allEmployees.length === 0) {
      setOnlinePresence({});
      setPresenceLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, status, is_online, email, employee')
        .neq('status', 'offline');

      if (error) throw error;

      const presenceMap: Record<string, boolean> = {};
      data?.forEach(presence => {
        const status = String(presence.status || 'offline').toLowerCase();
        const isOnline = Boolean(presence.is_online) || status !== 'offline';
        if (presence.user_id !== undefined && presence.user_id !== null) {
          presenceMap[`id:${String(presence.user_id)}`] = isOnline;
        }

        const emailRaw = presence?.employee?.email || presence?.email || '';
        const email = String(emailRaw).trim().toLowerCase();
        if (email !== '') {
          presenceMap[`email:${email}`] = isOnline;
        }
      });

      if (Object.keys(presenceMap).length === 0) {
        setOnlinePresence(buildFallbackPresenceMap());
      } else {
        setOnlinePresence(presenceMap);
      }
    } catch (error) {
      console.error('Error loading presence:', error);
      setOnlinePresence(buildFallbackPresenceMap());
    } finally {
      setPresenceLoading(false);
    }
  };

  const loadAuthUsers = async () => {
    if (!isAdmin) {
      setAuthUsersByEmail({});
      return;
    }

    try {
      const rows = await apiGet<AuthUserRecord[]>('/users');
      const nextMap: Record<string, AuthUserRecord> = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        const email = String(row.email || '').trim().toLowerCase();
        if (email === '') {
          continue;
        }
        nextMap[email] = row;
      }
      setAuthUsersByEmail(nextMap);
    } catch (error) {
      console.error('Error loading auth users:', error);
      setAuthUsersByEmail({});
    }
  };

  const loadAllAgentStats = async (agentList: Agent[]) => {
    const statsPromises = agentList.map((agent) => loadAgentStats(agent));
    const results = await Promise.all(statsPromises);

    const statsMap: Record<string, AgentStats> = {};
    agentList.forEach((agent, index) => {
      statsMap[agent.id] = results[index];
    });

    setAgentStats(statsMap);
  };

  const loadOverallTotals = async () => {
    try {
      const [leadsData, callsData] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('call_history').select('id', { count: 'exact', head: true }),
      ]);

      setOverallLeadsCount(leadsData.count || 0);
      setOverallCallsCount(callsData.count || 0);
    } catch (error) {
      console.error('Error loading overall dashboard totals:', error);
      setOverallLeadsCount(0);
      setOverallCallsCount(0);
    }
  };

  const loadAgentStats = async (agent: Agent): Promise<AgentStats> => {
    if (!agent.userId) {
      return {
        totalLeads: 0,
        completedCalls: 0,
        scheduledMeetings: 0,
        revenue: 0,
      };
    }

    try {
      const [leadsData, callsData, meetingsData] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact' }).eq('assigned_to', agent.userId),
        supabase.from('call_history').select('id', { count: 'exact' }).eq('user_id', agent.userId),
        supabase.from('meetings').select('id', { count: 'exact' }).eq('assigned_to', agent.userId),
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

  const normalizeAssignableLead = (row: Record<string, unknown>): AssignableLead => ({
    id: Number(row.id || 0),
    name: String(row.name || 'Unknown'),
    email: String(row.email || ''),
    source: String(row.source || 'manual'),
    timestamp: String(row.timestamp || row.date || row.created_at || ''),
    assignedTo:
      row.created_by_user_id !== undefined &&
      row.created_by_user_id !== null &&
      row.created_by_user_id !== ''
        ? String(row.created_by_user_id)
        : null,
  });

  const loadAgentDetails = async (agent: Agent) => {
    if (!agent.userId) {
      setAgentDetails((prev) => ({
        ...prev,
        [agent.id]: { leads: [], calls: [], meetings: [] },
      }));
      return;
    }

    setLoadingDetails(true);
    try {
      const [leadsRes, callsRes, meetingsRes] = await Promise.all([
        supabase
          .from('leads')
          .select('*')
          .eq('assigned_to', agent.userId)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('call_history')
          .select('*')
          .eq('user_id', agent.userId)
          .order('called_at', { ascending: false })
          .limit(8),
        supabase
          .from('meetings')
          .select('*')
          .eq('assigned_to', agent.userId)
          .order('scheduled_date', { ascending: false })
          .order('scheduled_time', { ascending: false })
          .limit(8),
      ]);

      setAgentDetails((prev) => ({
        ...prev,
        [agent.id]: {
          leads: leadsRes.data || [],
          calls: callsRes.data || [],
          meetings: meetingsRes.data || [],
        },
      }));
    } catch (error) {
      console.error('Error loading agent details:', error);
      setAgentDetails((prev) => ({
        ...prev,
        [agent.id]: { leads: [], calls: [], meetings: [] },
      }));
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenAgentDashboard = async (agentId: string) => {
    setSelectedAgent(agentId);
    const agent = agents.find((item) => item.id === agentId);
    if (agent && !agentDetails[agentId]) {
      await loadAgentDetails(agent);
    }
  };

  const loadAssignableLeads = async () => {
    setLoadingAssignableLeads(true);
    try {
      const rows = await apiGet<Record<string, unknown>[]>('/leads');
      const mapped = Array.isArray(rows) ? rows.map(normalizeAssignableLead) : [];
      setAssignableLeads(mapped);
    } catch (error) {
      console.error('Error loading leads for assignment:', error);
      setAssignableLeads([]);
    } finally {
      setLoadingAssignableLeads(false);
    }
  };

  const handleOpenAssignModal = async (agent: Agent) => {
    if (!agent.userId) {
      window.alert(`No linked login user was found for ${agent.full_name}. Match the employee email to a user account first.`);
      return;
    }

    setAssigningAgentId(agent.id);
    setSelectedLeadIds([]);
    setLeadSearch('');
    await loadAssignableLeads();
  };

  const persistLeadAssignment = async (leadId: number, agent: Agent) => {
    if (!agent.userId) {
      throw new Error(`No linked login user was found for ${agent.full_name}.`);
    }

    await apiPut(`/leads/${leadId}`, { created_by_user_id: Number(agent.userId) });
  };

  const refreshAgentAssignmentViews = async (agent: Agent) => {
    await Promise.all([
      loadAssignableLeads(),
      loadAllAgentStats(agents),
      selectedAgent === agent.id ? loadAgentDetails(agent) : Promise.resolve(),
    ]);
  };

  const toggleSelectedLead = (leadId: number) => {
    setSelectedLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
  };

  const toggleSelectAllFilteredLeads = () => {
    if (selectableFilteredLeadIds.length === 0) {
      return;
    }

    setSelectedLeadIds((current) => {
      if (allFilteredLeadsSelected) {
        return current.filter((leadId) => !selectableFilteredLeadIds.includes(leadId));
      }

      return Array.from(new Set([...current, ...selectableFilteredLeadIds]));
    });
  };

  const handleAssignSelectedLeads = async () => {
    if (!assigningAgent?.userId || selectedLeadIds.length === 0) {
      return;
    }

    setSavingAssignments(true);
    try {
      const results = await Promise.allSettled(
        selectedLeadIds.map((leadId) => persistLeadAssignment(leadId, assigningAgent)),
      );
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length > 0) {
        const firstFailure = failures[0]?.reason;
        throw (
          firstFailure instanceof Error
            ? firstFailure
            : new Error('Failed to assign one or more leads.')
        );
      }

      setSelectedLeadIds([]);
      await refreshAgentAssignmentViews(assigningAgent);
    } catch (error) {
      console.error('Error assigning leads:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to assign leads.');
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleDropLeadToAgent = async (leadId: number, agent: Agent) => {
    if (!agent.userId || leadId <= 0) {
      setDropTargetAgentId(null);
      return;
    }

    setRoutingLeadId(leadId);
    setDropTargetAgentId(null);
    try {
      await persistLeadAssignment(leadId, agent);
      await refreshAgentAssignmentViews(agent);
    } catch (error) {
      console.error('Error routing lead:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to assign lead.');
    } finally {
      setDraggingLeadId(null);
      setRoutingLeadId(null);
    }
  };

  const refreshDashboardAfterImport = async () => {
    await Promise.all([
      loadAssignableLeads(),
      loadOverallTotals(),
      loadAllAgentStats(agents),
    ]);

    if (selectedAgentMeta) {
      await loadAgentDetails(selectedAgentMeta);
    }
  };

  const isSupportedImportFile = (fileName: string) => {
    const lower = fileName.toLowerCase();
    return ACCEPTED_IMPORT_EXTENSIONS.some((extension) => lower.endsWith(extension));
  };

  const handleLeadImport = async ({
    file = null,
    rawText = '',
    assignToUserId = null,
    sourceName = '',
    successLabel = '',
  }: {
    file?: File | null;
    rawText?: string;
    assignToUserId?: string | null;
    sourceName?: string;
    successLabel?: string;
  }) => {
    const trimmedRawText = rawText.trim();
    const hasFile = Boolean(file);
    const hasRawText = trimmedRawText.length > 0;

    if (!hasFile && !hasRawText) {
      return;
    }

    if (file && !isSupportedImportFile(file.name)) {
      setLeadImportError('Upload a BamLead Excel/PDF file or drop BamLead lead text.');
      setLeadImportMessage('');
      return;
    }

    setUploadingLeadImport(true);
    setLeadImportError('');
    setLeadImportMessage('');

    try {
      const response = await uploadLeadImportFile({
        file,
        rawText: hasRawText ? trimmedRawText : undefined,
        assignToUserId,
        sourceName: sourceName || file?.name || 'BamLead drag import',
      });
      await refreshDashboardAfterImport();
      const importedCount = response?.count || 0;
      setLeadImportMessage(
        successLabel
          ? successLabel.replace('{{count}}', String(importedCount))
          : `Imported ${importedCount} leads from ${file?.name || 'BamLead drag data'}.`,
      );
    } catch (error) {
      console.error('Error importing BamLead leads:', error);
      setLeadImportError(error instanceof Error ? error.message : 'Failed to import the BamLead leads.');
    } finally {
      setUploadingLeadImport(false);
      setLeadImportDragActive(false);
      setAgentLeadImportDragActive(false);
      if (leadImportInputRef.current) {
        leadImportInputRef.current.value = '';
      }
      if (agentLeadImportInputRef.current) {
        agentLeadImportInputRef.current.value = '';
      }
    }
  };

  const handleLeadImportInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    await handleLeadImport({ file });
  };

  const handleLeadImportDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setLeadImportDragActive(false);
    const file = event.dataTransfer.files?.[0] || null;
    const rawText = event.dataTransfer.getData('text/plain');

    await handleLeadImport({
      file,
      rawText,
      sourceName: file?.name || 'BamLead drag import',
    });
  };

  const handleAgentLeadImportInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!selectedAgentMeta) {
      return;
    }
    await handleTargetAgentLeadImport(selectedAgentMeta.userId, selectedAgentMeta.full_name, file, '');
  };

  const handleAgentLeadImportDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setAgentLeadImportDragActive(false);
    if (!selectedAgentMeta) {
      return;
    }
    const file = event.dataTransfer.files?.[0] || null;
    const rawText = event.dataTransfer.getData('text/plain');
    await handleTargetAgentLeadImport(selectedAgentMeta.userId, selectedAgentMeta.full_name, file, rawText);
  };

  const handleTargetAgentLeadImport = async (
    targetUserId: string | null,
    agentName: string,
    file: File | null,
    rawText: string,
  ) => {
    if (!targetUserId) {
      setLeadImportError('This employee is not linked to a login user yet.');
      setLeadImportMessage('');
      return;
    }

    await handleLeadImport({
      file,
      rawText,
      assignToUserId: targetUserId,
      sourceName: file?.name || `${agentName} BamLead drag import`,
      successLabel: `Imported {{count}} leads directly to ${agentName}.`,
    });
  };

  const handleAssigningAgentLeadImportInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!assigningAgent) {
      return;
    }
    await handleTargetAgentLeadImport(assigningAgent.userId, assigningAgent.full_name, file, '');
  };

  const handleAssigningAgentLeadImportDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setAgentLeadImportDragActive(false);
    if (!assigningAgent) {
      return;
    }
    const file = event.dataTransfer.files?.[0] || null;
    const rawText = event.dataTransfer.getData('text/plain');
    await handleTargetAgentLeadImport(assigningAgent.userId, assigningAgent.full_name, file, rawText);
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

  if (employeesLoading || presenceLoading) {
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

  const statsValues = Object.values(agentStats) as AgentStats[];
  const totalLeads = Math.max(overallLeadsCount, statsValues.reduce((sum, stats) => sum + stats.totalLeads, 0));
  const totalCalls = Math.max(overallCallsCount, statsValues.reduce((sum, stats) => sum + stats.completedCalls, 0));

  return (
    <div className="p-8 bg-[#FDF8F3] min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Agent Dashboards</h1>
        <p className="text-sm text-gray-600">Monitor and manage your team's performance</p>
      </div>

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">BamLead Import</h2>
            <p className="mt-1 text-sm text-gray-600">
              Admins can drag and drop BamLead Excel or PDF exports here. Imported leads go into the unassigned routing queue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => leadImportInputRef.current?.click()}
            disabled={uploadingLeadImport}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Upload className="h-4 w-4" />
            {uploadingLeadImport ? 'Importing...' : 'Browse Files'}
          </button>
        </div>

        <input
          ref={leadImportInputRef}
          type="file"
          accept=".xlsx,.xls,.pdf"
          onChange={(event) => {
            void handleLeadImportInputChange(event);
          }}
          className="hidden"
        />

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploadingLeadImport) {
              setLeadImportDragActive(true);
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!uploadingLeadImport) {
              setLeadImportDragActive(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) {
              setLeadImportDragActive(false);
            }
          }}
          onDrop={(event) => {
            void handleLeadImportDrop(event);
          }}
          className={`mt-5 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            leadImportDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 bg-slate-50'
          }`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
            <Upload className={`h-6 w-6 ${leadImportDragActive ? 'text-blue-600' : 'text-slate-500'}`} />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-900">
            Drop BamLead Excel or PDF files here
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Accepted formats: `.xlsx`, `.xls`, `.pdf`
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Best results come from BamLead lead exports such as verified leads and intelligence reports.
          </p>
        </div>

        {leadImportMessage && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {leadImportMessage}
          </div>
        )}

        {leadImportError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {leadImportError}
          </div>
        )}
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
            {totalLeads}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Calls</h3>
            <Phone className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {totalCalls}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Lead Routing</h2>
            <p className="text-sm text-gray-600">
              Drag an unassigned lead and drop it on an agent card to assign it.
            </p>
          </div>
          <input
            type="text"
            value={routingSearch}
            onChange={(event) => setRoutingSearch(event.target.value)}
            placeholder="Search unassigned leads"
            className="w-full lg:w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        {loadingAssignableLeads ? (
          <div className="text-sm text-gray-500">Loading lead queue...</div>
        ) : draggableLeadPool.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            No unassigned leads available to drag.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {draggableLeadPool.map((lead) => (
              <div
                key={lead.id}
                draggable
                onDragStart={(event) => {
                  setDraggingLeadId(lead.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(lead.id));
                }}
                onDragEnd={() => {
                  setDraggingLeadId(null);
                  setDropTargetAgentId(null);
                }}
                className={`rounded-lg border bg-slate-50 p-4 cursor-grab active:cursor-grabbing transition-colors ${
                  draggingLeadId === lead.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{lead.name}</p>
                    <p className="text-sm text-gray-500 truncate">{lead.email || 'No email provided'}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] uppercase tracking-wide text-slate-600 border border-slate-200">
                    {lead.source || 'manual'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
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
                onDragOver={(event) => {
                  if (!agent.userId) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTargetAgentId(agent.id);
                }}
                onDragLeave={() => {
                  setDropTargetAgentId((current) => (current === agent.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const rawLeadId = Number(event.dataTransfer.getData('text/plain') || draggingLeadId || 0);
                  void handleDropLeadToAgent(rawLeadId, agent);
                }}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-all ${
                  dropTargetAgentId === agent.id
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : 'border-gray-200'
                }`}
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

                  <div className={`mb-4 rounded-lg border border-dashed px-4 py-3 text-sm transition-colors ${
                    dropTargetAgentId === agent.id
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}>
                    {!agent.userId
                      ? 'This agent is not linked to a login user.'
                      : routingLeadId !== null && dropTargetAgentId === agent.id
                        ? 'Release to assign the dragged lead here'
                        : 'Drop a lead here to assign it'}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => void handleOpenAssignModal(agent)}
                      disabled={!agent.userId}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 disabled:text-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Assign Leads
                    </button>
                    <button
                      onClick={() => void handleOpenAgentDashboard(agent.id)}
                      className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View Dashboard
                    </button>
                  </div>
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
                  {selectedAgentMeta?.full_name || 'Agent'}'s Dashboard
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
              {loadingDetails ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-24 bg-gray-100 rounded-lg"></div>
                  <div className="h-48 bg-gray-100 rounded-lg"></div>
                </div>
              ) : (
                <>
                  <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Import BamLead Leads</h3>
                        <p className="mt-1 text-sm text-gray-600">
                          Drop BamLead lead text, Excel, or PDF here to import and assign the leads directly to {selectedAgentMeta?.full_name || 'this agent'}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => agentLeadImportInputRef.current?.click()}
                        disabled={uploadingLeadImport || !selectedAgentMeta?.userId}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Upload className="h-4 w-4" />
                        {uploadingLeadImport ? 'Importing...' : 'Browse BamLead File'}
                      </button>
                    </div>

                    <input
                      ref={agentLeadImportInputRef}
                      type="file"
                      accept=".xlsx,.xls,.pdf"
                      onChange={(event) => {
                        void handleAgentLeadImportInputChange(event);
                      }}
                      className="hidden"
                    />

                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!uploadingLeadImport && selectedAgentMeta?.userId) {
                          setAgentLeadImportDragActive(true);
                        }
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        if (!uploadingLeadImport && selectedAgentMeta?.userId) {
                          setAgentLeadImportDragActive(true);
                        }
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        if (event.currentTarget === event.target) {
                          setAgentLeadImportDragActive(false);
                        }
                      }}
                      onDrop={(event) => {
                        void handleAgentLeadImportDrop(event);
                      }}
                      className={`mt-4 rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
                        agentLeadImportDragActive
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-300 bg-white'
                      } ${!selectedAgentMeta?.userId ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                        <Upload className={`h-5 w-5 ${agentLeadImportDragActive ? 'text-blue-600' : 'text-slate-500'}`} />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">
                        Drop BamLead leads, Excel, or PDF here
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Supports direct drag text payloads plus `.xlsx`, `.xls`, and `.pdf` exports.
                      </p>
                      {!selectedAgentMeta?.userId && (
                        <p className="mt-2 text-xs text-red-600">
                          This employee is not linked to a login user, so imported leads cannot be assigned here yet.
                        </p>
                      )}
                    </div>

                    {leadImportMessage && (
                      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {leadImportMessage}
                      </div>
                    )}

                    {leadImportError && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {leadImportError}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs uppercase text-blue-700 font-semibold mb-1">Assigned Leads</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {agentStats[selectedAgent]?.totalLeads || 0}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs uppercase text-green-700 font-semibold mb-1">Completed Calls</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {agentStats[selectedAgent]?.completedCalls || 0}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-xs uppercase text-purple-700 font-semibold mb-1">Scheduled Meetings</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {agentStats[selectedAgent]?.scheduledMeetings || 0}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-slate-900 mb-3">Recent Leads</h3>
                      <div className="space-y-2">
                        {(agentDetails[selectedAgent]?.leads || []).slice(0, 6).map((lead) => (
                          <div key={lead.id} className="bg-white rounded border border-gray-200 p-2">
                            <p className="text-sm font-medium text-slate-900">{lead.name || 'Unnamed lead'}</p>
                            <p className="text-xs text-gray-500">{lead.email || lead.source || 'No details'}</p>
                          </div>
                        ))}
                        {(agentDetails[selectedAgent]?.leads || []).length === 0 && (
                          <p className="text-sm text-gray-500">No leads assigned.</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-slate-900 mb-3">Recent Calls</h3>
                      <div className="space-y-2">
                        {(agentDetails[selectedAgent]?.calls || []).slice(0, 6).map((call) => (
                          <div key={call.id} className="bg-white rounded border border-gray-200 p-2">
                            <p className="text-sm font-medium text-slate-900">{call.contact_name || 'Unknown contact'}</p>
                            <p className="text-xs text-gray-500">
                              {call.contact_phone || 'No phone'} • {call.outcome || 'completed'}
                            </p>
                          </div>
                        ))}
                        {(agentDetails[selectedAgent]?.calls || []).length === 0 && (
                          <p className="text-sm text-gray-500">No calls logged.</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-slate-900 mb-3">Upcoming Meetings</h3>
                      <div className="space-y-2">
                        {(agentDetails[selectedAgent]?.meetings || []).slice(0, 6).map((meeting) => (
                          <div key={meeting.id} className="bg-white rounded border border-gray-200 p-2">
                            <p className="text-sm font-medium text-slate-900">{meeting.title || 'Untitled meeting'}</p>
                            <p className="text-xs text-gray-500">
                              {meeting.scheduled_date || 'No date'} {meeting.scheduled_time || ''} • {meeting.status || 'scheduled'}
                            </p>
                          </div>
                        ))}
                        {(agentDetails[selectedAgent]?.meetings || []).length === 0 && (
                          <p className="text-sm text-gray-500">No meetings assigned.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {assigningAgent && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-4 sm:items-center">
          <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="shrink-0 border-b border-gray-200 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Assign Leads to {assigningAgent.full_name}</h2>
                <p className="text-sm text-gray-600">
                  Select leads to drop into this agent&apos;s queue.
                </p>
              </div>
              <button
                onClick={() => {
                  setAssigningAgentId(null);
                  setSelectedLeadIds([]);
                  setLeadSearch('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-gray-200 p-6 flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  type="text"
                  value={leadSearch}
                  onChange={(event) => setLeadSearch(event.target.value)}
                  placeholder="Search leads by name, email, or source"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  onClick={toggleSelectAllFilteredLeads}
                  disabled={selectableFilteredLeadIds.length === 0}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {allFilteredLeadsSelected ? 'Unselect Filtered' : 'Select Filtered'}
                </button>
                <div className="text-sm text-gray-600">
                  {selectedLeadIds.length} selected
                </div>
              </div>

              <div className="border-b border-gray-200 bg-slate-50 p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Import BamLead Leads</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Drop BamLead lead text, Excel, or PDF here to assign the imported leads directly to {assigningAgent.full_name}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => agentLeadImportInputRef.current?.click()}
                    disabled={uploadingLeadImport || !assigningAgent.userId}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingLeadImport ? 'Importing...' : 'Browse BamLead File'}
                  </button>
                </div>

                <input
                  ref={agentLeadImportInputRef}
                  type="file"
                  accept=".xlsx,.xls,.pdf"
                  onChange={(event) => {
                    void handleAssigningAgentLeadImportInputChange(event);
                  }}
                  className="hidden"
                />

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!uploadingLeadImport && assigningAgent.userId) {
                      setAgentLeadImportDragActive(true);
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!uploadingLeadImport && assigningAgent.userId) {
                      setAgentLeadImportDragActive(true);
                    }
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.currentTarget === event.target) {
                      setAgentLeadImportDragActive(false);
                    }
                  }}
                  onDrop={(event) => {
                    void handleAssigningAgentLeadImportDrop(event);
                  }}
                  className={`mt-4 rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
                    agentLeadImportDragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-300 bg-white'
                  } ${!assigningAgent.userId ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <Upload className={`h-5 w-5 ${agentLeadImportDragActive ? 'text-blue-600' : 'text-slate-500'}`} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Drop BamLead leads, Excel, or PDF here
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Supports direct drag text payloads plus `.xlsx`, `.xls`, and `.pdf` exports.
                  </p>
                  {!assigningAgent.userId && (
                    <p className="mt-2 text-xs text-red-600">
                      This employee is not linked to a login user, so imported leads cannot be assigned here yet.
                    </p>
                  )}
                </div>

                {leadImportMessage && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {leadImportMessage}
                  </div>
                )}

                {leadImportError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {leadImportError}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 p-6 space-y-3">
                {loadingAssignableLeads && (
                  <div className="text-sm text-gray-500">Loading leads...</div>
                )}

                {!loadingAssignableLeads && filteredAssignableLeads.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                    No leads match your search.
                  </div>
                )}

                {!loadingAssignableLeads && filteredAssignableLeads.map((lead) => {
                  const alreadyAssignedHere = lead.assignedTo === assigningAgent.userId;
                  return (
                    <label
                      key={lead.id}
                      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                        alreadyAssignedHere ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={() => toggleSelectedLead(lead.id)}
                        disabled={alreadyAssignedHere}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{lead.name}</p>
                            <p className="text-sm text-gray-500">{lead.email || 'No email provided'}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 uppercase">
                              {lead.source || 'manual'}
                            </span>
                            <span className={`rounded-full px-2 py-1 ${
                              alreadyAssignedHere ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {alreadyAssignedHere ? 'Already assigned here' : lead.assignedTo ? 'Assigned elsewhere' : 'Unassigned'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white p-6 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setAssigningAgentId(null);
                  setSelectedLeadIds([]);
                  setLeadSearch('');
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => void handleAssignSelectedLeads()}
                disabled={savingAssignments || selectedLeadIds.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {savingAssignments ? 'Assigning...' : `Assign ${selectedLeadIds.length} Lead${selectedLeadIds.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
