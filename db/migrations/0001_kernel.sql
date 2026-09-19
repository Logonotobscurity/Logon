-- LOG_ON OS System 0: durable execution kernel
-- PostgreSQL is the authoritative state store.

create table if not exists logon_tenants (
  tenant_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists logon_executions (
  execution_id text primary key,
  tenant_id text not null references logon_tenants(tenant_id),
  actor_id text not null,
  agent_id text not null,
  agent_version text not null,
  objective text not null,
  status text not null,
  request_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_logon_executions_tenant
  on logon_executions(tenant_id, created_at desc);

create table if not exists logon_execution_events (
  execution_id text not null references logon_executions(execution_id),
  sequence bigint not null,
  status text not null,
  event_type text not null,
  actor_id text not null,
  payload_json jsonb not null,
  created_at timestamptz not null,
  primary key (execution_id, sequence)
);

create table if not exists logon_tool_permissions (
  tenant_id text not null references logon_tenants(tenant_id),
  agent_id text not null,
  tool_id text not null,
  permission text not null,
  allowed boolean not null default false,
  expires_at timestamptz,
  primary key (tenant_id, agent_id, tool_id, permission)
);

create table if not exists logon_approvals (
  approval_id text primary key,
  execution_id text not null references logon_executions(execution_id),
  tenant_id text not null references logon_tenants(tenant_id),
  requested_by text not null,
  status text not null,
  reason text not null,
  decided_by text,
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists logon_evidence (
  evidence_id text primary key,
  execution_id text not null references logon_executions(execution_id),
  tenant_id text not null references logon_tenants(tenant_id),
  kind text not null,
  source text not null,
  payload_hash text not null,
  payload_json jsonb,
  created_at timestamptz not null
);

create table if not exists logon_audit (
  audit_id text primary key,
  execution_id text not null references logon_executions(execution_id),
  tenant_id text not null references logon_tenants(tenant_id),
  action text not null,
  actor_id text not null,
  allowed boolean not null,
  reason text not null,
  created_at timestamptz not null
);

create table if not exists logon_idempotency (
  tenant_id text not null references logon_tenants(tenant_id),
  idempotency_key text not null,
  execution_id text not null references logon_executions(execution_id),
  request_hash text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key)
);
