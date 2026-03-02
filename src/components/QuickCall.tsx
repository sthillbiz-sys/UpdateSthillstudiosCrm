import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface QuickCallProps {
  onClose: () => void;
  roomName?: string;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export function QuickCall({ onClose, roomName = 'SthillStudiosMain' }: QuickCallProps) {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiRef = useRef<any>(null);

  useEffect(() => {
    const loadJitsiScript = () => {
      if (window.JitsiMeetExternalAPI) {
        initializeJitsi();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = () => initializeJitsi();
      document.body.appendChild(script);
    };

    const initializeJitsi = () => {
      if (!jitsiContainerRef.current || jitsiRef.current) return;

      const domain = 'meet.jit.si';
      const options = {
        roomName: `SthillStudios-${roomName}`,
        width: 900,
        height: 600,
        parentNode: jitsiContainerRef.current,
        configOverwrite: { startWithAudioMuted: true },
        interfaceConfigOverwrite: { filmStripOnly: false }
      };

      jitsiRef.current = new window.JitsiMeetExternalAPI(domain, options);
    };

    loadJitsiScript();

    return () => {
      if (jitsiRef.current) {
        jitsiRef.current.dispose();
        jitsiRef.current = null;
      }
    };
  }, [onClose, roomName]);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4">
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2 font-medium"
        >
          <X className="w-5 h-5" />
          Leave Meeting
        </button>
        <div ref={jitsiContainerRef} className="rounded-lg overflow-hidden shadow-2xl" />
      </div>
    </div>
  );
}
