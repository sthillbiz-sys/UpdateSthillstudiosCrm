import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { LayoutDashboard, Users, FolderKanban, Sparkles, Calendar as CalendarIcon, Clock, MessageSquare, Video, BarChart3, CircleUser as UserCircle, LogOut, Menu, X, HelpCircle, Monitor } from 'lucide-react';
import { Dashboard } from './Dashboard';
import { CRMTabs } from './CRMTabs';
import { Projects } from './Projects';
import { Leads } from './Leads';
import { Calendar } from './Calendar';
import { Messages } from './Messages';
import { Meetings } from './Meetings';
import { TimeTracking } from './TimeTracking';
import { CallReports } from './CallReports';
import { Employees } from './Employees';
import { AgentDashboards } from './AgentDashboards';
import { HelpNotification } from './HelpNotification';
import { FloatingActions } from './FloatingActions';
import { QuickCall } from './QuickCall';
import { PhoneDialer } from './PhoneDialer';
import { LOGO_SRC } from '../lib/assets';
import { createWsUrl } from '../lib/api';

type View = 'dashboard' | 'crm' | 'projects' | 'leads' | 'calendar' | 'timeTracking' | 'messages' | 'meetings' | 'callReports' | 'employees' | 'agentDashboards';

export function CRM() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showQuickCall, setShowQuickCall] = useState(false);
  const [showPhoneDialer, setShowPhoneDialer] = useState(false);
  const { signOut, user } = useAuth();
  const helpSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const isOwner = user?.email === 'thesthillstudios@gmail.com';
  const isAdmin = String(user?.role || '').toLowerCase().includes('admin');
  const accountName = user?.name?.trim() || user?.email?.split('@')[0] || 'User';
  const accountInitials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';
  const accountRole = (user?.role || 'employee')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-cyan-400' },
    { id: 'agentDashboards', label: 'Agent Dashboards', icon: Monitor, color: 'text-blue-400' },
    { id: 'crm', label: 'CRM', icon: Users, color: 'text-pink-400' },
    { id: 'projects', label: 'Projects', icon: FolderKanban, color: 'text-amber-400' },
    { id: 'leads', label: 'Leads', icon: Sparkles, color: 'text-purple-400' },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon, color: 'text-blue-400' },
    { id: 'timeTracking', label: 'Time Tracking', icon: Clock, color: 'text-orange-400' },
    { id: 'messages', label: 'Messages', icon: MessageSquare, color: 'text-emerald-400' },
    { id: 'meetings', label: 'Meetings', icon: Video, color: 'text-fuchsia-400' },
    { id: 'callReports', label: 'Call Reports', icon: BarChart3, color: 'text-teal-400' },
    { id: 'employees', label: 'Employees', icon: UserCircle, color: 'text-indigo-400' },
  ];

  useEffect(() => {
    if (!user) {
      if (helpSocketRef.current) {
        helpSocketRef.current.close();
        helpSocketRef.current = null;
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current !== null) {
        return;
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, 3000);
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      const wsUrl = createWsUrl();
      if (!wsUrl) {
        return;
      }

      const socket = new WebSocket(wsUrl);
      helpSocketRef.current = socket;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          type: 'join',
          roomId: 'help-notifications',
          name: user.name || user.email || 'User',
        }));
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type?: string;
            agentName?: string;
            agentEmail?: string;
            page?: string;
            timestamp?: string;
          };

          if (payload.type !== 'help-alert' || !isAdmin) {
            return;
          }

          window.dispatchEvent(new CustomEvent('helpRequest', {
            detail: {
              id: `${payload.agentEmail || payload.agentName || 'help'}-${payload.timestamp || Date.now()}`,
              userName: payload.agentName || 'User',
              userEmail: payload.agentEmail || '',
              page: payload.page || 'dashboard',
              timestamp: payload.timestamp || new Date().toISOString(),
            },
          }));
        } catch {
          // Ignore malformed websocket payloads.
        }
      });

      socket.addEventListener('close', () => {
        if (helpSocketRef.current === socket) {
          helpSocketRef.current = null;
        }
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        socket.close();
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (helpSocketRef.current) {
        helpSocketRef.current.close();
        helpSocketRef.current = null;
      }
    };
  }, [isAdmin, user]);

  const handleRequestHelp = () => {
    if (!user || isAdmin) {
      return;
    }

    const socket = helpSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      window.alert('Help request is temporarily unavailable. Please try again in a moment.');
      return;
    }

    socket.send(JSON.stringify({
      type: 'help-request',
      page: currentView,
    }));
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'agentDashboards':
        return <AgentDashboards />;
      case 'crm':
        return <CRMTabs />;
      case 'projects':
        return <Projects />;
      case 'leads':
        return <Leads />;
      case 'calendar':
        return <Calendar />;
      case 'messages':
        return <Messages />;
      case 'meetings':
        return <Meetings />;
      case 'callReports':
        return <CallReports />;
      case 'employees':
        return <Employees />;
      case 'timeTracking':
        return <TimeTracking />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="h-screen flex bg-gray-100">
      <aside className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-52 bg-slate-900 transition-transform duration-300 ease-in-out`}>
        <div className="h-full flex flex-col">
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={LOGO_SRC}
                  alt="SthillStudios Logo"
                  className="w-40 h-auto"
                />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as View);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm ${
                    isActive
                      ? `bg-slate-800 ${item.color}`
                      : `${item.color} hover:bg-slate-800`
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-slate-800">
            <button
              onClick={handleRequestHelp}
              disabled={isAdmin}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm text-gray-400 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 mb-3"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Request Help</span>
            </button>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-3">Account</div>
            <div className="flex items-center gap-2 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                {accountInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-semibold truncate">{accountName}</p>
                <p className="text-[10px] text-gray-400 uppercase">{accountRole}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="text-gray-400 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 overflow-auto relative">
        <div className="lg:hidden bg-white border-b border-gray-200 p-4 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-700 hover:text-gray-900"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        {renderView()}
        <HelpNotification />
        <FloatingActions
          onPhoneClick={() => setShowPhoneDialer(true)}
          onMessageClick={() => setCurrentView('messages')}
        />
      </main>

      {showQuickCall && (
        <QuickCall onClose={() => setShowQuickCall(false)} />
      )}

      {showPhoneDialer && (
        <PhoneDialer onClose={() => setShowPhoneDialer(false)} />
      )}
    </div>
  );
}
