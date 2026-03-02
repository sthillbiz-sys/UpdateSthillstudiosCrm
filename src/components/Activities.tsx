import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Plus, CheckCircle2, Circle, Phone, Mail, Calendar, CheckSquare, X, Clock } from 'lucide-react';

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  related_to_type: string;
  related_to_id: string;
  created_at: string;
}

const ACTIVITY_TYPES = [
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'meeting', label: 'Meeting', icon: Calendar },
  { id: 'task', label: 'Task', icon: CheckSquare },
];

export function Activities() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');

  const [formData, setFormData] = useState({
    type: 'task',
    title: '',
    description: '',
    due_date: '',
    related_to_type: 'contact',
    related_to_id: '',
  });

  useEffect(() => {
    loadActivities();
  }, [user]);

  const loadActivities = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('activities')
        .select('*')
        .order('due_date', { ascending: true })
        .order('created_at', { ascending: false });

      if (data) setActivities(data);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (activity?: Activity) => {
    if (activity) {
      setEditingActivity(activity);
      setFormData({
        type: activity.type,
        title: activity.title,
        description: activity.description || '',
        due_date: activity.due_date ? activity.due_date.split('T')[0] : '',
        related_to_type: activity.related_to_type,
        related_to_id: activity.related_to_id,
      });
    } else {
      setEditingActivity(null);
      setFormData({
        type: 'task',
        title: '',
        description: '',
        due_date: '',
        related_to_type: 'contact',
        related_to_id: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingActivity(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const data = {
        ...formData,
        user_id: user.id,
        description: formData.description || null,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      };

      if (editingActivity) {
        await supabase.from('activities').update(data).eq('id', editingActivity.id);
      } else {
        await supabase.from('activities').insert({ ...data, completed: false });
      }

      await loadActivities();
      closeModal();
    } catch (error) {
      console.error('Error saving activity:', error);
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    try {
      await supabase.from('activities').update({ completed: !completed }).eq('id', id);
      await loadActivities();
    } catch (error) {
      console.error('Error updating activity:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    try {
      await supabase.from('activities').delete().eq('id', id);
      await loadActivities();
    } catch (error) {
      console.error('Error deleting activity:', error);
    }
  };

  const filteredActivities = activities.filter((activity) => {
    if (filter === 'active') return !activity.completed;
    if (filter === 'completed') return activity.completed;
    return true;
  });

  const getActivityIcon = (type: string) => {
    const activityType = ACTIVITY_TYPES.find(t => t.id === type);
    return activityType?.icon || CheckSquare;
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && !activities.find(a => a.due_date === dueDate)?.completed;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48"></div>
          <div className="h-12 bg-slate-200 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeCount = activities.filter(a => !a.completed).length;
  const completedCount = activities.filter(a => a.completed).length;
  const overdueCount = activities.filter(a => !a.completed && isOverdue(a.due_date)).length;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Activities & Tasks</h1>
          <p className="text-slate-600">
            {activeCount} active · {completedCount} completed
            {overdueCount > 0 && <span className="text-red-600"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Activity
        </button>
      </div>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'active'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Active ({activeCount})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'completed'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Completed ({completedCount})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All ({activities.length})
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
        {filteredActivities.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            {filter === 'active'
              ? 'No active activities. Add one to get started.'
              : filter === 'completed'
              ? 'No completed activities yet.'
              : 'No activities yet. Add your first activity to get started.'}
          </div>
        ) : (
          filteredActivities.map((activity) => {
            const Icon = getActivityIcon(activity.type);
            const overdue = !activity.completed && isOverdue(activity.due_date);

            return (
              <div
                key={activity.id}
                className={`p-6 hover:bg-slate-50 transition-colors ${
                  activity.completed ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => toggleComplete(activity.id, activity.completed)}
                    className="mt-1 flex-shrink-0"
                  >
                    {activity.completed ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : (
                      <Circle className="w-6 h-6 text-slate-400 hover:text-blue-600" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <h3
                          className={`font-semibold text-slate-900 mb-1 ${
                            activity.completed ? 'line-through' : ''
                          }`}
                        >
                          {activity.title}
                        </h3>
                        {activity.description && (
                          <p className="text-sm text-slate-600">{activity.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openModal(activity)}
                          className="px-3 py-1.5 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(activity.id)}
                          className="px-3 py-1.5 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="inline-flex items-center gap-2 text-sm text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                        <Icon className="w-4 h-4" />
                        {ACTIVITY_TYPES.find(t => t.id === activity.type)?.label || activity.type}
                      </span>

                      {activity.due_date && (
                        <span
                          className={`inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                            overdue
                              ? 'bg-red-100 text-red-700'
                              : activity.completed
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                          {new Date(activity.due_date).toLocaleDateString()}
                          {overdue && ' (Overdue)'}
                        </span>
                      )}

                      <span className="text-xs text-slate-500 capitalize">
                        Related to {activity.related_to_type}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingActivity ? 'Edit Activity' : 'Add New Activity'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-600 hover:text-slate-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Activity Type *
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {ACTIVITY_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: type.id })}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                          formData.type === type.id
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-sm font-medium">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Follow up call with John"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any additional details..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Related To *
                </label>
                <select
                  value={formData.related_to_type}
                  onChange={(e) => setFormData({ ...formData, related_to_type: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="contact">Contact</option>
                  <option value="company">Company</option>
                  <option value="deal">Deal</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors"
                >
                  {editingActivity ? 'Update Activity' : 'Create Activity'}
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
