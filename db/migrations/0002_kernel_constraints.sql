-- LOG_ON OS System 0: durable domain constraints

alter table logon_executions
  add constraint logon_executions_status_check
  check (status in (
    'INTAKE','CONTEXT','POLICY_CHECK','PLANNING','TOOL_PERMISSION_CHECK',
    'ACTION','VALIDATION','APPROVAL','EXECUTION','EVIDENCE','OUTCOME',
    'EVALUATION','LEARNING','FAILED','REJECTED'
  ));

alter table logon_execution_events
  add constraint logon_execution_events_status_check
  check (status in (
    'INTAKE','CONTEXT','POLICY_CHECK','PLANNING','TOOL_PERMISSION_CHECK',
    'ACTION','VALIDATION','APPROVAL','EXECUTION','EVIDENCE','OUTCOME',
    'EVALUATION','LEARNING','FAILED','REJECTED'
  ));

alter table logon_approvals
  add constraint logon_approvals_status_check
  check (status in ('PENDING','APPROVED','REJECTED','EXPIRED'));

alter table logon_evidence
  add constraint logon_evidence_kind_check
  check (kind in ('INPUT','TOOL_RESULT','VALIDATION','APPROVAL','OUTPUT','ERROR'));

create index if not exists idx_logon_execution_events_created
  on logon_execution_events(execution_id, created_at desc);
