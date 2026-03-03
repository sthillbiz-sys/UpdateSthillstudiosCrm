import { useState, useRef, useEffect } from 'react';
import { Phone, Settings, Trash2, HelpCircle, X, Video, Mic, Users, History, User, Delete, GripVertical } from 'lucide-react';
import { usePresence } from '../lib/presence';
import { useAuth } from '../lib/auth';
import { LOGO_SRC } from '../lib/assets';

interface PhoneDialerProps {
  onClose?: () => void;
}

export function PhoneDialer({ onClose }: PhoneDialerProps = {}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [activeTab, setActiveTab] = useState<'dialer' | 'team'>('dialer');
  const { teamPresence, myPresence, updatePresence } = usePresence();
  const { user } = useAuth();
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dialerRef = useRef<HTMLDivElement>(null);

  const userName = user?.email?.split('@')[0] || 'Agent';
  const formattedName = userName.split('.').map((n: string) => n.charAt(0).toUpperCase() + n.slice(1)).join(' ');

  const handleNumberClick = (num: string) => {
    if (phoneNumber.length < 12) {
      setPhoneNumber(prev => prev + num);
    }
  };

  const handleClear = () => {
    setPhoneNumber('');
  };

  const formatPhoneNumber = (num: string) => {
    if (num.length === 0) return '000-000-0000';
    if (num.length <= 3) return num.padEnd(3, '0') + '-000-0000';
    if (num.length <= 6) return num.slice(0, 3) + '-' + num.slice(3).padEnd(3, '0') + '-0000';
    return num.slice(0, 3) + '-' + num.slice(3, 6) + '-' + num.slice(6).padEnd(4, '0');
  };

  const buttons = [
    { num: '1', letters: '' },
    { num: '2', letters: 'ABC' },
    { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' },
    { num: '5', letters: 'JKL' },
    { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' },
    { num: '8', letters: 'TUV' },
    { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' },
    { num: '0', letters: '+' },
    { num: '#', letters: '' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'busy':
      case 'in_meeting':
        return 'bg-red-500';
      case 'on_break':
      case 'lunch':
        return 'bg-yellow-500';
      case 'away':
        return 'bg-orange-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'busy':
        return 'Busy';
      case 'in_meeting':
        return 'In a Meeting';
      case 'on_break':
        return 'On Break';
      case 'lunch':
        return 'At Lunch';
      case 'away':
        return 'Away';
      case 'offline':
        return 'Offline';
      default:
        return status;
    }
  };

  if (onClose) {
    return (
      <div
        ref={dialerRef}
        className="fixed z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl w-80 border border-slate-700"
        style={{ right: '20px', bottom: '20px' }}
      >
        <div
          className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white px-4 py-3 overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400/20 via-transparent to-transparent"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <img
                  src={LOGO_SRC}
                  alt="SthillStudios"
                  className="h-6 w-auto drop-shadow-lg"
                />
                <div>
                  <h2 className="text-base font-bold">Phone</h2>
                  <p className="text-xs text-blue-100">{formattedName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('dialer')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'dialer'
                    ? 'bg-white text-blue-700 shadow-lg'
                    : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                }`}
              >
                Dialer
              </button>
              <button
                onClick={() => setActiveTab('team')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'team'
                    ? 'bg-white text-blue-700 shadow-lg'
                    : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                }`}
              >
                Team
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'dialer' && (
          <div className="p-4 bg-gradient-to-b from-slate-800 to-slate-900">
            <div className="mb-3 relative">
              <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-3 shadow-inner border border-slate-600">
                <div className="flex items-center justify-center mb-1">
                  <img
                    src={LOGO_SRC}
                    alt="SthillStudios"
                    className="h-4 w-auto opacity-40"
                  />
                </div>
                <input
                  type="text"
                  value={phoneNumber || '000-000-0000'}
                  readOnly
                  placeholder="Enter phone number"
                  className="w-full text-center text-xl font-mono font-bold py-2 bg-transparent text-cyan-300 outline-none tracking-wider"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {buttons.map((btn) => (
                <button
                  key={btn.num}
                  onClick={() => handleNumberClick(btn.num)}
                  className="relative bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 rounded-lg p-2 transition-all active:scale-95 shadow-lg border border-slate-600 hover:border-cyan-500/50 group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/0 to-blue-400/0 group-hover:from-cyan-400/10 group-hover:to-blue-400/10 rounded-lg transition-all"></div>
                  <div className="relative">
                    <div className="text-2xl font-bold text-white drop-shadow-lg">{btn.num}</div>
                    <div className="text-[10px] text-cyan-300/60 tracking-wider leading-none">{btn.letters}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3 mb-3">
              <button
                onClick={handleClear}
                disabled={!phoneNumber}
                className="p-3 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-red-600 hover:to-red-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-all shadow-lg border border-slate-600 hover:border-red-500"
              >
                <Delete className="w-4 h-4 text-white" />
              </button>
              <button
                disabled={!phoneNumber}
                className="relative p-4 bg-gradient-to-br from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 disabled:from-slate-700 disabled:to-slate-800 disabled:cursor-not-allowed text-white rounded-full transition-all shadow-2xl active:scale-95 border-2 border-green-400 disabled:border-slate-600 group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-full group-hover:from-white/30"></div>
                <Phone className="w-5 h-5 relative z-10" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600">
                <Video className="w-4 h-4 text-cyan-300" />
                <span className="text-[10px] text-gray-300">Video</span>
              </button>
              <button className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600">
                <Mic className="w-4 h-4 text-cyan-300" />
                <span className="text-[10px] text-gray-300">Voice</span>
              </button>
              <button className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600">
                <History className="w-4 h-4 text-cyan-300" />
                <span className="text-[10px] text-gray-300">History</span>
              </button>
              <button className="flex flex-col items-center gap-0.5 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-all border border-slate-600">
                <Users className="w-4 h-4 text-cyan-300" />
                <span className="text-[10px] text-gray-300">Contacts</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="p-4 bg-gradient-to-b from-slate-800 to-slate-900 max-h-96 overflow-y-auto">
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-cyan-300 mb-2">My Status</h3>
              <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg p-3 mb-3 border border-slate-600">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(myPresence?.status || 'offline')} shadow-lg`} />
                  <span className="text-sm font-medium text-white">
                    {getStatusLabel(myPresence?.status || 'offline')}
                  </span>
                </div>
                <select
                  value={myPresence?.status || 'available'}
                  onChange={(e) => updatePresence(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 text-white rounded-lg text-xs focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="available">Available</option>
                  <option value="busy">Busy</option>
                  <option value="in_meeting">In a Meeting</option>
                  <option value="on_break">On Break</option>
                  <option value="lunch">At Lunch</option>
                  <option value="away">Away</option>
                </select>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-cyan-300 mb-2">
                Team ({teamPresence.length})
              </h3>
              <div className="space-y-2">
                {teamPresence.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between p-2 bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 rounded-lg transition-all border border-slate-600"
                  >
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-lg">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-800 ${getStatusColor(member.status)} shadow-lg`}
                        />
                      </div>
                      <div>
                        <p className="font-medium text-white text-xs">Team Member</p>
                        <p className="text-[10px] text-cyan-300">{getStatusLabel(member.status)}</p>
                      </div>
                    </div>
                    {member.status === 'available' && !member.is_on_call && (
                      <button className="p-1.5 bg-gradient-to-br from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white rounded-full transition-all shadow-lg">
                        <Phone className="w-3 h-3" />
                      </button>
                    )}
                    {member.is_on_call && (
                      <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium border border-red-500/30">
                        On Call
                      </span>
                    )}
                  </div>
                ))}
                {teamPresence.length === 0 && (
                  <p className="text-center text-gray-400 py-3 text-xs">No team members online</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                <img
                  src={LOGO_SRC}
                  alt="SthillStudios Logo"
                  className="w-32 h-auto"
                />
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">
                <HelpCircle className="w-4 h-4" />
                Request Help
              </button>
              <div className="px-3 py-1.5 bg-green-600 rounded-full text-xs font-semibold text-white flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                LINE 1 ACTIVE
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-2xl p-8">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-green-400 tracking-wider">CONNECTED</span>
                <span className="text-xs text-blue-400">VoIP v2.4</span>
              </div>
              <div className="bg-slate-900 rounded-lg p-6 text-center">
                <div className="text-3xl font-mono font-bold text-white tracking-wider mb-2">
                  {formatPhoneNumber(phoneNumber)}
                </div>
                <div className="flex justify-center gap-1">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-2 h-2 bg-gray-600 rounded-full"></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {buttons.map((btn) => (
                <button
                  key={btn.num}
                  onClick={() => handleNumberClick(btn.num)}
                  className="bg-slate-700 hover:bg-slate-600 rounded-xl p-4 transition-colors group"
                >
                  <div className="text-2xl font-bold text-white mb-0.5">{btn.num}</div>
                  <div className="text-[10px] text-gray-400 tracking-wider">{btn.letters}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button className="bg-green-600 hover:bg-green-700 rounded-xl p-4 flex items-center justify-center transition-colors col-span-2">
                <Phone className="w-6 h-6 text-white" />
              </button>
              <button className="bg-blue-600 hover:bg-blue-700 rounded-xl p-4 flex items-center justify-center transition-colors">
                <Settings className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={handleClear}
                className="bg-slate-700 hover:bg-slate-600 rounded-xl p-4 flex items-center justify-center transition-colors col-span-3"
              >
                <Trash2 className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                Call History
              </h2>
              <button className="text-sm text-blue-400 hover:text-blue-300">View All</button>
            </div>
            <div className="text-center py-12">
              <div className="text-gray-500 mb-2">
                <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
              </div>
              <p className="text-gray-400 text-sm">No recent calls</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
