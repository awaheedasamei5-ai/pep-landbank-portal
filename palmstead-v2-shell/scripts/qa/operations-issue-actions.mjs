import { fileURLToPath } from "node:url";

import assert from "node:assert/strict";
import fs from "node:fs";

const { PGlite } = await import(process.env.PALMSTEAD_PGLITE_MODULE ?? "@electric-sql/pglite");

const db = new PGlite();
const repo = fileURLToPath(new URL("../..", import.meta.url));
const checks = [];
const ids = {
  manager: "00000000-0000-4000-8000-000000000001",
  assignee: "00000000-0000-4000-8000-000000000002",
  creator: "00000000-0000-4000-8000-000000000003",
  outsider: "00000000-0000-4000-8000-000000000004",
  inactive: "00000000-0000-4000-8000-000000000005",
  workspace: "10000000-0000-4000-8000-000000000001",
  project: "20000000-0000-4000-8000-000000000001",
  otherProject: "20000000-0000-4000-8000-000000000002",
  open: "30000000-0000-4000-8000-000000000001",
  done: "30000000-0000-4000-8000-000000000002",
  otherState: "30000000-0000-4000-8000-000000000003",
  cycle: "40000000-0000-4000-8000-000000000001",
  otherCycle: "40000000-0000-4000-8000-000000000002",
  label: "50000000-0000-4000-8000-000000000001",
  otherLabel: "50000000-0000-4000-8000-000000000002",
  module: "60000000-0000-4000-8000-000000000001",
  otherModule: "60000000-0000-4000-8000-000000000002",
  parent: "70000000-0000-4000-8000-000000000001",
  child: "70000000-0000-4000-8000-000000000002",
};

async function user(key, role = "authenticated") {
  await db.exec("reset role");
  const subject = key ? ids[key] : null;
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: subject, role })]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}

async function scalar(sql, params = []) {
  return (await db.query(sql, params)).rows[0]?.value;
}

async function rpc(name, args = []) {
  return scalar(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`, args);
}

async function error(label, action, pattern) {
  await assert.rejects(action, pattern, label);
  checks.push(label);
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    grant usage on schema auth to public;
    grant execute on all functions in schema auth to public;
    create table profiles(
      id uuid primary key,
      agent_key text unique,
      name text,
      role text,
      active boolean default true
    );
    create publication supabase_realtime;
  `);
  await db.exec(fs.readFileSync(new URL("./fixtures/operations-reset-schema.sql", import.meta.url), "utf8"));
  await db.exec(`
    grant select on all tables in schema public to authenticated;
    create function public.op_claim_issue_sequence(p_project_id uuid)
    returns integer language sql as $$select 1$$;
    grant execute on function public.op_claim_issue_sequence(uuid) to public, anon, authenticated;
  `);

  for (const [key, role, active] of [
    ["manager", "manager", true],
    ["assignee", "agent", true],
    ["creator", "agent", true],
    ["outsider", "agent", true],
    ["inactive", "manager", false],
  ]) {
    await db.query("insert into profiles(id,agent_key,name,role,active) values($1,$2,$3,$4,$5)", [
      ids[key],
      key,
      key,
      role,
      active,
    ]);
  }

  await db.query("insert into op_workspaces(id,name,slug) values($1,'Synthetic company','synthetic')", [ids.workspace]);
  await db.query(
    "insert into op_projects(id,workspace_id,name,identifier,created_by) values($1,$3,'Primary','PRI','manager'),($2,$3,'Other','OTH','manager')",
    [ids.project, ids.otherProject, ids.workspace]
  );
  await db.query(
    `insert into op_states(id,workspace_id,project_id,name,"group") values
      ($1,$4,$5,'Open','unstarted'),($2,$4,$5,'Done','completed'),($3,$4,$6,'Other','unstarted')`,
    [ids.open, ids.done, ids.otherState, ids.workspace, ids.project, ids.otherProject]
  );
  await db.query(
    "insert into op_cycles(id,workspace_id,project_id,name) values($1,$3,$4,'Cycle'),($2,$3,$5,'Other cycle')",
    [ids.cycle, ids.otherCycle, ids.workspace, ids.project, ids.otherProject]
  );
  await db.query(
    "insert into op_labels(id,workspace_id,project_id,name) values($1,$3,$4,'Label'),($2,$3,$5,'Other label')",
    [ids.label, ids.otherLabel, ids.workspace, ids.project, ids.otherProject]
  );
  await db.query(
    "insert into op_modules(id,workspace_id,project_id,name) values($1,$3,$4,'Module'),($2,$3,$5,'Other module')",
    [ids.module, ids.otherModule, ids.workspace, ids.project, ids.otherProject]
  );
  await db.query("insert into op_project_members(project_id,member_key) values($1,'assignee')", [ids.project]);
  await db.query(
    `insert into op_issues(id,workspace_id,project_id,sequence_id,name,state_id,created_by,updated_by,parent_id) values
      ($1,$3,$4,1,'Parent',$5,'creator','creator',null),
      ($2,$3,$4,2,'Child',$5,'creator','creator',$1)`,
    [ids.parent, ids.child, ids.workspace, ids.project, ids.open]
  );
  await db.query("insert into op_issue_assignees(issue_id,assignee_key) values($1,'assignee')", [ids.parent]);

  await db.exec(fs.readFileSync(`${repo}/supabase/migrations/20261016165442_operations_issue_actions.sql`, "utf8"));
  checks.push("Migration compiles against the captured Operations schema");

  await user(null, "anon");
  await error("Anonymous capabilities are denied", () => rpc("get_operation_issue_capabilities", [ids.parent]), /permission denied/);
  await error("Anonymous sequence claims are denied", () => rpc("op_claim_issue_sequence", [ids.project]), /permission denied/);

  await user("inactive");
  await error("Inactive staff are denied", () => rpc("get_operation_issue_capabilities", [ids.parent]), /active staff profile/);

  await user("outsider");
  const outsiderCapabilities = await rpc("get_operation_issue_capabilities", [ids.parent]);
  assert.equal(outsiderCapabilities.can_edit, false);
  assert.equal(outsiderCapabilities.can_archive, false);
  checks.push("Unrelated staff receive read-only capabilities");
  const initialVersion = await scalar("select updated_at as value from op_issues where id=$1", [ids.parent]);
  await error(
    "Unrelated staff cannot edit",
    () => rpc("update_operation_issue", [ids.parent, initialVersion, { name: "Blocked" }]),
    /do not have permission/
  );
  await error(
    "Unrelated staff cannot archive",
    () => rpc("archive_operation_issue", [ids.parent, initialVersion]),
    /Only Management or the creator/
  );

  await user("assignee");
  const assigneeCapabilities = await rpc("get_operation_issue_capabilities", [ids.parent]);
  assert.equal(assigneeCapabilities.can_edit, true);
  assert.equal(assigneeCapabilities.can_manage_assignments, false);
  checks.push("Assigned project staff can edit but cannot manage assignees");
  await error(
    "Staff cannot change assignees",
    () => rpc("update_operation_issue", [ids.parent, initialVersion, { assignee_ids: ["creator"] }]),
    /Only Management can change assignees/
  );
  const staffUpdate = await rpc("update_operation_issue", [ids.parent, initialVersion, { name: "Updated by staff", priority: "high" }]);
  assert.equal(staffUpdate.name, "Updated by staff");
  assert.equal(staffUpdate.priority, "high");
  checks.push("Assigned staff can update ordinary work-item fields");
  await error(
    "Stale updates are rejected",
    () => rpc("update_operation_issue", [ids.parent, initialVersion, { name: "Stale" }]),
    /changed after you opened it/
  );

  await user("manager");
  let version = await scalar("select updated_at as value from op_issues where id=$1", [ids.parent]);
  await error(
    "Cross-project references are rejected atomically",
    () => rpc("update_operation_issue", [ids.parent, version, { state_id: ids.otherState, label_ids: [ids.otherLabel] }]),
    /state from this project/
  );
  assert.equal(await scalar("select state_id::text as value from op_issues where id=$1", [ids.parent]), ids.open);
  assert.equal(await scalar("select count(*)::int as value from op_issue_labels where issue_id=$1", [ids.parent]), 0);
  checks.push("Rejected reference updates leave the issue and joins unchanged");
  await error(
    "Invalid date ranges are rejected",
    () => rpc("update_operation_issue", [ids.parent, version, { start_date: "2026-10-20", target_date: "2026-10-19" }]),
    /Start date cannot be after due date/
  );
  await error(
    "Parent cycles are rejected",
    () => rpc("update_operation_issue", [ids.parent, version, { parent_id: ids.child }]),
    /create a work-item cycle/
  );
  const managerUpdate = await rpc("update_operation_issue", [
    ids.parent,
    version,
    {
      state_id: ids.done,
      cycle_id: ids.cycle,
      assignee_ids: ["assignee", "creator", "assignee"],
      label_ids: [ids.label],
      module_ids: [ids.module],
    },
  ]);
  assert.ok(managerUpdate.completed_at);
  assert.equal(await scalar("select count(*)::int as value from op_issue_assignees where issue_id=$1", [ids.parent]), 2);
  assert.equal(await scalar("select count(*)::int as value from op_issue_labels where issue_id=$1", [ids.parent]), 1);
  assert.equal(await scalar("select count(*)::int as value from op_issue_modules where issue_id=$1", [ids.parent]), 1);
  checks.push("Management updates validated joins atomically and completion is recorded");
  version = managerUpdate.updated_at;
  const reopened = await rpc("update_operation_issue", [ids.parent, version, { state_id: ids.open }]);
  assert.equal(reopened.completed_at, null);
  checks.push("Reopening clears the completion timestamp");

  await error(
    "Active sub-items block archival",
    () => rpc("archive_operation_issue", [ids.parent, reopened.updated_at]),
    /active sub-items first/
  );
  const childVersion = await scalar("select updated_at as value from op_issues where id=$1", [ids.child]);
  await rpc("archive_operation_issue", [ids.child, childVersion]);
  const archived = await rpc("archive_operation_issue", [ids.parent, reopened.updated_at]);
  assert.ok(archived.archived_at);
  assert.equal(await scalar("select count(*)::int as value from op_issues where id=$1", [ids.parent]), 1);
  checks.push("Delete is recoverable archival and preserves the row");
  const restored = await rpc("restore_operation_issue", [ids.parent]);
  assert.equal(restored.archived_at, null);
  checks.push("Management can restore an archived work item");

  await user("creator");
  const creatorCapabilities = await rpc("get_operation_issue_capabilities", [ids.parent]);
  assert.equal(creatorCapabilities.can_archive, true);
  checks.push("The creator receives archive capability");

  await user("manager", "postgres");
  assert.ok((await scalar("select count(*)::int as value from op_issue_activity where issue_id=$1", [ids.parent])) >= 6);
  checks.push("Edits, assignment changes, archive, and restore write audit evidence");

  console.log(`operations-issue-actions QA passed (${checks.length} checks)`);
  for (const check of checks) console.log(`- ${check}`);
} finally {
  await db.close();
}

