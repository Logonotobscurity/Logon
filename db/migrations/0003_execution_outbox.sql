-- LOG_ON OS System 0: transactional execution dispatch outbox

create table if not exists logon_execution_dispatches (
  execution_id text primary key references logon_executions(execution_id),
  queue_name text not null,
  status text not null default 'PENDING',
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  constraint logon_execution_dispatches_status_check
    check (status in ('PENDING','PROCESSING','DISPATCHED'))
);

create index if not exists idx_logon_execution_dispatches_ready
  on logon_execution_dispatches(status, locked_until, created_at);
