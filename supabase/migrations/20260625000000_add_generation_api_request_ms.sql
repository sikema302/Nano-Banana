alter table public.generations
  add column if not exists api_request_ms integer not null default 0;
