import { supabase, isSupabaseConfigured } from './supabase';

// Real Edge Function `send-sms` (Arkesel proxy) + table `sms_log`, already
// live and proven elsewhere in this project (web-next's payment reminders,
// SVE invites -- see src/webnext/data/source.ts's own `sms` entry). Mirrors
// that same shape exactly rather than inventing a second SMS client: never
// throws, so callers fire-and-forget rather than awaiting inside their own
// try/catch.
export const smsService = {
  async send(to: string | null | undefined, message: string, trigger: string, sentByKey: string | null): Promise<boolean> {
    if (!to || !isSupabaseConfigured()) return false;
    let ok = false;
    let errMsg: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to, message, sender: 'Trulander' },
      });
      if (error) throw error;
      ok = !!data?.ok;
      if (!ok) errMsg = data?.data?.message ? String(data.data.message) : 'SMS provider rejected the request';
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }
    try {
      await supabase
        .from('sms_log')
        .insert({ recipient: to, message, trigger: trigger || null, sent_by: sentByKey, status: ok ? 'sent' : 'failed', error: errMsg });
    } catch {
      // Logging the send is best-effort too.
    }
    return ok;
  },

  async phoneForAgentKey(agentKey: string): Promise<string | null> {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('phone, whatsapp')
        .eq('agent_key', agentKey)
        .maybeSingle();
      return (data?.phone || data?.whatsapp) ?? null;
    } catch {
      return null;
    }
  },

  // The real manager-role profile has no phone column set (confirmed live,
  // see webnext-no-manager-profile-no-phones memory) -- Management's real
  // contact number is app_config.company_phone instead, same fallback
  // web-next's own "notify Management" call sites already use.
  async phoneForManager(): Promise<string | null> {
    try {
      const { data: mgr } = await supabase
        .from('profiles')
        .select('phone, whatsapp')
        .eq('role', 'manager')
        .maybeSingle();
      if (mgr?.phone || mgr?.whatsapp) return mgr.phone || mgr.whatsapp;
      const { data: cfg } = await supabase.from('app_config').select('company_phone').maybeSingle();
      return cfg?.company_phone ?? null;
    } catch {
      return null;
    }
  },
};
