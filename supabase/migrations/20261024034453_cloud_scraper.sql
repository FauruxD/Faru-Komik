-- Durable cloud scraper control, fenced leases, and atomic checkpoints.
create table public.scrape_jobs (
  id text primary key check (id = 'shinigami'),
  enabled boolean not null default true,
  status text not null default 'idle' check (status in ('idle','running','paused','blocked','completed')),
  generation uuid not null default gen_random_uuid(),
  cursor jsonb not null default '{"phase":"catalog"}'::jsonb,
  workflow_run_id text,
  launch_until timestamptz,
  lease_owner uuid,
  lease_until timestamptz,
  source_requests bigint not null default 0,
  completed_batches bigint not null default 0,
  consecutive_failures integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.scrape_jobs(id) values ('shinigami');
alter table public.scrape_jobs enable row level security;
revoke all on public.scrape_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.scrape_jobs to service_role;
create index chapters_missing_pages_idx on public.chapters(comic_id, number, id) where pages_fetched_at is null;
create index comics_incomplete_idx on public.comics(id) where not chapter_list_complete;

create function public.scrape_control(p_action text default 'status', p_generation uuid default null, p_run_id text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.scrape_jobs;
begin
  select * into strict j from public.scrape_jobs where id = 'shinigami' for update;
  if p_action = 'status' then return to_jsonb(j); end if;
  if p_action = 'pause' then
    update public.scrape_jobs set enabled=false, status='paused', generation=gen_random_uuid(), lease_owner=null,
      lease_until=null, launch_until=null, workflow_run_id=null, updated_at=now() where id=j.id returning * into j;
    return to_jsonb(j);
  elsif p_action = 'attach' then
    if j.generation = p_generation and j.status = 'running' and j.workflow_run_id is null then
      if p_run_id is null or length(p_run_id) not between 1 and 200 then raise exception 'Invalid workflow run'; end if;
      update public.scrape_jobs set workflow_run_id=p_run_id, updated_at=now() where id=j.id returning * into j;
    end if;
    return to_jsonb(j);
  elsif p_action in ('begin','resume','recover') then
    if (not j.enabled and p_action <> 'resume')
       or (j.status = 'running' and p_action <> 'recover' and
           (j.workflow_run_id is not null or j.launch_until > now())) then
      return jsonb_build_object('launch',false,'job',to_jsonb(j));
    end if;
    update public.scrape_jobs set enabled=true, status='running', generation=gen_random_uuid(),
      cursor=case when j.status='completed' then '{"phase":"catalog"}'::jsonb else j.cursor end,
      workflow_run_id=null, launch_until=now()+interval '2 minutes', lease_owner=null, lease_until=null,
      consecutive_failures=0, last_error=null, updated_at=now() where id=j.id returning * into j;
    return jsonb_build_object('launch',true,'job',to_jsonb(j));
  end if;
  raise exception 'Invalid scraper action';
end $$;

create function public.claim_scrape_batch(p_generation uuid, p_owner uuid, p_run_id text, p_limit_mb integer default 400)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.scrape_jobs;
begin
  select * into strict j from public.scrape_jobs where id='shinigami' for update;
  if not j.enabled or j.generation <> p_generation or j.status <> 'running' then
    return jsonb_build_object('kind','stop');
  end if;
  if j.lease_until > now() then
    return jsonb_build_object('kind','wait','seconds',ceil(extract(epoch from j.lease_until-now()))+2);
  end if;
  if p_limit_mb not between 100 and 10240 then raise exception 'Invalid database budget'; end if;
  if pg_database_size(current_database()) > p_limit_mb::bigint*1024*1024 then
    update public.scrape_jobs set enabled=false, status='paused', last_error='Database storage budget reached', updated_at=now() where id=j.id;
    return jsonb_build_object('kind','stop');
  end if;
  update public.scrape_jobs set lease_owner=p_owner, lease_until=now()+interval '6 minutes',
    workflow_run_id=p_run_id, launch_until=null, updated_at=now() where id=j.id returning * into j;
  return jsonb_build_object('kind','claimed','job',to_jsonb(j));
end $$;

create function public.commit_scrape_batch(p_generation uuid, p_owner uuid, p_cursor jsonb,
  p_bundles jsonb default '[]'::jsonb, p_release boolean default true, p_requests integer default 0, p_finish boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.scrape_jobs; bundle jsonb;
begin
  select * into strict j from public.scrape_jobs where id='shinigami' for update;
  if not j.enabled or j.generation <> p_generation or j.lease_owner is distinct from p_owner or j.lease_until <= now() then
    raise exception 'Scraper lease lost';
  end if;
  if jsonb_typeof(p_cursor) is distinct from 'object' or coalesce(p_cursor->>'phase','') not in ('catalog','chapters','pages')
     or jsonb_typeof(p_bundles) is distinct from 'array' or jsonb_array_length(p_bundles)>100 or p_requests not between 0 and 1000 then
    raise exception 'Invalid scraper checkpoint';
  end if;
  for bundle in select value from jsonb_array_elements(p_bundles) loop
    perform public.import_comic_bundle(bundle);
  end loop;
  update public.scrape_jobs set cursor=p_cursor, source_requests=source_requests+p_requests,
    completed_batches=completed_batches+case when p_release then 1 else 0 end,
    consecutive_failures=0, last_error=null, status=case when p_finish then 'completed' else status end,
    lease_owner=case when p_release then null else lease_owner end,
    lease_until=case when p_release then null else lease_until end, updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j);
end $$;

create function public.fail_scrape_batch(p_generation uuid, p_owner uuid, p_message text, p_blocked boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.scrape_jobs;
begin
  select * into strict j from public.scrape_jobs where id='shinigami' for update;
  if j.generation <> p_generation or j.lease_owner is distinct from p_owner then return to_jsonb(j); end if;
  update public.scrape_jobs set consecutive_failures=consecutive_failures+1,
    enabled=not (p_blocked or consecutive_failures>=2),
    status=case when p_blocked then 'blocked' when consecutive_failures>=2 then 'paused' else 'running' end,
    lease_owner=null, lease_until=null, last_error=left(p_message,1000), updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j);
end $$;

revoke all on function public.scrape_control(text,uuid,text) from public,anon,authenticated;
revoke all on function public.claim_scrape_batch(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.commit_scrape_batch(uuid,uuid,jsonb,jsonb,boolean,integer,boolean) from public,anon,authenticated;
revoke all on function public.fail_scrape_batch(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.scrape_control(text,uuid,text) to service_role;
grant execute on function public.claim_scrape_batch(uuid,uuid,text,integer) to service_role;
grant execute on function public.commit_scrape_batch(uuid,uuid,jsonb,jsonb,boolean,integer,boolean) to service_role;
grant execute on function public.fail_scrape_batch(uuid,uuid,text,boolean) to service_role;


