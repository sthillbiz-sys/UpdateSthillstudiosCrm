import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Plus, Upload, X, FileText, Trash2, Edit } from 'lucide-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  source: string;
  timestamp: string;
}

export function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'manual'
  });

  useEffect(() => {
    loadLeads();
  }, [user]);

  const normalizeLead = (row: Partial<Lead> & Record<string, unknown>): Lead => ({
    id: Number(row.id || 0),
    name: String(row.name || 'Unknown'),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    source: String(row.source || 'manual'),
    timestamp: String(row.timestamp || row.date || row.created_at || new Date().toISOString()),
  });

  const loadLeads = async () => {
    if (!user) {
      setLeads([]);
      setSelectedLeadIds([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await apiGet<Record<string, unknown>[]>('/leads');
      if (Array.isArray(rows)) {
        const mapped = rows.map(normalizeLead);
        setLeads(mapped);
        setSelectedLeadIds((current) =>
          current.filter((leadId) => mapped.some((lead) => lead.id === leadId)),
        );
      }
    } catch (error) {
      console.error('Error loading leads:', error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = selectedLeadIds.length;
  const allSelected = leads.length > 0 && selectedCount === leads.length;
  const someSelected = selectedCount > 0 && selectedCount < leads.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const formatDate = (dateString: string) => {
    const normalized = dateString.includes('T') ? dateString : dateString.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const handleAddLead = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await apiPost('/leads', {
        name: newLead.name,
        email: newLead.email,
        phone: newLead.phone,
        source: newLead.source,
      });

      setNewLead({ name: '', email: '', phone: '', source: 'manual' });
      setShowAddModal(false);
      await loadLeads();
    } catch (error) {
      console.error('Error adding lead:', error);
      alert(error instanceof Error ? error.message : 'Failed to add lead. Please try again.');
    }
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setShowEditModal(true);
  };

  const handleUpdateLead = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !editingLead) return;

    try {
      await apiPut(`/leads/${editingLead.id}`, {
        name: editingLead.name,
        email: editingLead.email,
        phone: editingLead.phone,
        source: editingLead.source,
      });

      setShowEditModal(false);
      setEditingLead(null);
      await loadLeads();
    } catch (error) {
      console.error('Error updating lead:', error);
      alert(error instanceof Error ? error.message : 'Failed to update lead. Please try again.');
    }
  };

  const handleDeleteLead = async (leadId: number, leadName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${leadName}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await apiDelete(`/leads/${leadId}`);

      setSelectedLeadIds((current) => current.filter((id) => id !== leadId));
      await loadLeads();
    } catch (error) {
      console.error('Error deleting lead:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete lead. Please try again.');
    }
  };

  const toggleLeadSelection = (leadId: number) => {
    setSelectedLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedLeadIds((current) => (current.length === leads.length ? [] : leads.map((lead) => lead.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedLeadIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedLeadIds.length} selected lead${selectedLeadIds.length === 1 ? '' : 's'}? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedLeadIds.map((leadId) => apiDelete(`/leads/${leadId}`)),
      );
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length > 0) {
        const firstFailure = failures[0]?.reason;
        throw (firstFailure instanceof Error
          ? firstFailure
          : new Error('Failed to delete one or more selected leads.'));
      }

      setSelectedLeadIds([]);
      await loadLeads();
    } catch (error) {
      console.error('Error deleting selected leads:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete selected leads. Please try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleConvertToCRM = async (lead: Lead) => {
    if (!user) return;

    const confirmed = window.confirm(
      `Convert "${lead.name}" to a CRM contact? This will add them as a customer.`
    );

    if (!confirmed) return;

    try {
      const nameParts = lead.name.split(' ');
      const firstName = nameParts[0] || lead.name;
      const lastName = nameParts.slice(1).join(' ') || '';

      await apiPost('/contacts', {
        name: lead.name,
        first_name: firstName,
        last_name: lastName,
        email: lead.email,
        phone: lead.phone,
        notes: `Converted from lead. Original source: ${lead.source}`,
      });

      await apiDelete(`/leads/${lead.id}`);

      alert(`${lead.name} has been added to CRM as a contact!`);
      await loadLeads();
    } catch (error) {
      console.error('Error converting lead to CRM:', error);
      alert(error instanceof Error ? error.message : 'Failed to convert lead. Please try again.');
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiPost<{ count?: number; success?: boolean }>('/leads/upload', formData);

      alert(`Successfully uploaded ${response?.count || 0} leads!`);
      setShowUploadModal(false);
      await loadLeads();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload CSV. Please check the format and try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#FDF8F3] min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Leads</h1>
          <p className="text-sm text-gray-600">Upload and manage potential clients</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <button
              onClick={() => void handleDeleteSelected()}
              disabled={bulkDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedCount})`}
            </button>
          )}
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add New Lead</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddLead} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source
                </label>
                <select
                  value={newLead.source}
                  onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="manual">Manual Entry</option>
                  <option value="website">Website</option>
                  <option value="referral">Referral</option>
                  <option value="social_media">Social Media</option>
                  <option value="cold_call">Cold Call</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  Add Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Edit Lead</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingLead(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateLead} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={editingLead.name}
                  onChange={(e) => setEditingLead({ ...editingLead, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={editingLead.email}
                  onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={editingLead.phone}
                  onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source
                </label>
                <select
                  value={editingLead.source}
                  onChange={(e) => setEditingLead({ ...editingLead, source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="manual">Manual Entry</option>
                  <option value="website">Website</option>
                  <option value="referral">Referral</option>
                  <option value="social_media">Social Media</option>
                  <option value="cold_call">Cold Call</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingLead(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  Update Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Upload CSV File</h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Your CSV file should include columns for:
                </p>
                <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>Name (required)</li>
                  <li>Email (required)</li>
                  <li>Phone (optional)</li>
                </ul>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <FileText className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    Click to upload CSV
                  </p>
                  <p className="text-xs text-gray-500">or drag and drop</p>
                </label>
              </div>
              {uploading && (
                <div className="mt-4 text-center">
                  <div className="inline-block w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-600 mt-2">Uploading leads...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-6 py-3">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              {selectedCount > 0
                ? `${selectedCount} selected`
                : `Select all ${leads.length} lead${leads.length === 1 ? '' : 's'}`}
            </span>
          </label>
          {selectedCount > 0 && (
            <button
              onClick={() => setSelectedLeadIds([])}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 text-sm">
                    No leads yet. Upload a CSV or add leads manually to get started.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => handleEditLead(lead)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={() => toggleLeadSelection(lead.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Select ${lead.name}`}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {lead.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-blue-600 whitespace-nowrap">
                      {lead.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {lead.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                          {lead.source?.split('_')[0] || 'UNKNOWN'}
                        </span>
                        <span className="text-xs text-purple-600 uppercase">
                          {lead.source?.split('_').slice(1).join('_') || ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(lead.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConvertToCRM(lead);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Add to CRM
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditLead(lead);
                          }}
                          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                          title="Edit lead"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLead(lead.id, lead.name);
                          }}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                          title="Delete lead"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
