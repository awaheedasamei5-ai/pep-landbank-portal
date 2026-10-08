-- DRAFT, NOT APPLIED. Operations Tracker (plane port) Supabase schema replica.
-- Target: sbydzrlzqxcdbudjaube (the real production project palmstead-v2-shell
-- and web-next both run against). This is shared production infrastructure --
-- surfaced here for sign-off before any `apply_migration` call, same standard
-- already applied to the open Attendance/Leave schema question.
--
-- Field shapes grounded in the real copied types (src/openplane/types/), not
-- guessed: workspace.ts, project/projects.ts, issues/issue.ts, issues.ts
-- (labels/activity), cycle/cycle.ts, module/modules.ts, state.ts.
--
-- Adapted, not copied 1:1, per the user's own two-phase instruction (raw
-- duplicate first, "twist to fit" second) -- but the ONE adaptation made
-- already, here in the raw-duplicate schema itself, is structural: Palmstead
-- is a single company, not plane's multi-tenant SaaS, so `workspaces` is kept
-- (plane's own code everywhere expects a workspace_id) but seeded with
-- exactly one row, and workspace billing/invite/OAuth tables are dropped
-- rather than built out as dead machinery nobody will use. Every entity
-- plane's own UI actually renders (projects, states, labels, issues + their
-- relations/links/attachments/activity, cycles, modules) is kept in full.

create extension if not exists "uuid-ossp";

-- Single row. id is a fixed constant the app code can reference directly
-- (see src/openplane/context's real org id) instead of looking it up.
create table public.op_workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  logo_url text,
  organization_size text,
  timezone text not null default 'Africa/Accra',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.op_projects (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.op_workspaces(id) on delete cascade,
  name text not null,
  identifier text not null, -- short prefix, e.g. "OPS" -> issue OPS-123
  description text,
  logo_props jsonb,
  cover_image text,
  network smallint not null default 2, -- 0=secret,1=private,2=public (within company)
  project_lead_key text references public.profiles(agent_key),
  default_assignee_key text references public.profiles(agent_key),
  default_state_id uuid, -- fk added after op_states exists
  cycle_view boolean not null default true,
  module_view boolean not null default true,
  issue_views_view boolean not null default true,
  page_view boolean not null default false,
  inbox_view boolean not null default false,
  archived_at timestamptz,
  next_work_item_sequence integer not null default 1,
  sort_order numeric,
  created_by text references public.profiles(agent_key),
  updated_by text references public.profiles(agent_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, identifier)
);

-- Who's on which project -- plane's own project-level membership/role model
-- (EUserProjectRoles: ADMIN=20, MEMBER=15, GUEST=5), mapped onto Palmstead's
-- real staff via profiles.key rather than a separate members table.
create table public.op_project_members (
  project_id uuid not null references public.op_projects(id) on delete cascade,
  member_key text not null references public.profiles(agent_key),
  role smallint not null default 15,
  created_at timestamptz not null default now(),
  primary key (project_id, member_key)
);

create table public.op_states (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.op_workspaces(id) on delete cascade,
  project_id uuid not null references public.op_projects(id) on delete cascade,
  name text not null,
  color text not null default '#60646C',
  description text,
  "group" text not null check ("group" in ('backlog','unstarted','started','completed','cancelled')),
  "default" boolean not null default false,
  sequence numeric not null default 0,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.op_projects
  add constraint op_projects_default_state_fk foreign key (default_state_id) references public.op_states(id);

create table public.op_labels (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.op_workspaces(id) on delete cascade,
  project_id uuid not null references public.op_projects(id) on delete cascade,
  name text not null,
  color text not null default '#60646C',
  parent_id uuid references public.op_labels(id),
  sort_order numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.op_cycles (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.op_workspaces(id) on delete cascade,
  project_id uuid not null references public.op_projects(id) on delete cascade,
  name text not null,
  description text,
  start_date date,
  end_date date,
  owned_by_key text references public.profiles(agent_key),
  sort_order numeric not null default 0,
  archived_at timestamptz,
  created_by text references public.profiles(agent_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.op_modules (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.op_workspaces(id) on delete cascade,
  project_id uuid not null references public.op_projects(id) on delete cascade,
  name text not null,
  description text,
  description_html text,
  lead_key text references public.profiles(agent_key),
  status text not null default 'planned'
    check (status in ('backlog','planned','in-progress','paused','completed','cancelled')),
  start_date date,
  target_date date,
  sort_order numeric not null default 0,
  archived_at timestamptz,
  created_by text references public.profiles(agent_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.op_module_members (
  module_id uuid not null references public.op_modules(id) on delete cascade,
  member_key text not null references public.profiles(agent_key),
  primary key (module_id, member_key)
);

-- The core entity. sequence_id is per-project (OPS-1, OPS-2, ...), assigned
-- via op_projects.next_work_item_sequence on insert (app-layer, same as
-- plane's own backend does it, not a DB sequence shared across projects).
create table public.op_issues (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.op_workspaces(id) on delete cascade,
  project_id uuid not null references public.op_projects(id) on delete cascade,
  sequence_id integer not null,
  name text not null,
  description_html text,
  state_id uuid references public.op_states(id),
  priority text not null default 'none' check (priority in ('urgent','high','medium','low','none')),
  parent_id uuid references public.op_issues(id),
  cycle_id uuid references public.op_cycles(id),
  sort_order numeric not null default 0,
  start_date date,
  target_date date,
  completed_at timestamptz,
  archived_at timestamptz,
  is_draft boolean not null default false,
  created_by text references public.profiles(agent_key),
  updated_by text references public.profiles(agent_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, sequence_id)
);

create table public.op_issue_assignees (
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  assignee_key text not null references public.profiles(agent_key),
  primary key (issue_id, assignee_key)
);

create table public.op_issue_labels (
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  label_id uuid not null references public.op_labels(id) on delete cascade,
  primary key (issue_id, label_id)
);

create table public.op_issue_modules (
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  module_id uuid not null references public.op_modules(id) on delete cascade,
  primary key (issue_id, module_id)
);

create table public.op_issue_relations (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  related_issue_id uuid not null references public.op_issues(id) on delete cascade,
  relation_type text not null
    check (relation_type in ('blocking','blocked_by','duplicate','relates_to')),
  created_at timestamptz not null default now()
);

create table public.op_issue_links (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  title text,
  url text not null,
  created_by text references public.profiles(agent_key),
  created_at timestamptz not null default now()
);

create table public.op_issue_attachments (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  asset_url text not null,
  file_name text,
  file_size bigint,
  created_by text references public.profiles(agent_key),
  created_at timestamptz not null default now()
);

create table public.op_issue_comments (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  comment_html text not null,
  actor_key text references public.profiles(agent_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Real activity audit trail (who changed what field, old -> new), mirrors
-- plane's own IIssueActivity shape closely since it's genuinely useful as-is.
create table public.op_issue_activity (
  id uuid primary key default uuid_generate_v4(),
  issue_id uuid not null references public.op_issues(id) on delete cascade,
  actor_key text references public.profiles(agent_key),
  verb text not null, -- 'created' | 'updated' | 'deleted' | ...
  field text, -- 'state' | 'priority' | 'assignees' | ... | null for 'created'
  old_value text,
  new_value text,
  comment text,
  created_at timestamptz not null default now()
);

create index op_issues_project_idx on public.op_issues(project_id);
create index op_issues_state_idx on public.op_issues(state_id);
create index op_issues_cycle_idx on public.op_issues(cycle_id);
create index op_issues_parent_idx on public.op_issues(parent_id);
create index op_issue_activity_issue_idx on public.op_issue_activity(issue_id);

-- RLS: every table company-wide readable/writable by any signed-in staff
-- member (same posture as the rest of this project's real tables -- no
-- per-project privacy tier is being built in this raw-duplicate phase;
-- op_projects.network exists in the schema for a later "twist to fit" pass
-- if Palmstead actually wants private projects, but isn't enforced yet).
alter table public.op_workspaces enable row level security;
alter table public.op_projects enable row level security;
alter table public.op_project_members enable row level security;
alter table public.op_states enable row level security;
alter table public.op_labels enable row level security;
alter table public.op_cycles enable row level security;
alter table public.op_modules enable row level security;
alter table public.op_module_members enable row level security;
alter table public.op_issues enable row level security;
alter table public.op_issue_assignees enable row level security;
alter table public.op_issue_labels enable row level security;
alter table public.op_issue_modules enable row level security;
alter table public.op_issue_relations enable row level security;
alter table public.op_issue_links enable row level security;
alter table public.op_issue_attachments enable row level security;
alter table public.op_issue_comments enable row level security;
alter table public.op_issue_activity enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'op_workspaces','op_projects','op_project_members','op_states','op_labels',
    'op_cycles','op_modules','op_module_members','op_issues','op_issue_assignees',
    'op_issue_labels','op_issue_modules','op_issue_relations','op_issue_links',
    'op_issue_attachments','op_issue_comments','op_issue_activity'
  ])
  loop
    execute format(
      'create policy %I_all on public.%I for all using (my_key() is not null) with check (my_key() is not null);',
      t, t
    );
  end loop;
end $$;

-- Realtime: add every table to supabase_realtime so client subscriptions
-- actually receive postgres_changes events -- per the standing lesson from
-- memory realtime-publication-membership (a table missing from this
-- publication is the single most common cause of "realtime looks wired but
-- nothing updates").
alter publication supabase_realtime add table public.op_projects;
alter publication supabase_realtime add table public.op_states;
alter publication supabase_realtime add table public.op_labels;
alter publication supabase_realtime add table public.op_cycles;
alter publication supabase_realtime add table public.op_modules;
alter publication supabase_realtime add table public.op_issues;
alter publication supabase_realtime add table public.op_issue_assignees;
alter publication supabase_realtime add table public.op_issue_labels;
alter publication supabase_realtime add table public.op_issue_comments;
alter publication supabase_realtime add table public.op_issue_activity;

-- Seed: Palmstead's one real workspace + one real project to start building
-- the UI against (replace with the user's actual preferred name before
-- applying -- placeholder here, not a guess meant to ship as-is).
insert into public.op_workspaces (name, slug, timezone)
values ('Palmstead', 'palmstead', 'Africa/Accra');
