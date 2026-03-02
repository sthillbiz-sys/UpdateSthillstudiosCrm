import { useState } from 'react';
import { Phone, Calendar, StickyNote } from 'lucide-react';
import { QuickNoteModal } from './QuickNoteModal';

export function CallHistory() {
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState('');

  const handleAddNote = (contactName: string) => {
    setSelectedContact(contactName);
    setShowNoteModal(true);
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Recent Calls</h2>
        <p className="text-sm text-gray-600">Click "Add Note" to create calendar reminders</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-200">
          <div className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">John Smith</h3>
                  <p className="text-sm text-gray-600">+1 (555) 123-4567</p>
                  <p className="text-xs text-gray-500 mt-1">Today at 2:30 PM</p>
                </div>
              </div>
              <button
                onClick={() => handleAddNote('John Smith')}
                className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                <StickyNote className="w-3 h-3" />
                Add Note
              </button>
            </div>
          </div>

          <div className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Sarah Johnson</h3>
                  <p className="text-sm text-gray-600">+1 (555) 987-6543</p>
                  <p className="text-xs text-gray-500 mt-1">Today at 11:15 AM</p>
                </div>
              </div>
              <button
                onClick={() => handleAddNote('Sarah Johnson')}
                className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                <StickyNote className="w-3 h-3" />
                Add Note
              </button>
            </div>
          </div>

          <div className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Mike Davis</h3>
                  <p className="text-sm text-gray-600">+1 (555) 456-7890</p>
                  <p className="text-xs text-gray-500 mt-1">Yesterday at 4:45 PM</p>
                </div>
              </div>
              <button
                onClick={() => handleAddNote('Mike Davis')}
                className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                <StickyNote className="w-3 h-3" />
                Add Note
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNoteModal && (
        <QuickNoteModal
          contactName={selectedContact}
          onClose={() => {
            setShowNoteModal(false);
            setSelectedContact('');
          }}
          onSuccess={() => {
            alert('Note added to calendar successfully!');
          }}
        />
      )}
    </div>
  );
}
