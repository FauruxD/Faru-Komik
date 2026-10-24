-- Catalog and reader manifests. Public clients can read; only the importer can write.
create table public.comics (
  id uuid primary key,
  source text not null check (source = 'shinigami'),
  source_comic_id uuid not null,
  source_url text not null check (source_url ~ '^https://'),
  slug text not null unique,
  title text not null check (length(trim(title)) > 0),
  alternative_title text,
  description text not null default '',
  cover_url text check (cover_url ~ '^https?://'),
  format text,
  country text,
  source_status integer not null,
  release_year integer check (release_year between 1800 and 2200),
  rating numeric check (rating between 0 and 10),
  genres text[] not null default '{}',
  authors text[] not null default '{}',
  artists text[] not null default '{}',
  latest_chapter_number numeric check (latest_chapter_number >= 0),
  source_updated_at timestamptz,
  scraped_at timestamptz not null,
  chapter_list_complete boolean not null default false,
  unique (source, source_comic_id)
);

create table public.chapters (
  id uuid primary key,
  comic_id uuid not null references public.comics(id) on delete cascade,
  source_chapter_id uuid not null,
  source_url text not null check (source_url ~ '^https://'),
  number numeric not null check (number >= 0),
  title text not null default '',
  released_at timestamptz,
  scraped_at timestamptz not null,
  pages_fetched_at timestamptz,
  unique (comic_id, source_chapter_id)
);

create table public.chapter_pages (
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  position integer not null check (position > 0),
  image_url text not null check (image_url ~ '^https://'),
  primary key (chapter_id, position)
);

create index comics_updated_idx on public.comics (source_updated_at desc nulls last, id);
create index comics_genres_idx on public.comics using gin (genres);
create index comics_title_search_idx on public.comics using gin (to_tsvector('simple', title));
create index chapters_comic_number_idx on public.chapters (comic_id, number, id);

alter table public.comics enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_pages enable row level security;
create policy "Public catalog read" on public.comics for select to anon, authenticated using (true);
create policy "Public chapters read" on public.chapters for select to anon, authenticated using (true);
create policy "Public reader read" on public.chapter_pages for select to anon, authenticated using (true);

revoke all on public.comics, public.chapters, public.chapter_pages from anon, authenticated;
grant select on public.comics, public.chapters, public.chapter_pages to anon, authenticated;
grant select, insert, update, delete on public.comics, public.chapters, public.chapter_pages to service_role;

-- SECURITY INVOKER: no privilege escalation; explicitly callable only by service_role.
-- One RPC is one transaction. Invalid child rows roll back the entire comic import.
create function public.import_comic_bundle(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.comics;
  ch public.chapters;
  item jsonb;
  page_item jsonb;
  pages jsonb;
  expected_position integer;
begin
  if jsonb_typeof(payload->'comic') is distinct from 'object'
     or jsonb_typeof(payload->'chapters') is distinct from 'array'
     or jsonb_typeof(payload->'chapter_list_complete') is distinct from 'boolean' then
    raise exception 'Invalid comic bundle';
  end if;
  c := jsonb_populate_record(null::public.comics, payload->'comic');
  if c.id is null or c.source is distinct from 'shinigami' or c.scraped_at is null then
    raise exception 'Missing or invalid comic identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(c.id::text, 0));
  if exists (select 1 from public.comics where id = c.id and (source <> c.source or source_comic_id <> c.source_comic_id)) then
    raise exception 'Comic identity cannot be reassigned';
  end if;
  -- Replaying an older checkpoint must not overwrite fresher data.
  if exists (select 1 from public.comics where id = c.id and scraped_at > c.scraped_at) then
    return c.id;
  end if;
  insert into public.comics (
    id, source, source_comic_id, source_url, slug, title, alternative_title, description,
    cover_url, format, country, source_status, release_year, rating, genres, authors,
    artists, latest_chapter_number, source_updated_at, scraped_at, chapter_list_complete
  ) values (
    c.id, c.source, c.source_comic_id, c.source_url, c.slug, c.title, c.alternative_title,
    c.description, c.cover_url, c.format, c.country, c.source_status, c.release_year,
    c.rating, c.genres, c.authors, c.artists, c.latest_chapter_number,
    c.source_updated_at, c.scraped_at, (payload->>'chapter_list_complete')::boolean
  ) on conflict (id) do update set
    source_url = excluded.source_url, slug = excluded.slug, title = excluded.title,
    alternative_title = excluded.alternative_title, description = excluded.description,
    cover_url = excluded.cover_url, format = excluded.format, country = excluded.country,
    source_status = excluded.source_status, release_year = excluded.release_year,
    rating = excluded.rating, genres = excluded.genres, authors = excluded.authors,
    artists = excluded.artists, latest_chapter_number = excluded.latest_chapter_number,
    source_updated_at = excluded.source_updated_at, scraped_at = excluded.scraped_at,
    chapter_list_complete = excluded.chapter_list_complete;

  for item in select value from jsonb_array_elements(payload->'chapters') loop
    ch := jsonb_populate_record(null::public.chapters, item - 'pages');
    if ch.comic_id is distinct from c.id or ch.id is null then
      raise exception 'Chapter parent does not match the comic';
    end if;
    if exists (select 1 from public.chapters where id = ch.id and (comic_id <> c.id or source_chapter_id <> ch.source_chapter_id)) then
      raise exception 'Chapter identity cannot be reassigned';
    end if;
    pages := item->'pages';
    if pages is null or (pages = 'null'::jsonb and ch.pages_fetched_at is not null)
       or (pages <> 'null'::jsonb and (jsonb_typeof(pages) <> 'array' or ch.pages_fetched_at is null)) then
      raise exception 'Invalid reader manifest';
    end if;
    insert into public.chapters (
      id, comic_id, source_chapter_id, source_url, number, title, released_at, scraped_at, pages_fetched_at
    ) values (
      ch.id, ch.comic_id, ch.source_chapter_id, ch.source_url, ch.number, ch.title,
      ch.released_at, ch.scraped_at, ch.pages_fetched_at
    ) on conflict (id) do update set
      source_url = excluded.source_url, number = excluded.number, title = excluded.title,
      released_at = excluded.released_at, scraped_at = excluded.scraped_at,
      pages_fetched_at = coalesce(excluded.pages_fetched_at, public.chapters.pages_fetched_at);

    -- Metadata-only imports preserve an existing reader manifest.
    if pages <> 'null'::jsonb then
      if jsonb_array_length(pages) = 0 then raise exception 'Reader manifest is empty'; end if;
      delete from public.chapter_pages where chapter_id = ch.id;
      expected_position := 1;
      for page_item in select value from jsonb_array_elements(pages) loop
        if (page_item->>'position')::integer is distinct from expected_position then
          raise exception 'Reader positions must be contiguous and ordered';
        end if;
        insert into public.chapter_pages (chapter_id, position, image_url)
          values (ch.id, expected_position, page_item->>'image_url');
        expected_position := expected_position + 1;
      end loop;
    end if;
  end loop;
  return c.id;
end;
$$;

revoke all on function public.import_comic_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.import_comic_bundle(jsonb) to service_role;
