-- LOG_ON OS System 0: approval expiry sweep support

create index if not exists idx_logon_approvals_pending_expiry
  on logon_approvals (expires_at)
  where status = 'PENDING' and expires_at is not null;
