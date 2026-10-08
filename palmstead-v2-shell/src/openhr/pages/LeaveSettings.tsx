"use client";

// Duplicated from OpenHRApp's own real settings screen
// (src/components/organization/OrgLeaves.tsx), scoped to just the Leave
// slice of it -- that file lives inside a much bigger "Organization" hub
// (shifts/teams/departments/locations too) which doesn't belong under
// Leave at all. Standing rule: every app houses its own settings, not a
// separate global settings app -- so this is its own page under the Leave
// app rather than a tab inside OpenHRApp's own Organization.tsx (never
// copied here for that reason).
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { hrService } from '../services/hrService';
import { CustomLeaveType, Employee, LeavePolicy } from '../types';
import { DEFAULT_LEAVE_TYPES } from '../constants';
import { useToast } from '../context/ToastContext';

interface Props {
  onBack: () => void;
}

const LeaveSettings: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useToast();
  const [policy, setPolicy] = useState<LeavePolicy>({ defaults: {}, overrides: {} });
  const [leaveTypes, setLeaveTypes] = useState<CustomLeaveType[]>(DEFAULT_LEAVE_TYPES);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideForm, setOverrideForm] = useState<Record<string, any>>({ employeeId: '' });
  const [isSaving, setIsSaving] = useState(false);

  const balanceTypes = leaveTypes.filter((t) => t.hasBalance);

  const load = async () => {
    setIsLoading(true);
    try {
      const [p, t, e] = await Promise.all([
        hrService.getLeavePolicy(),
        hrService.getLeaveTypes(),
        hrService.getEmployees(),
      ]);
      setPolicy(p);
      setLeaveTypes(t);
      setEmployees(e);
    } catch (err) {
      console.error('Failed to load leave settings', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDefaultChange = async (leaveType: string, value: number) => {
    const next = { ...policy, defaults: { ...policy.defaults, [leaveType]: value } };
    setPolicy(next);
    try {
      await hrService.setLeavePolicy(next);
    } catch {
      showToast('Failed to save -- please try again', 'error');
      load();
    }
  };

  const openOverrideModal = () => {
    const form: Record<string, any> = { employeeId: '' };
    balanceTypes.forEach((t) => { form[t.id] = policy.defaults[t.id] || 0; });
    setOverrideForm(form);
    setShowOverrideModal(true);
  };

  const saveOverride = async () => {
    if (!overrideForm.employeeId) return;
    setIsSaving(true);
    try {
      for (const t of balanceTypes) {
        await hrService.setStaffLeaveQuotaOverride(overrideForm.employeeId, t.id, Number(overrideForm[t.id]) || 0);
      }
      showToast('Override saved', 'success');
      setShowOverrideModal(false);
      await load();
    } catch {
      showToast('Failed to save override', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteOverride = async (empId: string) => {
    if (!window.confirm('Remove this custom policy?')) return;
    try {
      for (const t of balanceTypes) {
        await hrService.removeStaffLeaveQuotaOverride(empId, t.id);
      }
      await load();
    } catch {
      showToast('Failed to remove override', 'error');
    }
  };

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center text-slate-400">Loading settings…</div>;
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500 pb-20">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm text-slate-400 hover:text-primary transition-all">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Leave Settings</h1>
          <p className="text-sm text-slate-500 font-medium">Control the annual quota per leave type and set individual exceptions</p>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-8 bg-primary text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl"><ShieldCheck size={24} /></div>
            <div><h3 className="text-xl font-semibold uppercase tracking-tight">Company-wide Defaults</h3></div>
          </div>
        </div>
        <div className="p-8 space-y-6 flex-1">
          <div className={`grid gap-4 ${[, 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'][Math.min(balanceTypes.length, 5)] || 'grid-cols-5'}`}>
            {balanceTypes.map((lt) => (
              <div key={lt.id} className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{lt.name.replace(' Leave', '')}</label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xl text-center outline-none focus:ring-4 focus:ring-primary-light"
                  value={policy.defaults[lt.id] ?? 0}
                  onChange={(e) => handleDefaultChange(lt.id, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Saved automatically as you edit each field</p>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 bg-slate-800 text-white flex items-center justify-between">
          <h3 className="text-lg font-semibold uppercase tracking-wider">Staff Overrides</h3>
          <button onClick={openOverrideModal} className="px-4 py-2 bg-white/10 rounded-xl text-[10px] font-semibold uppercase tracking-widest flex items-center gap-2 hover:bg-white/20 transition-all">
            <Plus size={14} /> Add Custom Policy
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(policy.overrides).map(([empId, quota]) => {
            const empName = employees.find((e) => e.id === empId)?.name || empId;
            const quotaEntries = quota as Record<string, number>;
            const summary = balanceTypes.map((t) => `${t.name.replace(' Leave', '').charAt(0)}:${quotaEntries[t.id] || 0}`).join(' • ');
            return (
              <div key={empId} className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex justify-between items-center group hover:bg-white transition-all">
                <div>
                  <p className="font-bold text-slate-900">{empName}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">{summary}</p>
                </div>
                <button onClick={() => deleteOverride(empId)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          {Object.keys(policy.overrides).length === 0 && (
            <p className="col-span-full text-center text-slate-400 py-6 text-xs font-bold uppercase tracking-widest">No individual overrides set.</p>
          )}
        </div>
      </div>

      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-sm font-semibold uppercase tracking-widest">Custom Leave Policy</h3>
              <button onClick={() => setShowOverrideModal(false)}><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">Select Staff</label>
                <select
                  required
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
                  value={overrideForm.employeeId}
                  onChange={(e) => setOverrideForm({ ...overrideForm, employeeId: e.target.value })}
                >
                  <option value="">-- Choose Staff --</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className={`grid gap-3 ${[, 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'][Math.min(balanceTypes.length, 5)] || 'grid-cols-5'}`}>
                {balanceTypes.map((lt) => (
                  <div key={lt.id} className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase px-1">{lt.name.replace(' Leave', '')}</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-center"
                      value={overrideForm[lt.id] ?? 0}
                      onChange={(e) => setOverrideForm({ ...overrideForm, [lt.id]: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={!overrideForm.employeeId || isSaving}
                onClick={saveOverride}
                className="w-full py-4 bg-primary text-white rounded-xl font-semibold uppercase text-xs tracking-widest shadow-lg hover:bg-primary-hover transition-all disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveSettings;
