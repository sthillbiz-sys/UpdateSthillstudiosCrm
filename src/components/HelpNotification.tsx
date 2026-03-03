import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface HelpRequest {
  id: string;
  userName: string;
  userEmail: string;
  page: string;
  timestamp: string;
}

export function HelpNotification() {
  const [requests, setRequests] = useState<HelpRequest[]>([]);

  useEffect(() => {
    const handleHelpRequest = (event: CustomEvent<HelpRequest>) => {
      setRequests(prev => [event.detail, ...prev]);

      setTimeout(() => {
        setRequests(prev => prev.filter(r => r.id !== event.detail.id));
      }, 10000);
    };

    window.addEventListener('helpRequest' as any, handleHelpRequest);
    return () => window.removeEventListener('helpRequest' as any, handleHelpRequest);
  }, []);

  const dismissRequest = (id: string) => {
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  if (requests.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-3">
      {requests.map((request) => (
        <div
          key={request.id}
          className="bg-white rounded-xl shadow-2xl border-2 border-red-500 min-w-[360px] overflow-hidden animate-pulse"
        >
          <div className="bg-gradient-to-r from-red-500 to-red-600 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-bold text-white text-base">Help Request</h3>
            </div>
            <button
              onClick={() => dismissRequest(request.id)}
              className="text-white hover:bg-red-700 rounded-full p-1 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 bg-white">
            <p className="text-gray-900 font-semibold mb-2">
              {request.userName} needs assistance
            </p>
            <div className="space-y-1 text-sm text-gray-600">
              <p className="flex items-center gap-2">
                <span className="font-medium">Email:</span> {request.userEmail}
              </p>
              <p className="flex items-center gap-2">
                <span className="font-medium">Page:</span> {request.page}
              </p>
              <p className="flex items-center gap-2">
                <span className="font-medium">Time:</span> {new Date(request.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
