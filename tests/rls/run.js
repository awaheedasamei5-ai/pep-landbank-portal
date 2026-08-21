// RLS security test matrix -- rebuild Sec 63 (Testing Strategy), Sec 64 (RLS
// Security Test Matrix), Sec 93 (Final Acceptance Test -- Privacy).
//
// Creates disposable test accounts (2 agents, 1 manager, 2 client-portal
// identities) via the service-role admin client, exercises the exact
// scenarios the spec lists by signing in as each and hitting the real API
// (not just UI navigation, per Sec 93's own acceptance criterion), then
// deletes everything it created. Never touches real staff/client data.
//
// Run with:
//   SUPABASE_SERVICE_ROLE_KEY=... node run.js
// (grab the service-role key from Supabase dashboard -> Settings -> API;
// this script only ever reads it from the environment, never hardcoded.)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lrahgcnftetnyxunaljs.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RBFcd9r2oPt7uC8SRax9Iw_R-q7yCeA';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required (read from the environment, never hardcoded here). Aborting.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const results = [];
const cleanup = { userIds: [], leadIds: [], paymentIds: [], clientAccessIds: [] };

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' (' + detail + ')' : ''}`);
}

async function newSignedInClient(email, password) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client: c, userId: data.user.id };
}

async function createTestStaff(label, password) {
  const email = `rls-test-${label}-${stamp}@palmstead.internal`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: `RLS Test ${label}` },
  });
  if (error) throw new Error(`could not create ${label}: ${error.message}`);
  cleanup.userIds.push(data.user.id);
  // on_auth_user_created runs in the same transaction, so the profile exists by now.
  const { data: prof, error: profErr } = await admin.from('profiles').select('agent_key,role').eq('id', data.user.id).single();
  if (profErr || !prof) throw new Error(`profile missing for ${label}: ${profErr && profErr.message}`);
  return { userId: data.user.id, email, agentKey: prof.agent_key };
}

async function main() {
  console.log('Setting up disposable test accounts...');
  const agentA = await createTestStaff('agentA', 'RlsTest_A_' + stamp);
  const agentB = await createTestStaff('agentB', 'RlsTest_B_' + stamp);
  const manager = await createTestStaff('manager', 'RlsTest_M_' + stamp);
  await admin.from('profiles').update({ role: 'manager' }).eq('id', manager.userId);

  const { data: leadA, error: leadAErr } = await admin.from('leads').insert({
    agent_key: agentA.agentKey, name: `RLS Test Client A ${stamp}`, contact: `0244${String(stamp).slice(-6)}`,
  }).select().single();
  if (leadAErr) throw new Error('could not create leadA: ' + leadAErr.message);
  cleanup.leadIds.push(leadA.id);

  const { data: leadB, error: leadBErr } = await admin.from('leads').insert({
    agent_key: agentB.agentKey, name: `RLS Test Client B ${stamp}`, contact: `0244${String(stamp + 1).slice(-6)}`,
  }).select().single();
  if (leadBErr) throw new Error('could not create leadB: ' + leadBErr.message);
  cleanup.leadIds.push(leadB.id);

  const { data: paymentA, error: payErr } = await admin.from('payments').insert({
    lead_id: leadA.id, agent_key: agentA.agentKey, client_name: leadA.name, amount: 1,
  }).select().single();
  if (payErr) throw new Error('could not create paymentA: ' + payErr.message);
  cleanup.paymentIds.push(paymentA.id);

  console.log('Running assertions...');

  // --- Agent A can read own lead, cannot read Agent B's lead or payment ---
  const a = await newSignedInClient(agentA.email, 'RlsTest_A_' + stamp);
  {
    const { data } = await a.client.from('leads').select('id').eq('id', leadA.id);
    check('Agent A reads own lead: allowed', (data || []).length === 1);
  }
  {
    const { data } = await a.client.from('leads').select('id').eq('id', leadB.id);
    check('Agent A reads Agent B lead: denied', (data || []).length === 0);
  }
  {
    const { data, error } = await a.client.from('leads').update({ notes: 'tampered' }).eq('id', leadB.id).select();
    check('Agent A updates Agent B lead: denied', !error && (data || []).length === 0);
  }
  {
    const { data } = await a.client.from('payments').select('id').eq('id', paymentA.id);
    check('Agent A reads own payment: allowed', (data || []).length === 1);
  }

  // --- Agent B: symmetric denial ---
  const b = await newSignedInClient(agentB.email, 'RlsTest_B_' + stamp);
  {
    const { data } = await b.client.from('leads').select('id').eq('id', leadA.id);
    check('Agent B reads Agent A lead: denied', (data || []).length === 0);
  }
  {
    const { data } = await b.client.from('payments').select('id').eq('id', paymentA.id);
    check('Agent B reads Agent A payment: denied', (data || []).length === 0);
  }

  // --- Manager sees both ---
  const m = await newSignedInClient(manager.email, 'RlsTest_M_' + stamp);
  {
    const { data } = await m.client.from('leads').select('id').in('id', [leadA.id, leadB.id]);
    check('Manager reads both leads: allowed', (data || []).length === 2);
  }

  // --- Realtime: Agent A's channel sees an update to their own lead, Agent B's does not ---
  await new Promise((resolve) => {
    let aGotIt = false, bGotIt = false;
    const chA = a.client.channel('rls-test-a').on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${leadA.id}` },
      () => { aGotIt = true; }).subscribe();
    const chB = b.client.channel('rls-test-b').on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${leadA.id}` },
      () => { bGotIt = true; }).subscribe();
    setTimeout(async () => {
      await admin.from('leads').update({ notes: 'realtime probe ' + stamp }).eq('id', leadA.id);
      setTimeout(async () => {
        check('Realtime: Agent A sees update to own lead', aGotIt);
        check('Realtime: Agent B does not see it', !bGotIt);
        await chA.unsubscribe(); await chB.unsubscribe();
        resolve();
      }, 3000);
    }, 1000);
  });

  // --- Client portal: two shadow client identities via the existing client-login function ---
  const clientAContact = leadA.contact, clientBContact = leadB.contact;
  const loginA = await fetch(`${SUPABASE_URL}/functions/v1/client-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ name: leadA.name, contact: clientAContact, pin: '1122' }),
  }).then((r) => r.json());
  const loginB = await fetch(`${SUPABASE_URL}/functions/v1/client-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ name: leadB.name, contact: clientBContact, pin: '1122' }),
  }).then((r) => r.json());
  if (loginA.access_id) cleanup.clientAccessIds.push(loginA.access_id);
  if (loginB.access_id) cleanup.clientAccessIds.push(loginB.access_id);

  if (loginA.ok && loginB.ok) {
    const clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.setSession({ access_token: loginA.access_token, refresh_token: loginA.refresh_token });
    const { data } = await clientA.from('leads').select('id').eq('id', leadB.id);
    check('Client A reads Client B lead: denied', (data || []).length === 0);
    const { data: ownData } = await clientA.from('leads').select('id').eq('id', leadA.id);
    check('Client A reads own lead: allowed', (ownData || []).length === 1);
  } else {
    check('Client A/B login setup', false, 'client-login function did not return ok for both -- skipped client scenarios');
  }
}

async function cleanupAll() {
  console.log('Cleaning up disposable test data...');
  for (const id of cleanup.paymentIds) await admin.from('payments').delete().eq('id', id);
  for (const id of cleanup.leadIds) await admin.from('leads').delete().eq('id', id);
  for (const id of cleanup.clientAccessIds) await admin.from('client_portal_access').delete().eq('id', id);
  for (const id of cleanup.userIds) await admin.auth.admin.deleteUser(id);
}

main()
  .catch((e) => { console.error('FATAL:', e.message); check('script completed without throwing', false, e.message); })
  .finally(async () => {
    await cleanupAll();
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);
    if (failed.length) {
      console.error(`${failed.length} FAILED:`, failed.map((f) => f.name).join('; '));
      process.exit(1);
    }
    process.exit(0);
  });
