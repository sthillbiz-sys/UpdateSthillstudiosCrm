import { apiDelete, apiGet, apiPost, apiPut, clearStoredSession, getStoredToken, getStoredUser, persistSession, type ApiUser } from './api';

type SupabaseResult<T = any> = { data: T; error: any; count?: number | null };

type Filter = { op: 'eq' | 'neq' | 'gte' | 'lte' | 'in'; column: string; value: any };
type OrderBy = { column: string; ascending: boolean };

function normalizeRole(value: any): 'admin' | 'agent' | 'employee' {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('agent')) return 'agent';
  return 'employee';
}

function tableToRoute(table: string): string {
  switch (table) {
    case 'calendar_notes':
      return '/calendar-notes';
    case 'shift_entries':
      return '/shift-entries';
    case 'break_entries':
      return '/break-entries';
    case 'call_history':
      return '/calls';
    case 'user_presence':
      return '/employees';
    case 'employee_settings':
      return '/employee-settings';
    default:
      return `/${table}`;
  }
}

function toComparable(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.toLowerCase();
  return value;
}

function filterRows(rows: any[], filters: Filter[]): any[] {
  return rows.filter((row) => {
    for (const filter of filters) {
      const rowValue = row[filter.column];
      if (filter.op === 'eq' && rowValue != filter.value) return false;
      if (filter.op === 'neq' && rowValue == filter.value) return false;
      if (filter.op === 'gte' && toComparable(rowValue) < toComparable(filter.value)) return false;
      if (filter.op === 'lte' && toComparable(rowValue) > toComparable(filter.value)) return false;
      if (filter.op === 'in' && Array.isArray(filter.value) && !filter.value.includes(rowValue)) return false;
    }
    return true;
  });
}

function normalizeEmployeeRow(row: any) {
  const fullName = row?.full_name || row?.name || '';
  const phone = row?.phone || row?.contact_info || '';
  return {
    ...row,
    id: String(row?.id ?? ''),
    full_name: fullName,
    name: fullName,
    phone,
    contact_info: phone,
    role: normalizeRole(row?.role),
    status: row?.status || 'active',
    assigned_color: row?.assigned_color || '#3B82F6',
  };
}

function normalizeEmployeePayload(payload: any) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  const mapped = { ...payload } as Record<string, any>;
  if (Object.prototype.hasOwnProperty.call(mapped, 'full_name')) {
    mapped.name = mapped.full_name;
    delete mapped.full_name;
  }
  if (Object.prototype.hasOwnProperty.call(mapped, 'phone')) {
    mapped.contact_info = mapped.phone;
    delete mapped.phone;
  }
  if (Object.prototype.hasOwnProperty.call(mapped, 'assigned_color')) {
    delete mapped.assigned_color;
  }
  if (Object.prototype.hasOwnProperty.call(mapped, 'id')) {
    delete mapped.id;
  }
  return mapped;
}

function mapPayloadForTable(table: string, payload: any) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (table === 'employees') {
    return normalizeEmployeePayload(payload);
  }

  if (table === 'leads') {
    const mapped = { ...payload } as Record<string, any>;
    if (Object.prototype.hasOwnProperty.call(mapped, 'assigned_to')) {
      const assigned = mapped.assigned_to;
      mapped.created_by_user_id =
        assigned === '' || assigned === null || assigned === undefined
          ? null
          : Number(assigned);
      delete mapped.assigned_to;
    }
    return mapped;
  }

  return payload;
}

class QueryBuilder implements PromiseLike<SupabaseResult<any>> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;
  private filters: Filter[] = [];
  private orders: OrderBy[] = [];
  private limitValue: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private wantHeadCount = false;
  private wantCount = false;

  constructor(private readonly table: string) {}

  select(_columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    if (this.action === 'select') {
      this.action = 'select';
    }
    if (options?.count === 'exact') {
      this.wantCount = true;
      if (options.head === true) {
        this.wantHeadCount = true;
      }
    }
    return this;
  }

  insert(payload: any) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ op: 'neq', column, value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ op: 'in', column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  private getFilterValue(column: string) {
    const item = this.filters.find((filter) => filter.column === column && filter.op === 'eq');
    return item?.value;
  }

  private async executeSelect(): Promise<SupabaseResult<any>> {
    try {
      if (this.table === 'employee_settings') {
        return { data: [], error: null };
      }

      if (this.table === 'call_history') {
        const calls = await apiGet<any[]>('/calls');
        const mapped = calls.map((call) => ({
          id: call.id,
          user_id: call.created_by_user_id ? String(call.created_by_user_id) : '',
          user_email: '',
          contact_name: call.contact_name || '',
          contact_phone: call.phone_number || '',
          duration: Math.max(0, Math.floor((Number(call.duration) || 0) / 60)),
          outcome: call.status || 'completed',
          notes: call.error_message || '',
          called_at: call.timestamp,
        }));
        return this.finalizeResult(mapped);
      }

      if (this.table === 'user_presence') {
        const employees = await apiGet<any[]>('/employees');
        const mapped = employees.map((row) => {
          const employee = normalizeEmployeeRow(row);
          return {
          user_id: employee.id,
          name: employee.full_name || employee.email || 'Team Member',
          status: 'available',
          custom_message: '',
          is_on_call: false,
          last_activity: new Date().toISOString(),
          employee: {
            full_name: employee.full_name || employee.email || 'Team Member',
            email: employee.email || '',
            assigned_color: employee.assigned_color || '#3B82F6',
            role: employee.role || 'employee',
          },
        };
      });
        return this.finalizeResult(mapped);
      }

      const rows = await apiGet<any[]>(tableToRoute(this.table));
      if (this.table === 'employees') {
        const mapped = rows.map(normalizeEmployeeRow);
        return this.finalizeResult(mapped);
      }
      if (this.table === 'leads') {
        const mapped = rows.map((row) => ({
          ...row,
          created_at: row.created_at || row.timestamp || row.date || new Date().toISOString(),
          date: row.date || row.timestamp || row.created_at || new Date().toISOString(),
          assigned_to:
            row.assigned_to !== undefined && row.assigned_to !== null && row.assigned_to !== ''
              ? String(row.assigned_to)
              : row.created_by_user_id !== undefined &&
                  row.created_by_user_id !== null &&
                  row.created_by_user_id !== ''
                ? String(row.created_by_user_id)
                : null,
        }));
        return this.finalizeResult(mapped);
      }
      if (this.table === 'meetings') {
        const mapped = rows.map((row) => {
          let attendees: string[] = [];
          if (Array.isArray(row.attendees)) {
            attendees = row.attendees.map((item: any) => String(item)).filter(Boolean);
          } else if (typeof row.attendees_json === 'string' && row.attendees_json.trim() !== '') {
            try {
              const parsed = JSON.parse(row.attendees_json);
              if (Array.isArray(parsed)) {
                attendees = parsed.map((item: any) => String(item)).filter(Boolean);
              }
            } catch {
              attendees = [];
            }
          }
          return {
            ...row,
            attendees,
            assigned_to:
              row.assigned_to !== undefined && row.assigned_to !== null && row.assigned_to !== ''
                ? String(row.assigned_to)
                : row.created_by_user_id !== undefined &&
                    row.created_by_user_id !== null &&
                    row.created_by_user_id !== ''
                  ? String(row.created_by_user_id)
                  : null,
          };
        });
        return this.finalizeResult(mapped);
      }
      if (this.table === 'contacts') {
        const mapped = rows.map((row) => ({
          ...row,
          first_name: row.first_name || (row.name ? String(row.name).split(/\s+/)[0] : ''),
          last_name:
            row.last_name ||
            (row.name ? String(row.name).split(/\s+/).slice(1).join(' ') : ''),
          company: row.company ? { name: row.company } : row.company_name ? { name: row.company_name } : undefined,
        }));
        return this.finalizeResult(mapped);
      }
      if (this.table === 'deals') {
        const mapped = rows.map((row) => ({
          ...row,
          contact: row.contact_name
            ? (() => {
                const parts = String(row.contact_name).trim().split(/\s+/);
                return {
                  first_name: parts[0] || '',
                  last_name: parts.slice(1).join(' '),
                };
              })()
            : undefined,
          company: row.company_name ? { name: row.company_name } : undefined,
        }));
        return this.finalizeResult(mapped);
      }
      return this.finalizeResult(rows);
    } catch (error) {
      return { data: this.wantSingle ? null : [], error };
    }
  }

  private async executeInsert(): Promise<SupabaseResult<any>> {
    try {
      const rawPayload = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      const payload = mapPayloadForTable(this.table, rawPayload);
      const data = await apiPost<any>(tableToRoute(this.table), payload);
      return this.finalizeMutationResult(data);
    } catch (error) {
      return { data: null, error };
    }
  }

  private async executeUpdate(): Promise<SupabaseResult<any>> {
    try {
      const id = this.getFilterValue('id');
      if (id === undefined || id === null) {
        return { data: null, error: new Error('Missing id filter for update') };
      }
      const payload = mapPayloadForTable(this.table, this.payload);
      const data = await apiPut<any>(`${tableToRoute(this.table)}/${id}`, payload);
      return this.finalizeMutationResult(data);
    } catch (error) {
      return { data: null, error };
    }
  }

  private async executeDelete(): Promise<SupabaseResult<any>> {
    try {
      const id = this.getFilterValue('id');
      if (id === undefined || id === null) {
        return { data: null, error: new Error('Missing id filter for delete') };
      }
      const data = await apiDelete<any>(`${tableToRoute(this.table)}/${id}`);
      return this.finalizeMutationResult(data);
    } catch (error) {
      return { data: null, error };
    }
  }

  private finalizeResult(rows: any[]): SupabaseResult<any> {
    let filtered = filterRows(rows, this.filters);

    for (const order of this.orders) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a?.[order.column];
        const bValue = b?.[order.column];
        if (aValue === bValue) return 0;
        if (aValue === undefined || aValue === null) return order.ascending ? -1 : 1;
        if (bValue === undefined || bValue === null) return order.ascending ? 1 : -1;
        return (aValue > bValue ? 1 : -1) * (order.ascending ? 1 : -1);
      });
    }

    if (typeof this.limitValue === 'number') {
      filtered = filtered.slice(0, this.limitValue);
    }

    if (this.wantHeadCount) {
      return { data: null, error: null, count: filtered.length };
    }

    if (this.wantSingle) {
      if (filtered.length === 0) {
        return { data: null, error: new Error('No rows returned') };
      }
      return { data: filtered[0], error: null };
    }

    if (this.wantMaybeSingle) {
      return { data: filtered[0] || null, error: null };
    }

    if (this.wantCount) {
      return { data: filtered, error: null, count: filtered.length };
    }

    return { data: filtered, error: null };
  }

  private finalizeMutationResult(data: any): SupabaseResult<any> {
    if (this.wantSingle || this.wantMaybeSingle) {
      return { data: data?.data || data?.row || data || null, error: null };
    }

    if (Array.isArray(data)) {
      return { data, error: null };
    }

    if (data?.data && Array.isArray(data.data)) {
      return { data: data.data, error: null };
    }

    return { data: data ?? null, error: null };
  }

  private execute(): Promise<SupabaseResult<any>> {
    if (this.action === 'insert') {
      return this.executeInsert();
    }
    if (this.action === 'update') {
      return this.executeUpdate();
    }
    if (this.action === 'delete') {
      return this.executeDelete();
    }
    return this.executeSelect();
  }

  then<TResult1 = SupabaseResult<any>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

function getSessionPayload() {
  const token = getStoredToken();
  const user = getStoredUser();
  if (!token || !user) {
    return null;
  }
  return {
    access_token: token,
    user,
  };
}

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table);
  },
  channel(_name: string) {
    return {
      on(..._args: any[]) {
        return this;
      },
      subscribe(..._args: any[]) {
        return this;
      },
      unsubscribe() {
        return Promise.resolve();
      },
    };
  },
  auth: {
    async getSession() {
      return { data: { session: getSessionPayload() } };
    },
    onAuthStateChange(callback: (_event: string, session: any) => void) {
      const handler = () => {
        callback('TOKEN_REFRESHED', getSessionPayload());
      };
      window.addEventListener('storage', handler);
      return {
        data: {
          subscription: {
            unsubscribe() {
              window.removeEventListener('storage', handler);
            },
          },
        },
      };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const data = await apiPost<{ token: string; user: ApiUser }>('/auth/login', { email, password });
        persistSession(data.token, data.user);
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: { full_name?: string } };
    }) {
      const providedName = options?.data?.full_name?.trim();
      const fallbackName = providedName || email.split('@')[0] || 'User';
      try {
        const data = await apiPost<{ token: string; user: ApiUser }>('/auth/signup', {
          name: fallbackName,
          email,
          password,
        });
        return {
          data: {
            user: {
              id: String(data.user.id),
              email: data.user.email,
              user_metadata: { full_name: data.user.name || fallbackName },
            },
          },
          error: null,
        };
      } catch (error) {
        return { data: { user: null }, error };
      }
    },
    async signOut() {
      clearStoredSession();
    },
    admin: {
      async listUsers() {
        try {
          const employees = await apiGet<any[]>('/employees');
          const users = employees.map((employee) => ({
            id: String(employee.id),
            email: employee.email || '',
            created_at: employee.hire_date || new Date().toISOString(),
            user_metadata: {
              full_name: employee.full_name || employee.name || '',
              phone: employee.phone || employee.contact_info || '',
              role: employee.role || 'agent',
            },
          }));

          return { data: { users }, error: null };
        } catch (error) {
          return { data: { users: [] }, error };
        }
      },
    },
  },
  async rpc(_functionName: string, _args?: Record<string, unknown>) {
    return { data: null, error: null };
  },
};

export const createClient = () => supabase;
