-- Canvas objects stored as JSON for structured entities
create table if not exists canvas_objects (
  id uuid primary key,
  type text not null,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Action Veins for event-driven connections
create table if not exists veins (
  id uuid primary key,
  source_id uuid references canvas_objects(id) on delete cascade,
  target_id uuid references canvas_objects(id) on delete cascade,
  trigger text not null,
  action text not null,
  payload jsonb,
  updated_at timestamptz default now()
);

-- Task metadata
create table if not exists tasks (
  id uuid primary key references canvas_objects(id) on delete cascade,
  status text,
  owner text,
  priority text,
  due date,
  updated_at timestamptz default now()
);

-- GitHub repositories and files represented on canvas
create table if not exists repos (
  id uuid primary key,
  name text not null,
  url text not null,
  updated_at timestamptz default now()
);

create table if not exists files (
  id uuid primary key,
  repo_id uuid references repos(id) on delete cascade,
  path text not null,
  status text default 'clean',
  updated_at timestamptz default now()
);

create table if not exists links (
  id uuid primary key,
  object_id uuid references canvas_objects(id) on delete cascade,
  file_id uuid references files(id) on delete cascade,
  updated_at timestamptz default now()
);

alter table canvas_objects enable row level security;
alter table veins enable row level security;
alter table tasks enable row level security;
alter table repos enable row level security;
alter table files enable row level security;
alter table links enable row level security;

create policy "authenticated read/write canvas" on canvas_objects
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write veins" on veins
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write tasks" on tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write repos" on repos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write files" on files
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write links" on links
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
