import { useState } from 'react';
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

type View = 'dashboard' | 'crm' | 'projects' | 'leads' | 'calendar' | 'timeTracking' | 'messages' | 'meetings' | 'callReports' | 'employees' | 'agentDashboards';

export function CRM() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showQuickCall, setShowQuickCall] = useState(false);
  const [showPhoneDialer, setShowPhoneDialer] = useState(false);
  const { signOut, user } = useAuth();

  const isOwner = user?.email === 'thesthillstudios@gmail.com';

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

  const handleRequestHelp = () => {
    const userName = user?.email?.split('@')[0] || 'User';
    const formattedName = userName.split('.').map((n: string) => n.charAt(0).toUpperCase() + n.slice(1)).join(' ');

    const event = new CustomEvent('helpRequest', {
      detail: {
        id: Date.now().toString(),
        userName: formattedName,
        userEmail: user?.email || '',
        page: currentView,
        timestamp: new Date().toISOString(),
      },
    });
    window.dispatchEvent(event);
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
                  src="/NEW_sthillstudisoslogo.png"
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
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm text-gray-400 hover:bg-slate-800 hover:text-white mb-3"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Request Help</span>
            </button>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-3">Account</div>
            <div className="flex items-center gap-2 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                A
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-semibold">Adrian St. Hill</p>
                <p className="text-[10px] text-gray-400 uppercase">Admin</p>
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
