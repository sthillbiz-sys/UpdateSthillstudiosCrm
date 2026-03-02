import { useState } from 'react';
import { Contacts } from './Contacts';
import { CallHistory } from './CallHistory';
import { Deals } from './Deals';

type Tab = 'contacts' | 'callHistory' | 'deals';

export function CRMTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('contacts');

  const tabs = [
    { id: 'contacts', label: 'Contacts' },
    { id: 'callHistory', label: 'Call History' },
    { id: 'deals', label: 'Deals' },
  ];

  return (
    <div className="bg-white min-h-screen">
      <div className="border-b border-gray-200">
        <div className="p-8 pb-0">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">CRM</h1>
          <p className="text-sm text-gray-600 mb-6">Contacts, calls, and deals in one place</p>

          <div className="flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`pb-4 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        {activeTab === 'contacts' && <Contacts />}
        {activeTab === 'callHistory' && <CallHistory />}
        {activeTab === 'deals' && <Deals />}
      </div>
    </div>
  );
}
