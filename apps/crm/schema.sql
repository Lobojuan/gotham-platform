create table if not exists items (
  id serial primary key,
  code text unique not null,
  kind text not null check (kind in ('event','membership','briefing','service')),
  title text not null, subtitle text, venue text,
  starts_at timestamptz, ends_at timestamptz,
  currency text not null default 'GHS', price numeric(12,2) not null default 0, per text,
  capacity int, published boolean default true, sort int default 0,
  approval boolean default false,           -- true = by invitation: applications need approval
  phase text default 'open' check (phase in ('teaser','open','live','past')),
  audiences text                            -- comma-separated categories allowed to apply
);
create table if not exists registrations (
  id serial primary key,
  reference text unique not null,
  item_code text not null references items(code),
  company text not null, reg_no text,
  full_name text not null, job_title text, email text not null, phone text not null,
  country text, sector text,
  seats int not null default 1,
  guests text,
  currency text not null, amount numeric(12,2) not null default 0,
  payment_method text not null default 'momo',
  paid boolean not null default false,
  paid_at timestamptz, paid_by text, payment_ref text, payment_note text,
  status text not null default 'new' check (status in ('new','pending','confirmed','declined','cancelled','attended','waitlist')),
  category text,                 -- SME owner, Investor, Government / stakeholder, Partner, Media, Other
  invite_code text,
  utm_source text, utm_campaign text,
  checked_in_at timestamptz,
  notes text,
  consent_at timestamptz, marketing_opt_in boolean default false,
  source text default 'website', ip text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists reg_item on registrations(item_code);
create index if not exists reg_created on registrations(created_at desc);
create table if not exists users (
  id serial primary key,
  email text unique not null,
  name text,
  role text not null default 'admin' check (role in ('owner','admin','staff')),
  pw_hash text not null, pw_salt text not null,
  must_change boolean default true,
  created_at timestamptz default now(), last_login timestamptz
);
create table if not exists settings (key text primary key, value text);
create table if not exists activity (
  id serial primary key, reg_id int references registrations(id) on delete cascade,
  actor text, action text not null, detail text, at timestamptz default now()
);

create table if not exists shortlinks (
  slug text primary key, target text not null, label text,
  utm_source text, utm_campaign text, clicks int default 0, created_at timestamptz default now()
);
-- migrations for an existing database
alter table items add column if not exists approval boolean default false;
alter table items add column if not exists phase text default 'open';
alter table items add column if not exists audiences text;
alter table registrations add column if not exists category text;
alter table registrations add column if not exists invite_code text;
alter table registrations add column if not exists utm_source text;
alter table registrations add column if not exists utm_campaign text;
do $$ begin
  alter table registrations drop constraint if exists registrations_status_check;
  alter table registrations add constraint registrations_status_check
    check (status in ('new','pending','confirmed','declined','cancelled','attended','waitlist'));
exception when others then null; end $$;

-- ===== v2: subscribers, email outbox, jobs, tickets =====
alter table registrations add column if not exists confirm_token text;
alter table registrations add column if not exists confirmed_email boolean default false;
alter table registrations add column if not exists unsub_token text;
alter table registrations add column if not exists unsubscribed_at timestamptz;
alter table registrations add column if not exists ticket_code text;
alter table registrations add column if not exists checked_in_at timestamptz;
alter table registrations add column if not exists reminder_sent_at timestamptz;
alter table registrations add column if not exists duephone text;

create table if not exists outbox (
  id serial primary key,
  to_email text not null, to_name text,
  subject text not null, body text not null,
  kind text not null,
  reg_id int references registrations(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_id text, error text,
  created_at timestamptz default now(), sent_at timestamptz
);
create index if not exists outbox_status on outbox(status, created_at);

create table if not exists jobs_log (
  id serial primary key, job text not null, detail text, at timestamptz default now()
);

alter table users add column if not exists active boolean default true;

-- ---- rich event content (v1.2) ----
alter table items add column if not exists slug text;
alter table items add column if not exists summary text;          -- one-line teaser for cards
alter table items add column if not exists description text;      -- long body, plain paragraphs
alter table items add column if not exists cover text;            -- media id of the cover image
alter table items add column if not exists gallery jsonb default '[]'::jsonb;   -- array of media ids
alter table items add column if not exists docs jsonb default '[]'::jsonb;      -- [{id,label}]
alter table items add column if not exists agenda jsonb default '[]'::jsonb;    -- [{time,what}]
alter table items add column if not exists speakers jsonb default '[]'::jsonb;  -- [{name,role,media}]
create unique index if not exists items_slug_uq on items (slug) where slug is not null;

create table if not exists media (
  id text primary key,
  kind text not null check (kind in ('image','logo','doc')),
  original_name text,
  mime text,
  bytes int,
  width int, height int,
  variants jsonb default '{}'::jsonb,   -- {hero:{f,w,h},card:{...},thumb:{...}} per format
  alt text,
  uploaded_by text,
  created_at timestamptz default now()
);

alter table shortlinks add column if not exists kind text default 'link';
alter table shortlinks add column if not exists item_code text;

-- audit trail for admin actions (who changed what, outside a single registration)
create table if not exists audit_log (
  id serial primary key,
  actor text,
  action text not null,
  detail text,
  at timestamptz default now()
);
create index if not exists audit_log_at_idx on audit_log (at desc);

-- ---- sponsors and advertising (v1.3) ----
create table if not exists sponsors (
  id serial primary key,
  name text not null,
  tier text not null default 'listing' check (tier in ('headline','partner','supporting','listing')),
  category text,                       -- Mining, Hospitality, Legal, Banking, Logistics, Energy...
  blurb text,                          -- one line shown under the logo
  url text,
  logo text,                           -- media id, kind='logo'
  item_code text,                      -- null = across the site; a code = that event only
  starts_on date, ends_on date,        -- null = no limit
  amount numeric(12,2) default 0, currency text default 'GHS',
  paid boolean default false,
  contact_name text, contact_email text, contact_phone text,
  notes text,
  published boolean default true,
  sort int default 0,
  created_at timestamptz default now()
);
create index if not exists sponsors_live_idx on sponsors (published, tier, sort);

-- enquiries from the "become a sponsor" form
create table if not exists sponsor_leads (
  id serial primary key,
  company text not null, contact_name text, email text, phone text,
  tier text, item_code text, budget text, message text,
  status text not null default 'new' check (status in ('new','talking','won','lost')),
  utm_source text, utm_campaign text,
  created_at timestamptz default now()
);

-- widen the media kinds for logos on an existing database
alter table media drop constraint if exists media_kind_check;
alter table media add constraint media_kind_check check (kind in ('image','logo','doc'));

-- ---- outreach: contacts and campaigns (v1.4) ----
create table if not exists contacts (
  id serial primary key,
  company text, full_name text, role text,
  email text, phone text,
  sector text, city text, country text default 'Ghana',
  tags text,                      -- comma separated, e.g. "mining,md,tier-a"
  source text,                    -- where the name came from, needed under Act 843
  notes text,
  status text not null default 'new'
    check (status in ('new','contacted','replied','meeting','won','lost','do_not_contact')),
  unsubscribed_at timestamptz,
  bounced boolean default false,
  last_sent_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists contacts_email_uq on contacts (lower(email)) where email is not null;
create index if not exists contacts_sector_idx on contacts (sector, status);

create table if not exists campaigns (
  id serial primary key,
  name text not null,
  subject text not null,
  template text not null default 'invitation'
    check (template in ('invitation','sponsor','brief','plain')),
  intro text,                     -- the body, blank line between paragraphs
  cta_label text, cta_url text,
  item_code text,                 -- pulls date, venue and cover image from the event
  seg_sector text, seg_tags text, seg_status text,
  from_name text,
  daily_limit int not null default 40,
  status text not null default 'draft' check (status in ('draft','sending','paused','done')),
  created_by text,
  created_at timestamptz default now()
);

create table if not exists campaign_sends (
  id serial primary key,
  campaign_id int not null references campaigns(id) on delete cascade,
  contact_id int not null references contacts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','skipped','failed')),
  skip_reason text,
  token text unique,
  sent_at timestamptz, clicked_at timestamptz,
  unique (campaign_id, contact_id)
);
create index if not exists campaign_sends_q_idx on campaign_sends (campaign_id, status);

alter table outbox drop constraint if exists outbox_kind_check;

-- ---- spreadsheet import (v1.5) ----
alter table contacts add column if not exists website text;
alter table contacts add column if not exists priority text;      -- Tier 1 / Tier 2 / …
alter table contacts add column if not exists extra jsonb default '{}'::jsonb;  -- every column we were not asked to map
create index if not exists contacts_company_idx on contacts (lower(company));

-- ---- forum registration questions, from the SMEs at the Centre form (v1.6) ----
alter table registrations add column if not exists company_about text;
alter table registrations add column if not exists company_size text;
alter table registrations add column if not exists challenge text;
alter table registrations add column if not exists heard_via text;
alter table registrations add column if not exists follow_up text;   -- yes / maybe / no
update contacts set unsubscribed_at = coalesce(unsubscribed_at, now()) where status = 'do_not_contact' and unsubscribed_at is null;
