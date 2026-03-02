import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Plus, Search, Mail, Phone, Briefcase, Edit2, Trash2, X, Building2, ChevronDown, ChevronRight, StickyNote } from 'lucide-react';

interface CalendarNote {
  id: string;
  note_text: string;
  note_date: string;
  follow_up_type: string;
  priority: string;
  completed: boolean;
  created_at: string;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  company_id: string | null;
  notes: string | null;
  company?: { name: string };
  calendarNotes?: CalendarNote[];
}

interface Company {
  id: string;
  name: string;
}

export function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    position: '',
    company_id: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      const [contactsRes, companiesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('*, company:companies(name)')
          .order('created_at', { ascending: false }),
        supabase.from('companies').select('id, name').order('name'),
      ]);

      if (contactsRes.data) setContacts(contactsRes.data);
      if (companiesRes.data) setCompanies(companiesRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContactNotes = async (contactId: string) => {
    try {
      const { data, error } = await supabase
        .from('calendar_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('note_date', { ascending: false });

      if (error) throw error;

      setContacts(prev => prev.map(contact =>
        contact.id === contactId
          ? { ...contact, calendarNotes: data || [] }
          : contact
      ));
    } catch (error) {
      console.error('Error loading contact notes:', error);
    }
  };

  const toggleExpand = async (contactId: string) => {
    if (expandedContactId === contactId) {
      setExpandedContactId(null);
    } else {
      setExpandedContactId(contactId);
      const contact = contacts.find(c => c.id === contactId);
      if (!contact?.calendarNotes) {
        await loadContactNotes(contactId);
      }
    }
  };

  const openModal = (contact?: Contact) => {
    if (contact) {
      setEditingContact(contact);
      setFormData({
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email || '',
        phone: contact.phone || '',
        position: contact.position || '',
        company_id: contact.company_id || '',
        notes: contact.notes || '',
      });
    } else {
      setEditingContact(null);
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        position: '',
        company_id: '',
        notes: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingContact(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const data = {
        ...formData,
        user_id: user.id,
        company_id: formData.company_id || null,
        email: formData.email || null,
        phone: formData.phone || null,
        position: formData.position || null,
        notes: formData.notes || null,
      };

      if (editingContact) {
        await supabase.from('contacts').update(data).eq('id', editingContact.id);
      } else {
        await supabase.from('contacts').insert(data);
      }

      await loadData();
      closeModal();
    } catch (error) {
      console.error('Error saving contact:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    try {
      await supabase.from('contacts').delete().eq('id', id);
      await loadData();
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    const query = searchQuery.toLowerCase();
    return (
      contact.first_name.toLowerCase().includes(query) ||
      contact.last_name.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.position?.toLowerCase().includes(query) ||
      contact.company?.name.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48"></div>
          <div className="h-12 bg-slate-200 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option>All Contacts</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Plus className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8 px-4 py-3">
                  <input type="checkbox" className="rounded border-gray-300" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500 text-sm">
                    {searchQuery ? 'No contacts found matching your search.' : 'No contacts yet. Add your first contact to get started.'}
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
                  <>
                    <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleExpand(contact.id)}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          {expandedContactId === contact.id ? (
                            <ChevronDown className="w-4 h-4 text-gray-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {contact.first_name} {contact.last_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {contact.company?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {contact.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {contact.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        —
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          ACTIVE
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1 text-gray-400 hover:text-gray-600">
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openModal(contact)}
                            className="p-1 text-gray-400 hover:text-blue-600"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(contact.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedContactId === contact.id && (
                      <tr key={`${contact.id}-notes`}>
                        <td colSpan={8} className="px-8 py-4 bg-gray-50">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                              <StickyNote className="w-4 h-4" />
                              Call Notes ({contact.calendarNotes?.length || 0})
                            </div>
                            {!contact.calendarNotes ? (
                              <div className="text-sm text-gray-500">Loading notes...</div>
                            ) : contact.calendarNotes.length === 0 ? (
                              <div className="text-sm text-gray-500">No call notes for this contact yet.</div>
                            ) : (
                              <div className="space-y-2">
                                {contact.calendarNotes.map((note) => (
                                  <div
                                    key={note.id}
                                    className="bg-white border border-gray-200 rounded-lg p-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-medium text-gray-500">
                                            {new Date(note.note_date).toLocaleDateString()}
                                          </span>
                                          <span className={`text-xs px-2 py-0.5 rounded ${
                                            note.priority === 'high' ? 'bg-red-100 text-red-700' :
                                            note.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-green-100 text-green-700'
                                          }`}>
                                            {note.priority}
                                          </span>
                                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                            {note.follow_up_type.replace('_', ' ')}
                                          </span>
                                          {note.completed && (
                                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                              Completed
                                            </span>
                                          )}
                                        </div>
                                        <p className={`text-sm ${note.completed ? 'line-through text-gray-500' : 'text-gray-700'}`}>
                                          {note.note_text}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-600 hover:text-slate-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Company
                </label>
                <select
                  value={formData.company_id}
                  onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Position
                </label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors"
                >
                  {editingContact ? 'Update Contact' : 'Create Contact'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
