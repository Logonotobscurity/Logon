-- LOG_ON OS System 0: bind approval tenant/execution ownership at the database boundary

alter table logon_executions
  add constraint logon_executions_execution_tenant_unique
  unique (execution_id, tenant_id);

alter table logon_approvals
  add constraint logon_approvals_execution_tenant_fk
  foreign key (execution_id, tenant_id)
  references logon_executions (execution_id, tenant_id);
