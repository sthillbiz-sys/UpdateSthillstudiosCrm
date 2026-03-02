import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Plus, DollarSign, Calendar, TrendingUp, X, Users, Building2 } from 'lucide-react';

interface Deal {
  id: string;
  title: string;
  value: number;
  stage: string;
  probability: number;
  expected_close_date: string | null;
  notes: string | null;
  contact_id: string | null;
  company_id: string | null;
  contact?: { first_name: string; last_name: string };
  company?: { name: string };
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
}

interface Company {
  id: string;
  name: string;
}

const STAGES = [
  { id: 'lead', label: 'Lead', color: 'slate' },
  { id: 'qualified', label: 'Qualified', color: 'blue' },
  { id: 'proposal', label: 'Proposal', color: 'yellow' },
  { id: 'negotiation', label: 'Negotiation', color: 'orange' },
  { id: 'won', label: 'Won', color: 'green' },
  { id: 'lost', label: 'Lost', color: 'red' },
];

export function Deals() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    value: '',
    stage: 'lead',
    probability: '0',
    expected_close_date: '',
    contact_id: '',
    company_id: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      const [dealsRes, contactsRes, companiesRes] = await Promise.all([
        supabase
          .from('deals')
          .select('*, contact:contacts(first_name, last_name), company:companies(name)')
          .order('created_at', { ascending: false }),
        supabase.from('contacts').select('id, first_name, last_name').order('first_name'),
        supabase.from('companies').select('id, name').order('name'),
      ]);

      if (dealsRes.data) setDeals(dealsRes.data);
      if (contactsRes.data) setContacts(contactsRes.data);
      if (companiesRes.data) setCompanies(companiesRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (deal?: Deal) => {
    if (deal) {
      setEditingDeal(deal);
      setFormData({
        title: deal.title,
        value: deal.value.toString(),
        stage: deal.stage,
        probability: deal.probability.toString(),
        expected_close_date: deal.expected_close_date || '',
        contact_id: deal.contact_id || '',
        company_id: deal.company_id || '',
        notes: deal.notes || '',
      });
    } else {
      setEditingDeal(null);
      setFormData({
        title: '',
        value: '',
        stage: 'lead',
        probability: '0',
        expected_close_date: '',
        contact_id: '',
        company_id: '',
        notes: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingDeal(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const data = {
        title: formData.title,
        value: parseFloat(formData.value) || 0,
        stage: formData.stage,
        probability: parseInt(formData.probability) || 0,
        expected_close_date: formData.expected_close_date || null,
        contact_id: formData.contact_id || null,
        company_id: formData.company_id || null,
        notes: formData.notes || null,
        user_id: user.id,
      };

      if (editingDeal) {
        await supabase.from('deals').update(data).eq('id', editingDeal.id);
      } else {
        await supabase.from('deals').insert(data);
      }

      await loadData();
      closeModal();
    } catch (error) {
      console.error('Error saving deal:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deal?')) return;

    try {
      await supabase.from('deals').delete().eq('id', id);
      await loadData();
    } catch (error) {
      console.error('Error deleting deal:', error);
    }
  };

  const updateDealStage = async (dealId: string, newStage: string) => {
    try {
      await supabase.from('deals').update({ stage: newStage }).eq('id', dealId);
      await loadData();
    } catch (error) {
      console.error('Error updating deal stage:', error);
    }
  };

  const dealsByStage = (stageId: string) => {
    return deals.filter(deal => deal.stage === stageId);
  };

  const stageValue = (stageId: string) => {
    return dealsByStage(stageId).reduce((sum, deal) => sum + Number(deal.value), 0);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48"></div>
          <div className="h-12 bg-slate-200 rounded"></div>
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex-1 h-96 bg-slate-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Deals Pipeline</h1>
          <p className="text-slate-600">
            {deals.length} deals · ${deals.reduce((sum, d) => sum + Number(d.value), 0).toLocaleString()} total value
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Deal
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageDeals = dealsByStage(stage.id);
          const value = stageValue(stage.id);

          return (
            <div key={stage.id} className="flex-shrink-0 w-80">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className={`bg-${stage.color}-50 border-b border-${stage.color}-100 px-4 py-3`}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`font-semibold text-${stage.color}-900`}>{stage.label}</h3>
                    <span className={`text-xs font-medium text-${stage.color}-700 bg-${stage.color}-100 px-2 py-1 rounded-full`}>
                      {stageDeals.length}
                    </span>
                  </div>
                  <p className={`text-sm text-${stage.color}-700 font-medium`}>
                    ${value.toLocaleString()}
                  </p>
                </div>

                <div className="p-3 space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {stageDeals.length === 0 ? (
                    <p className="text-center text-slate-400 py-8 text-sm">No deals</p>
                  ) : (
                    stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => openModal(deal)}
                      >
                        <h4 className="font-semibold text-slate-900 mb-2">{deal.title}</h4>

                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <DollarSign className="w-4 h-4 text-green-600" />
                            <span className="font-semibold">${Number(deal.value).toLocaleString()}</span>
                          </div>

                          {deal.contact && (
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                              <Users className="w-4 h-4 text-slate-400" />
                              <span>{deal.contact.first_name} {deal.contact.last_name}</span>
                            </div>
                          )}

                          {deal.company && (
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                              <Building2 className="w-4 h-4 text-slate-400" />
                              <span>{deal.company.name}</span>
                            </div>
                          )}

                          {deal.expected_close_date && (
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span>{new Date(deal.expected_close_date).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-slate-700">{deal.probability}%</span>
                          </div>

                          <select
                            value={deal.stage}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateDealStage(deal.id, e.target.value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            {STAGES.map(s => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingDeal ? 'Edit Deal' : 'Add New Deal'}
              </h2>
              <div className="flex items-center gap-2">
                {editingDeal && (
                  <button
                    onClick={() => {
                      handleDelete(editingDeal.id);
                      closeModal();
                    }}
                    className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={closeModal}
                  className="text-slate-600 hover:text-slate-900"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Deal Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Value ($) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Probability (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probability}
                    onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Stage *
                  </label>
                  <select
                    value={formData.stage}
                    onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {STAGES.map(stage => (
                      <option key={stage.id} value={stage.id}>{stage.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Expected Close Date
                  </label>
                  <input
                    type="date"
                    value={formData.expected_close_date}
                    onChange={(e) => setFormData({ ...formData, expected_close_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Contact
                  </label>
                  <select
                    value={formData.contact_id}
                    onChange={(e) => setFormData({ ...formData, contact_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">No contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.first_name} {contact.last_name}
                      </option>
                    ))}
                  </select>
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
                  {editingDeal ? 'Update Deal' : 'Create Deal'}
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
