import { useAuth } from '../lib/auth';
import { usePresence } from '../lib/presence';
import { Calendar, Users as Users2, MessagesSquare, Download, DollarSign } from 'lucide-react';
import { LOGO_SRC } from '../lib/assets';

export function Dashboard() {
  const { user } = useAuth();
  const { teamPresence } = usePresence();

  const userName = user?.email?.split('@')[0] || 'User';
  const formattedName = userName.split('.').map((n: string) => n.charAt(0).toUpperCase() + n.slice(1)).join(' ');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'busy':
        return 'bg-red-500';
      case 'in_meeting':
        return 'bg-purple-500';
      case 'on_break':
        return 'bg-orange-500';
      case 'lunch':
        return 'bg-yellow-500';
      case 'away':
        return 'bg-gray-400';
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'busy':
        return 'Busy';
      case 'in_meeting':
        return 'In Meeting';
      case 'on_break':
        return 'On Break';
      case 'lunch':
        return 'Lunch';
      case 'away':
        return 'Away';
      default:
        return 'Offline';
    }
  };

  return (
    <div className="bg-[#FDF8F3] min-h-screen">
      <div className="bg-white shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-4">
            <img
              src={LOGO_SRC}
              alt="SthillStudios Logo"
              className="w-32 h-auto"
            />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Welcome back, <span className="text-cyan-400">{formattedName}</span>
              </h1>
              <p className="text-gray-600">
                Admin Dashboard
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Appointments</div>
            <Calendar className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-4xl font-bold text-slate-900">0</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Team Members</div>
            <Users2 className="w-5 h-5 text-pink-500" />
          </div>
          <div className="text-4xl font-bold text-slate-900">{teamPresence.length}</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Pending Time</div>
            <div className="w-5 h-5 rounded-full border-2 border-yellow-500 flex items-center justify-center">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            </div>
          </div>
          <div className="text-4xl font-bold text-slate-900">0</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Unread Messages</div>
            <MessagesSquare className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-4xl font-bold text-slate-900">0</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lead Assignments</div>
            <Download className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-4xl font-bold text-slate-900">0</div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Users2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-900">Active Team Members</h2>
        </div>

        {teamPresence.length === 0 ? (
          <p className="text-gray-500 text-sm">No team members online</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamPresence.map((presence) => {
              const employee = presence.employee;
              const displayName = employee?.full_name || employee?.email?.split('@')[0] || 'Team Member';
              const initials = employee?.full_name
                ? employee.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                : displayName.slice(0, 2).toUpperCase();
              const avatarColor = employee?.assigned_color || '#3B82F6';

              return (
                <div key={presence.user_id} className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {initials}
                      </div>
                      <div>
                        <p className="text-white font-semibold">{displayName}</p>
                        <p className="text-slate-400 text-xs">{employee?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(presence.status)}`}></div>
                      <span className="text-xs font-medium text-slate-300">{getStatusLabel(presence.status)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-bold text-slate-900">Employee Bonuses</h2>
        </div>
        <p className="text-gray-500 text-sm">No bonuses awarded yet.</p>
      </div>
      </div>
    </div>
  );
}
