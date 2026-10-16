-- Isolated synthetic QA schema, captured from V2 catalog 2026-10-16; no business rows.
create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
create table public.leads(id uuid primary key);
create table public.site_visits(id uuid primary key);
create table public.op_cycles (
  "id" uuid default uuid_generate_v4() not null,
  "workspace_id" uuid not null,
  "project_id" uuid not null,
  "name" text not null,
  "description" text,
  "start_date" date,
  "end_date" date,
  "owned_by_key" text,
  "sort_order" numeric default 0 not null,
  "archived_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_issue_activity (
  "id" uuid default uuid_generate_v4() not null,
  "issue_id" uuid not null,
  "actor_key" text,
  "verb" text not null,
  "field" text,
  "old_value" text,
  "new_value" text,
  "comment" text,
  "created_at" timestamp with time zone default now() not null
);
create table public.op_issue_assignees (
  "issue_id" uuid not null,
  "assignee_key" text not null
);
create table public.op_issue_attachments (
  "id" uuid default uuid_generate_v4() not null,
  "issue_id" uuid not null,
  "asset_url" text not null,
  "file_name" text,
  "file_size" bigint,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null
);
create table public.op_issue_comments (
  "id" uuid default uuid_generate_v4() not null,
  "issue_id" uuid not null,
  "comment_html" text not null,
  "actor_key" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_issue_labels (
  "issue_id" uuid not null,
  "label_id" uuid not null
);
create table public.op_issue_links (
  "id" uuid default uuid_generate_v4() not null,
  "issue_id" uuid not null,
  "title" text,
  "url" text not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null
);
create table public.op_issue_modules (
  "issue_id" uuid not null,
  "module_id" uuid not null
);
create table public.op_issue_relations (
  "id" uuid default uuid_generate_v4() not null,
  "issue_id" uuid not null,
  "related_issue_id" uuid not null,
  "relation_type" text not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.op_issues (
  "id" uuid default uuid_generate_v4() not null,
  "workspace_id" uuid not null,
  "project_id" uuid not null,
  "sequence_id" integer not null,
  "name" text not null,
  "description_html" text,
  "state_id" uuid,
  "priority" text default 'none'::text not null,
  "parent_id" uuid,
  "cycle_id" uuid,
  "sort_order" numeric default 0 not null,
  "start_date" date,
  "target_date" date,
  "completed_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "is_draft" boolean default false not null,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_labels (
  "id" uuid default uuid_generate_v4() not null,
  "workspace_id" uuid not null,
  "project_id" uuid not null,
  "name" text not null,
  "color" text default '#60646C'::text not null,
  "parent_id" uuid,
  "sort_order" numeric default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_module_members (
  "module_id" uuid not null,
  "member_key" text not null
);
create table public.op_modules (
  "id" uuid default uuid_generate_v4() not null,
  "workspace_id" uuid not null,
  "project_id" uuid not null,
  "name" text not null,
  "description" text,
  "description_html" text,
  "lead_key" text,
  "status" text default 'planned'::text not null,
  "start_date" date,
  "target_date" date,
  "sort_order" numeric default 0 not null,
  "archived_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_project_members (
  "project_id" uuid not null,
  "member_key" text not null,
  "role" smallint default 15 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public.op_projects (
  "id" uuid default uuid_generate_v4() not null,
  "workspace_id" uuid not null,
  "name" text not null,
  "identifier" text not null,
  "description" text,
  "logo_props" jsonb,
  "cover_image" text,
  "network" smallint default 2 not null,
  "project_lead_key" text,
  "default_assignee_key" text,
  "default_state_id" uuid,
  "cycle_view" boolean default true not null,
  "module_view" boolean default true not null,
  "issue_views_view" boolean default true not null,
  "page_view" boolean default false not null,
  "inbox_view" boolean default false not null,
  "archived_at" timestamp with time zone,
  "next_work_item_sequence" integer default 1 not null,
  "sort_order" numeric,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_states (
  "id" uuid default uuid_generate_v4() not null,
  "workspace_id" uuid not null,
  "project_id" uuid not null,
  "name" text not null,
  "color" text default '#60646C'::text not null,
  "description" text,
  "group" text not null,
  "default" boolean default false not null,
  "sequence" numeric default 0 not null,
  "order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_todos (
  "id" uuid default uuid_generate_v4() not null,
  "owner_key" text not null,
  "owner_name" text not null,
  "assigned_to" text not null,
  "assigned_to_name" text not null,
  "assigned_by" text not null,
  "assigned_by_name" text not null,
  "title" text not null,
  "notes" text,
  "contact" text,
  "item_date" date not null,
  "start_time" time without time zone,
  "end_time" time without time zone,
  "status" text default 'open'::text not null,
  "rescheduled_to_id" uuid,
  "escalated_to" text,
  "escalated_to_name" text,
  "escalated_by" text,
  "escalated_by_name" text,
  "escalated_at" timestamp with time zone,
  "escalation_note" text,
  "recurs_freq" text,
  "recurs_interval" integer,
  "recurs_until" date,
  "recurs_parent_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "sms_notified_at" timestamp with time zone
);
create table public.op_views (
  "id" uuid default uuid_generate_v4() not null,
  "workspace_id" uuid not null,
  "project_id" uuid not null,
  "name" text not null,
  "query" jsonb default '{}'::jsonb not null,
  "created_by" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.op_workspaces (
  "id" uuid default uuid_generate_v4() not null,
  "name" text not null,
  "slug" text not null,
  "logo_url" text,
  "organization_size" text,
  "timezone" text default 'Africa/Accra'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public.schedule_item_attachments (
  "id" uuid default gen_random_uuid() not null,
  "schedule_item_id" uuid not null,
  "file_name" text not null,
  "storage_path" text not null,
  "content_type" text,
  "uploaded_by" text,
  "uploaded_by_name" text,
  "created_at" timestamp with time zone default now() not null
);
create table public.schedule_item_invitees (
  "id" uuid default gen_random_uuid() not null,
  "schedule_item_id" uuid not null,
  "staff_key" text not null,
  "staff_name" text,
  "status" text default 'invited'::text not null,
  "responded_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);
create table public.schedule_items (
  "id" uuid default gen_random_uuid() not null,
  "kind" text not null,
  "owner_key" text not null,
  "owner_name" text,
  "title" text not null,
  "description" text,
  "notes" text,
  "contact" text,
  "category" text default 'General'::text not null,
  "priority" text default 'Medium'::text not null,
  "assigned_to" text,
  "assigned_to_name" text,
  "assigned_by" text,
  "assigned_by_name" text,
  "status" text default 'open'::text not null,
  "due_date" date,
  "item_date" date,
  "start_time" time without time zone,
  "end_time" time without time zone,
  "rescheduled_to_id" uuid,
  "escalated_to" text,
  "escalated_to_name" text,
  "escalated_by" text,
  "escalated_by_name" text,
  "escalated_at" timestamp with time zone,
  "escalation_note" text,
  "created_at" timestamp with time zone default now() not null,
  "opened_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "push_notified_at" timestamp with time zone,
  "recurs_freq" text,
  "recurs_interval" integer,
  "recurs_until" date,
  "recurs_parent_id" uuid,
  "linked_lead_id" uuid,
  "linked_site_visit_id" uuid,
  "blocked_by_id" uuid,
  "meeting_location" text,
  "tags" text[] default '{}'::text[] not null
);
create table public.task_events (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "type" text not null,
  "actor_key" text,
  "actor_name" text,
  "from_key" text,
  "from_name" text,
  "to_key" text,
  "to_name" text,
  "note" text,
  "created_at" timestamp with time zone default now() not null
);

alter table public.op_cycles add constraint op_cycles_pkey PRIMARY KEY (id);
alter table public.op_issue_activity add constraint op_issue_activity_pkey PRIMARY KEY (id);
alter table public.op_issue_assignees add constraint op_issue_assignees_pkey PRIMARY KEY (issue_id, assignee_key);
alter table public.op_issue_attachments add constraint op_issue_attachments_pkey PRIMARY KEY (id);
alter table public.op_issue_comments add constraint op_issue_comments_pkey PRIMARY KEY (id);
alter table public.op_issue_labels add constraint op_issue_labels_pkey PRIMARY KEY (issue_id, label_id);
alter table public.op_issue_links add constraint op_issue_links_pkey PRIMARY KEY (id);
alter table public.op_issue_modules add constraint op_issue_modules_pkey PRIMARY KEY (issue_id, module_id);
alter table public.op_issue_relations add constraint op_issue_relations_pkey PRIMARY KEY (id);
alter table public.op_issues add constraint op_issues_pkey PRIMARY KEY (id);
alter table public.op_issues add constraint op_issues_project_id_sequence_id_key UNIQUE (project_id, sequence_id);
alter table public.op_labels add constraint op_labels_pkey PRIMARY KEY (id);
alter table public.op_module_members add constraint op_module_members_pkey PRIMARY KEY (module_id, member_key);
alter table public.op_modules add constraint op_modules_pkey PRIMARY KEY (id);
alter table public.op_project_members add constraint op_project_members_pkey PRIMARY KEY (project_id, member_key);
alter table public.op_projects add constraint op_projects_pkey PRIMARY KEY (id);
alter table public.op_projects add constraint op_projects_workspace_id_identifier_key UNIQUE (workspace_id, identifier);
alter table public.op_states add constraint op_states_pkey PRIMARY KEY (id);
alter table public.op_todos add constraint op_todos_pkey PRIMARY KEY (id);
alter table public.op_views add constraint op_views_pkey PRIMARY KEY (id);
alter table public.op_workspaces add constraint op_workspaces_pkey PRIMARY KEY (id);
alter table public.op_workspaces add constraint op_workspaces_slug_key UNIQUE (slug);
alter table public.schedule_item_attachments add constraint schedule_item_attachments_pkey PRIMARY KEY (id);
alter table public.schedule_item_invitees add constraint schedule_item_invitees_pkey PRIMARY KEY (id);
alter table public.schedule_item_invitees add constraint schedule_item_invitees_schedule_item_id_staff_key_key UNIQUE (schedule_item_id, staff_key);
alter table public.schedule_items add constraint schedule_items_pkey PRIMARY KEY (id);
alter table public.task_events add constraint task_events_pkey PRIMARY KEY (id);
alter table public.op_cycles add constraint op_cycles_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(agent_key);
alter table public.op_cycles add constraint op_cycles_owned_by_key_fkey FOREIGN KEY (owned_by_key) REFERENCES profiles(agent_key);
alter table public.op_cycles add constraint op_cycles_project_id_fkey FOREIGN KEY (project_id) REFERENCES op_projects(id) ON DELETE CASCADE;
alter table public.op_cycles add constraint op_cycles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES op_workspaces(id) ON DELETE CASCADE;
alter table public.op_issue_activity add constraint op_issue_activity_actor_key_fkey FOREIGN KEY (actor_key) REFERENCES profiles(agent_key);
alter table public.op_issue_activity add constraint op_issue_activity_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_assignees add constraint op_issue_assignees_assignee_key_fkey FOREIGN KEY (assignee_key) REFERENCES profiles(agent_key);
alter table public.op_issue_assignees add constraint op_issue_assignees_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_attachments add constraint op_issue_attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(agent_key);
alter table public.op_issue_attachments add constraint op_issue_attachments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_comments add constraint op_issue_comments_actor_key_fkey FOREIGN KEY (actor_key) REFERENCES profiles(agent_key);
alter table public.op_issue_comments add constraint op_issue_comments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_labels add constraint op_issue_labels_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_labels add constraint op_issue_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES op_labels(id) ON DELETE CASCADE;
alter table public.op_issue_links add constraint op_issue_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(agent_key);
alter table public.op_issue_links add constraint op_issue_links_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_modules add constraint op_issue_modules_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_modules add constraint op_issue_modules_module_id_fkey FOREIGN KEY (module_id) REFERENCES op_modules(id) ON DELETE CASCADE;
alter table public.op_issue_relations add constraint op_issue_relations_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_relations add constraint op_issue_relations_related_issue_id_fkey FOREIGN KEY (related_issue_id) REFERENCES op_issues(id) ON DELETE CASCADE;
alter table public.op_issue_relations add constraint op_issue_relations_relation_type_check CHECK ((relation_type = ANY (ARRAY['blocking'::text, 'blocked_by'::text, 'duplicate'::text, 'relates_to'::text])));
alter table public.op_issues add constraint op_issues_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(agent_key);
alter table public.op_issues add constraint op_issues_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES op_cycles(id);
alter table public.op_issues add constraint op_issues_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES op_issues(id);
alter table public.op_issues add constraint op_issues_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'medium'::text, 'low'::text, 'none'::text])));
alter table public.op_issues add constraint op_issues_project_id_fkey FOREIGN KEY (project_id) REFERENCES op_projects(id) ON DELETE CASCADE;
alter table public.op_issues add constraint op_issues_state_id_fkey FOREIGN KEY (state_id) REFERENCES op_states(id);
alter table public.op_issues add constraint op_issues_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(agent_key);
alter table public.op_issues add constraint op_issues_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES op_workspaces(id) ON DELETE CASCADE;
alter table public.op_labels add constraint op_labels_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES op_labels(id);
alter table public.op_labels add constraint op_labels_project_id_fkey FOREIGN KEY (project_id) REFERENCES op_projects(id) ON DELETE CASCADE;
alter table public.op_labels add constraint op_labels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES op_workspaces(id) ON DELETE CASCADE;
alter table public.op_module_members add constraint op_module_members_member_key_fkey FOREIGN KEY (member_key) REFERENCES profiles(agent_key);
alter table public.op_module_members add constraint op_module_members_module_id_fkey FOREIGN KEY (module_id) REFERENCES op_modules(id) ON DELETE CASCADE;
alter table public.op_modules add constraint op_modules_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(agent_key);
alter table public.op_modules add constraint op_modules_lead_key_fkey FOREIGN KEY (lead_key) REFERENCES profiles(agent_key);
alter table public.op_modules add constraint op_modules_project_id_fkey FOREIGN KEY (project_id) REFERENCES op_projects(id) ON DELETE CASCADE;
alter table public.op_modules add constraint op_modules_status_check CHECK ((status = ANY (ARRAY['backlog'::text, 'planned'::text, 'in-progress'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])));
alter table public.op_modules add constraint op_modules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES op_workspaces(id) ON DELETE CASCADE;
alter table public.op_project_members add constraint op_project_members_member_key_fkey FOREIGN KEY (member_key) REFERENCES profiles(agent_key);
alter table public.op_project_members add constraint op_project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES op_projects(id) ON DELETE CASCADE;
alter table public.op_projects add constraint op_projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(agent_key);
alter table public.op_projects add constraint op_projects_default_assignee_key_fkey FOREIGN KEY (default_assignee_key) REFERENCES profiles(agent_key);
alter table public.op_projects add constraint op_projects_default_state_fk FOREIGN KEY (default_state_id) REFERENCES op_states(id);
alter table public.op_projects add constraint op_projects_project_lead_key_fkey FOREIGN KEY (project_lead_key) REFERENCES profiles(agent_key);
alter table public.op_projects add constraint op_projects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(agent_key);
alter table public.op_projects add constraint op_projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES op_workspaces(id) ON DELETE CASCADE;
alter table public.op_states add constraint op_states_group_check CHECK (("group" = ANY (ARRAY['backlog'::text, 'unstarted'::text, 'started'::text, 'completed'::text, 'cancelled'::text])));
alter table public.op_states add constraint op_states_project_id_fkey FOREIGN KEY (project_id) REFERENCES op_projects(id) ON DELETE CASCADE;
alter table public.op_states add constraint op_states_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES op_workspaces(id) ON DELETE CASCADE;
alter table public.op_todos add constraint op_todos_recurs_freq_check CHECK (((recurs_freq = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])) OR (recurs_freq IS NULL)));
alter table public.op_todos add constraint op_todos_recurs_parent_id_fkey FOREIGN KEY (recurs_parent_id) REFERENCES op_todos(id);
alter table public.op_todos add constraint op_todos_rescheduled_to_id_fkey FOREIGN KEY (rescheduled_to_id) REFERENCES op_todos(id);
alter table public.op_todos add constraint op_todos_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'cancelled'::text, 'rescheduled'::text])));
alter table public.op_views add constraint op_views_project_id_fkey FOREIGN KEY (project_id) REFERENCES op_projects(id) ON DELETE CASCADE;
alter table public.op_views add constraint op_views_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES op_workspaces(id) ON DELETE CASCADE;
alter table public.schedule_item_attachments add constraint schedule_item_attachments_schedule_item_id_fkey FOREIGN KEY (schedule_item_id) REFERENCES schedule_items(id) ON DELETE CASCADE;
alter table public.schedule_item_invitees add constraint schedule_item_invitees_schedule_item_id_fkey FOREIGN KEY (schedule_item_id) REFERENCES schedule_items(id) ON DELETE CASCADE;
alter table public.schedule_item_invitees add constraint schedule_item_invitees_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text])));
alter table public.schedule_items add constraint schedule_items_blocked_by_id_fkey FOREIGN KEY (blocked_by_id) REFERENCES schedule_items(id) ON DELETE SET NULL;
alter table public.schedule_items add constraint schedule_items_kind_check CHECK ((kind = ANY (ARRAY['task'::text, 'todo'::text, 'meeting'::text])));
alter table public.schedule_items add constraint schedule_items_linked_lead_id_fkey FOREIGN KEY (linked_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
alter table public.schedule_items add constraint schedule_items_linked_site_visit_id_fkey FOREIGN KEY (linked_site_visit_id) REFERENCES site_visits(id) ON DELETE SET NULL;
alter table public.schedule_items add constraint schedule_items_recurs_freq_check CHECK ((recurs_freq = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])));
alter table public.schedule_items add constraint schedule_items_recurs_parent_id_fkey FOREIGN KEY (recurs_parent_id) REFERENCES schedule_items(id);
alter table public.schedule_items add constraint schedule_items_rescheduled_to_id_fkey FOREIGN KEY (rescheduled_to_id) REFERENCES schedule_items(id);
alter table public.schedule_items add constraint schedule_items_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text, 'rescheduled'::text, 'blocked'::text, 'awaiting_approval'::text])));
alter table public.task_events add constraint task_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES schedule_items(id);
