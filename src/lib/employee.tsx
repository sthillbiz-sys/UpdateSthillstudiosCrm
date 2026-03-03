import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'employee' | 'agent';
  assigned_color: string;
  phone?: string;
  department?: string;
  hourly_rate?: number;
  hire_date?: string;
  status?: string;
  avatar_url?: string;
  last_login?: string;
  created_at: string;
  updated_at?: string;
}

interface EmployeeContextType {
  currentEmployee: Employee | null;
  isAdmin: boolean;
  loading: boolean;
  allEmployees: Employee[];
  refreshEmployee: () => Promise<void>;
  refreshAllEmployees: () => Promise<void>;
}

const EmployeeContext = createContext<EmployeeContextType | undefined>(undefined);

function normalizeRole(value: unknown): Employee['role'] {
  const role = String(value ?? '')
    .trim()
    .toLowerCase();
  if (role.includes('admin')) return 'admin';
  if (role.includes('agent')) return 'agent';
  return 'employee';
}

function mapEmployee(row: any): Employee {
  return {
    id: String(row?.id ?? ''),
    email: row?.email || '',
    full_name: row?.full_name || row?.name || '',
    role: normalizeRole(row?.role),
    assigned_color: row?.assigned_color || '#3B82F6',
    phone: row?.phone || row?.contact_info || '',
    department: row?.department,
    hourly_rate: row?.hourly_rate ? Number(row.hourly_rate) : undefined,
    hire_date: row?.hire_date,
    status: row?.status || 'active',
    avatar_url: row?.avatar_url,
    last_login: row?.last_login,
    created_at: row?.created_at || new Date().toISOString(),
    updated_at: row?.updated_at,
  };
}

export function EmployeeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshEmployee = async () => {
    if (!user?.email) {
      setCurrentEmployee(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentEmployee(mapEmployee(data));
      } else {
        setCurrentEmployee({
          id: String(user.id),
          email: user.email,
          full_name: user.name || user.email.split('@')[0],
          role: normalizeRole(user.role),
          assigned_color: '#3B82F6',
          status: 'active',
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error loading employee:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshAllEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('full_name');

      if (error) throw error;
      if (data) setAllEmployees(data.map(mapEmployee));
    } catch (error) {
      console.error('Error loading all employees:', error);
    }
  };

  useEffect(() => {
    refreshEmployee();
    refreshAllEmployees();
  }, [user]);

  const isAdmin = normalizeRole(currentEmployee?.role || user?.role || 'employee') === 'admin';

  return (
    <EmployeeContext.Provider
      value={{
        currentEmployee,
        isAdmin,
        loading,
        allEmployees,
        refreshEmployee,
        refreshAllEmployees,
      }}
    >
      {children}
    </EmployeeContext.Provider>
  );
}

export function useEmployee() {
  const context = useContext(EmployeeContext);
  if (context === undefined) {
    throw new Error('useEmployee must be used within an EmployeeProvider');
  }
  return context;
}
