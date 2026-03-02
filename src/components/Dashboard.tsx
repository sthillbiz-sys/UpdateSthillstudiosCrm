import { useAuth } from '../lib/auth';
import { Building2, Calendar, Users2, MessagesSquare, Download, DollarSign } from 'lucide-react';

export function Dashboard() {
  const { user } = useAuth();

  const userName = user?.email?.split('@')[0] || 'User';
  const formattedName = userName.split('.').map((n: string) => n.charAt(0).toUpperCase() + n.slice(1)).join(' ');

  return (
    <div className="bg-[#FDF8F3] min-h-screen">
      <div className="bg-white shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-4">
            <img
              src="/NEW_sthillstudisoslogo.png"
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
          <div className="text-4xl font-bold text-slate-900">1</div>
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

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-bold text-slate-900">Employee Bonuses</h2>
        </div>
        <p className="text-gray-500 text-sm">No bonuses awarded yet.</p>
      </div>

      <div className="mt-6 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-lg">{formattedName.charAt(0)}</span>
            </div>
            <div>
              <p className="text-white font-semibold">{formattedName}</p>
              <p className="text-slate-400 text-xs">{user?.email}</p>
            </div>
          </div>
          <div className="px-3 py-1 bg-green-500/20 rounded-full">
            <span className="text-xs font-medium text-green-400">Active</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
