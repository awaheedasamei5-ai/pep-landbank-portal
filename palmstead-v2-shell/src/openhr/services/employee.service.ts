
import { supabase, isSupabaseConfigured, getSupabaseStorageUrl } from './supabase';
import { apiClient, dedupe } from './api.client';
import { Employee } from '../types';

let cachedEmployees: Employee[] | null = null;
let empCacheTimestamp = 0;
const EMP_CACHE_TTL = 2 * 60 * 1000;

const SUPABASE_FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
  : null;

// Real profiles columns (confirmed live): id, email, name, role, agent_key,
// active, created_at, avatar, birthday, phone, whatsapp, social_handles,
// signature_data, position, address, id_number, last_seen_at, widget_token
// -- no employee_id/line_manager_id/team_id/shift_id/organization_id/
// department/designation/joining_date/mobile/emergency_contact/salary/
// status/employment_type/location/work_type/verified at all (OpenHRApp's
// own multi-tenant Employee fields this project's real HR data doesn't
// track yet). `id` is agent_key, not the uuid primary key -- matches the
// identity convention AuthContext.tsx already established (every other
// service here keys off agent_key, not profiles.id).
function mapProfileToEmployee(r: any): Employee {
  return {
    id: r.agent_key,
    employeeId: r.agent_key,
    lineManagerId: undefined,
    teamId: undefined,
    shiftId: undefined,
    organizationId: undefined,
    name: r.name || 'No Name',
    email: r.email || '',
    role: (r.role || 'EMPLOYEE').toUpperCase(),
    department: '',
    designation: r.position || 'Staff',
    avatar: r.avatar ? getSupabaseStorageUrl('avatars', r.avatar) : undefined,
    joiningDate: '',
    mobile: r.phone || r.whatsapp || '',
    emergencyContact: '',
    salary: 0,
    status: r.active === false ? 'INACTIVE' : 'ACTIVE',
    employmentType: 'PERMANENT',
    location: r.address || '',
    workType: 'OFFICE',
    verified: true,
  } as any;
}

export const employeeService = {
  clearCache() {
    cachedEmployees = null;
    empCacheTimestamp = 0;
  },

  async getEmployees(): Promise<Employee[]> {
    if (cachedEmployees && Date.now() - empCacheTimestamp < EMP_CACHE_TTL) return cachedEmployees;

    return dedupe('employees', async () => {
      if (!isSupabaseConfigured()) {
        console.warn('[EmployeeService] Supabase not configured');
        return [];
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;

        console.log(`[EmployeeService] Fetched ${data?.length ?? 0} employees`);
        const result = (data ?? []).map(mapProfileToEmployee);
        cachedEmployees = result;
        empCacheTimestamp = Date.now();
        return result;
      } catch (e: any) {
        console.error('[EmployeeService] Failed to fetch employees:', e?.message || e);
        return [];
      }
    });
  },

  async addEmployee(emp: Partial<Employee>) {
    if (!isSupabaseConfigured() || !SUPABASE_FUNCTIONS_URL) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const formData = new FormData();
    if (emp.email)       formData.append('email', emp.email);
    if ((emp as any).password) formData.append('password', (emp as any).password);
    if (emp.name)        formData.append('name', emp.name);
    if (emp.role)        formData.append('role', emp.role.toUpperCase());
    if (emp.department)  formData.append('department', emp.department);
    if (emp.designation) formData.append('designation', emp.designation);
    if (emp.employeeId)  formData.append('employeeId', emp.employeeId);
    if (emp.lineManagerId) formData.append('lineManagerId', emp.lineManagerId);
    if (emp.teamId)      formData.append('teamId', emp.teamId);
    if (emp.shiftId)     formData.append('shiftId', emp.shiftId);
    if (emp.mobile)      formData.append('mobile', emp.mobile);
    if (emp.joiningDate) formData.append('joiningDate', emp.joiningDate);

    // Avatar: data URL → Blob
    if (emp.avatar && typeof emp.avatar === 'string' && emp.avatar.startsWith('data:')) {
      const blob = await (await fetch(emp.avatar)).blob();
      formData.append('avatar', blob, 'avatar.webp');
    }

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-employee`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create employee');

    employeeService.clearCache();
    apiClient.notify();
  },

  async updateProfile(id: string, updates: Partial<Employee> | any) {
    if (!isSupabaseConfigured()) return;

    const payload: any = {};
    if (updates.name !== undefined)        payload.name = updates.name;
    if (updates.role !== undefined)        payload.role = updates.role.toUpperCase();
    if (updates.department !== undefined)  payload.department = updates.department;
    if (updates.designation !== undefined) payload.designation = updates.designation;
    if (updates.employeeId !== undefined)  payload.employee_id = updates.employeeId;
    if (updates.mobile !== undefined)      payload.mobile = updates.mobile;
    if (updates.joiningDate !== undefined) payload.joining_date = updates.joiningDate;
    if (updates.employmentType !== undefined) payload.employment_type = updates.employmentType;
    if (updates.workType !== undefined)    payload.work_type = updates.workType;
    if (updates.salary !== undefined)      payload.salary = updates.salary;
    if (updates.location !== undefined)    payload.location = updates.location;
    if (updates.emergencyContact !== undefined) payload.emergency_contact = updates.emergencyContact;

    const lmId = updates.lineManagerId ?? updates.line_manager_id;
    if (lmId !== undefined) payload.line_manager_id = lmId === '' ? null : lmId;

    const tId = updates.teamId ?? updates.team_id;
    if (tId !== undefined) payload.team_id = tId === '' ? null : tId;

    const sId = updates.shiftId ?? updates.shift_id;
    if (sId !== undefined) payload.shift_id = sId === '' ? null : sId;

    // Avatar upload to storage
    if (updates.avatar && typeof updates.avatar === 'string' && updates.avatar.startsWith('data:')) {
      try {
        const blob = await (await fetch(updates.avatar)).blob();
        const path = `${id}/avatar.webp`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, blob, { upsert: true, contentType: 'image/webp' });
        if (!uploadErr) payload.avatar = path;
      } catch (e) {
        console.warn('[EmployeeService] Avatar upload failed:', e);
      }
    }

    // Self-service password change via supabase.auth.updateUser.
    // Only works for the currently authenticated user changing their own password.
    if (updates.password) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        throw new Error('No active session. Please log in again.');
      }

      // Verify current password before allowing change
      if (updates.oldPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: session.user.email,
          password: updates.oldPassword,
        });
        if (signInError) {
          throw new Error('Current password is incorrect.');
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: updates.password,
      });
      if (updateError) throw updateError;
    }

    console.log('[EmployeeService] Updating profile:', id, payload);
    const { error } = await supabase.from('profiles').update(payload).eq('id', id);
    if (error) throw error;

    employeeService.clearCache();
    apiClient.notify();
  },

  async deleteEmployee(id: string) {
    if (!isSupabaseConfigured() || !SUPABASE_FUNCTIONS_URL) return;

    // Use the Edge Function so the auth.users record is also deleted.
    // The client-side profiles.delete() only removes the profiles row;
    // the FK cascade only works auth→profiles, not profiles→auth.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/delete-employee`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: id }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to delete employee');

    employeeService.clearCache();
    apiClient.notify();
  },

  async offboardEmployee(id: string) {
    if (!isSupabaseConfigured() || !SUPABASE_FUNCTIONS_URL) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/admin-offboard-employee`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: id, action: 'offboard' }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to offboard employee');

    employeeService.clearCache();
    apiClient.notify();
  },

  async reactivateEmployee(id: string) {
    if (!isSupabaseConfigured() || !SUPABASE_FUNCTIONS_URL) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/admin-offboard-employee`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: id, action: 'reactivate' }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to reactivate employee');

    employeeService.clearCache();
    apiClient.notify();
  },
};
