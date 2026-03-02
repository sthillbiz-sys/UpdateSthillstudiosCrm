import { Phone, MessageSquare } from 'lucide-react';

interface FloatingActionsProps {
  onPhoneClick?: () => void;
  onMessageClick?: () => void;
}

export function FloatingActions({ onPhoneClick, onMessageClick }: FloatingActionsProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      <button
        onClick={onMessageClick}
        className="bg-green-500 hover:bg-green-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110"
        title="Messages"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
      <button
        onClick={onPhoneClick}
        className="bg-blue-500 hover:bg-blue-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110"
        title="Quick Call"
      >
        <Phone className="w-6 h-6" />
      </button>
    </div>
  );
}
