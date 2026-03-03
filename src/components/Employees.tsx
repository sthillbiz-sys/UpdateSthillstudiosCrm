import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useEmployee } from '../lib/employee';
import { CircleUser as UserCircle, Mail, Phone, Calendar, CreditCard as Edit2, Trash2, Plus, DollarSign, X, Eye, TrendingUp, PhoneCall, Users } from 'lucide-react';

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

interface Lead {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  status: string;
  assigned_to?: string;
}

interface EmployeeStats {
  totalLeads: number;
  activeCalls: number;
  scheduledMeetings: number;
}

export function Employees() {
  const { user } = useAuth();
  const { isAdmin } = useEmployee();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [assignedLeads, setAssignedLeads] = useState<Lead[]>([]);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    role: 'employee',
    hourly_rate: 0,
    status: 'active' as 'active' | 'inactive',
  });
  const [addForm, setAddForm] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'employee',
    hourly_rate: 0,
  });

  useEffect(() => {
    loadEmployees();
  }, [user]);

  const loadEmployees = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading employees:', error);
        setLoading(false);
        return;
      }

      const employeeList: Employee[] = (data || []).map((emp) => ({
        id: emp.id,
        email: emp.email,
        full_name: emp.full_name,
        phone: emp.phone,
        role: emp.role || 'employee',
        hourly_rate: emp.hourly_rate,
        hire_date: emp.hire_date,
        status: emp.status as 'active' | 'inactive',
        created_at: emp.created_at,
      }));

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

  const handleEditClick = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditForm({
      full_name: employee.full_name || '',
      phone: employee.phone || '',
      role: employee.role || 'employee',
      hourly_rate: employee.hourly_rate || 0,
      status: employee.status,
    });
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee || !isAdmin) return;

    try {
      const { error } = await supabase
        .from('employees')
        .update({
          full_name: editForm.full_name,
          phone: editForm.phone,
          role: editForm.role,
          hourly_rate: editForm.hourly_rate,
          status: editForm.status,
        })
        .eq('id', editingEmployee.id);

      if (error) throw error;

      setEditingEmployee(null);
      loadEmployees();
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Failed to update employee. Make sure you have admin permissions.');
    }
  };

  const handleViewDashboard = async (employee: Employee) => {
    setViewingEmployee(employee);
    await loadEmployeeData(employee.id);
  };

  const loadEmployeeData = async (employeeId: string) => {
    try {
      const [leadsRes, callsRes, meetingsRes, allLeadsRes] = await Promise.all([
        supabase.from('leads').select('*').eq('assigned_to', employeeId),
        supabase.from('call_history').select('id', { count: 'exact' }).eq('user_id', employeeId),
        supabase.from('meetings').select('id', { count: 'exact' }).eq('assigned_to', employeeId),
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
      ]);

      setAssignedLeads(leadsRes.data || []);
      setAllLeads(allLeadsRes.data || []);
      setEmployeeStats({
        totalLeads: leadsRes.data?.length || 0,
        activeCalls: callsRes.count || 0,
        scheduledMeetings: meetingsRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading employee data:', error);
    }
  };

  const handleAssignLead = async (leadId: string) => {
    if (!viewingEmployee) return;

    try {
      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: viewingEmployee.id })
        .eq('id', leadId);

      if (error) throw error;

      await loadEmployeeData(viewingEmployee.id);
    } catch (error) {
      console.error('Error assigning lead:', error);
      alert('Failed to assign lead');
    }
  };

  const handleUnassignLead = async (leadId: string) => {
    if (!viewingEmployee) return;

    try {
      const { error } = await supabase
        .from('leads')
        .update({ assigned_to: null })
        .eq('id', leadId);

      if (error) throw error;

      await loadEmployeeData(viewingEmployee.id);
    } catch (error) {
      console.error('Error unassigning lead:', error);
      alert('Failed to unassign lead');
    }
  };

  const handleAddEmployee = async () => {
    if (!isAdmin) {
      alert('Only admins can add employees');
      return;
    }

    if (!addForm.email || !addForm.password) {
      alert('Email and password are required');
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: addForm.email,
        password: addForm.password,
        options: {
          data: {
            full_name: addForm.full_name || addForm.email,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const { error: updateError } = await supabase
          .from('employees')
          .update({
            full_name: addForm.full_name || addForm.email,
            phone: addForm.phone,
            role: addForm.role,
            hourly_rate: addForm.hourly_rate,
          })
          .eq('id', authData.user.id);

        if (updateError) console.error('Error updating employee details:', updateError);
      }

      setShowAddModal(false);
      setAddForm({
        email: '',
        password: '',
        full_name: '',
        phone: '',
        role: 'employee',
        hourly_rate: 0,
      });
      loadEmployees();
      alert('Employee added successfully! They can now sign in with their credentials.');
    } catch (error: any) {
      console.error('Error adding employee:', error);
      alert(`Failed to add employee: ${error.message}`);
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
              <div className="w-full">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-900">
                    {employee.full_name || employee.email.split('@')[0]}
                  </h3>
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
                <p className="text-sm text-gray-500 uppercase tracking-wide">{employee.role}</p>
              </div>
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
              <button
                onClick={() => handleViewDashboard(employee)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Dashboard
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => handleEditClick(employee)}
                    className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button className="px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
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

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add New Employee</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="employee@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={addForm.full_name}
                  onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="employee">Employee</option>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hourly Rate ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={addForm.hourly_rate}
                  onChange={(e) => setAddForm({ ...addForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="25.00"
                />
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={handleAddEmployee}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Add Employee
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Edit Employee</h2>
              <button
                onClick={() => setEditingEmployee(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="text"
                  value={editingEmployee.email}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="employee">Employee</option>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hourly Rate ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.hourly_rate}
                  onChange={(e) => setEditForm({ ...editForm, hourly_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="25.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={handleUpdateEmployee}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingEmployee(null)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold text-2xl">
                  {getInitials(viewingEmployee.email, viewingEmployee.full_name)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {viewingEmployee.full_name || viewingEmployee.email.split('@')[0]}
                  </h2>
                  <p className="text-slate-300">{viewingEmployee.email}</p>
                  <p className="text-xs text-slate-400 uppercase mt-1">{viewingEmployee.role}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingEmployee(null)}
                className="text-white hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {employeeStats && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <TrendingUp className="w-6 h-6 text-blue-600" />
                      <h3 className="text-sm font-medium text-gray-600">Assigned Leads</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{employeeStats.totalLeads}</p>
                  </div>

                  <div className="bg-green-50 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <PhoneCall className="w-6 h-6 text-green-600" />
                      <h3 className="text-sm font-medium text-gray-600">Active Calls</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{employeeStats.activeCalls}</p>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <Users className="w-6 h-6 text-purple-600" />
                      <h3 className="text-sm font-medium text-gray-600">Meetings</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{employeeStats.scheduledMeetings}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Assigned Leads ({assignedLeads.length})</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {assignedLeads.length === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-6 text-center">
                        <p className="text-gray-600">No leads assigned yet</p>
                      </div>
                    ) : (
                      assignedLeads.map(lead => (
                        <div key={lead.id} className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-slate-900">{lead.name}</h4>
                              {lead.company && <p className="text-sm text-gray-600">{lead.company}</p>}
                            </div>
                            <button
                              onClick={() => handleUnassignLead(lead.id)}
                              className="text-red-600 hover:text-red-700 text-xs font-medium"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            {lead.email && <span>{lead.email}</span>}
                            {lead.phone && <span>{lead.phone}</span>}
                          </div>
                          <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {lead.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Available Leads</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {allLeads.filter(lead => !lead.assigned_to || lead.assigned_to === viewingEmployee.id).length === assignedLeads.length ? (
                      <div className="bg-gray-50 rounded-lg p-6 text-center">
                        <p className="text-gray-600">No available leads</p>
                      </div>
                    ) : (
                      allLeads
                        .filter(lead => !lead.assigned_to)
                        .map(lead => (
                          <div key={lead.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-semibold text-slate-900">{lead.name}</h4>
                                {lead.company && <p className="text-sm text-gray-600">{lead.company}</p>}
                              </div>
                              <button
                                onClick={() => handleAssignLead(lead.id)}
                                className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                              >
                                Assign
                              </button>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {lead.email && <span>{lead.email}</span>}
                              {lead.phone && <span>{lead.phone}</span>}
                            </div>
                            <span className="inline-block mt-2 px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">
                              {lead.status}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
