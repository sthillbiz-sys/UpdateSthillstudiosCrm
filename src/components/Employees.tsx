import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { UserCircle, Mail, Phone, Calendar, Edit2, Trash2, Plus, DollarSign } from 'lucide-react';

interface Employee {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role?: string;
  hourly_rate?: number;
  hire_date?: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [user]);

  const loadEmployees = async () => {
    if (!user) return;

    try {
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

      if (authError) {
        console.error('Error loading users:', authError);
        setLoading(false);
        return;
      }

      const { data: settings, error: settingsError } = await supabase
        .from('employee_settings')
        .select('*');

      if (settingsError) {
        console.error('Error loading employee settings:', settingsError);
      }

      const employeeList: Employee[] = (authUsers?.users || []).map((authUser) => {
        const employeeSettings = settings?.find((s) => s.user_id === authUser.id);
        return {
          id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name,
          phone: authUser.user_metadata?.phone,
          role: authUser.user_metadata?.role || 'Agent',
          hourly_rate: employeeSettings?.hourly_rate,
          hire_date: authUser.created_at,
          status: 'active' as const,
          created_at: authUser.created_at,
        };
      });

      setEmployees(employeeList);
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (email: string, name?: string) => {
    if (name) {
      return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
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
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Employees</h1>
          <p className="text-sm text-gray-600">Manage team members and settings</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Total Employees</h3>
            <UserCircle className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{employees.length}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Active Today</h3>
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {employees.filter((e) => e.status === 'active').length}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Avg Hourly Rate</h3>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">
            ${employees.filter((e) => e.hourly_rate).length > 0
              ? (
                  employees.reduce((sum, e) => sum + (e.hourly_rate || 0), 0) /
                  employees.filter((e) => e.hourly_rate).length
                ).toFixed(2)
              : '0.00'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employees.map((employee) => (
          <div
            key={employee.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold text-lg">
                  {getInitials(employee.email, employee.full_name)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {employee.full_name || employee.email.split('@')[0]}
                  </h3>
                  <p className="text-xs text-gray-500">{employee.role}</p>
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  employee.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {employee.status}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                <span className="truncate">{employee.email}</span>
              </div>
              {employee.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span>{employee.phone}</span>
                </div>
              )}
              {employee.hire_date && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Joined {new Date(employee.hire_date).toLocaleDateString()}</span>
                </div>
              )}
              {employee.hourly_rate && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <DollarSign className="w-4 h-4" />
                  <span>${employee.hourly_rate.toFixed(2)}/hr</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
              <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              <button className="px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {employees.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <UserCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No employees yet</h3>
          <p className="text-gray-600 mb-4">Add your first team member to get started</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        </div>
      )}
    </div>
  );
}
