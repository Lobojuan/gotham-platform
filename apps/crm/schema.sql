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
-- Customer reports are claims for staff reconciliation, never proof of payment.
-- Keep every report for audit and prevent the same network transaction being claimed twice.
create table if not exists payment_reports (
  id bigserial primary key,
  reg_id int not null references registrations(id) on delete cascade,
  network text not null check (network in ('MTN','Telecel','AirtelTigo')),
  transaction_id text not null,
  phone text,
  reported_at timestamptz not null default now()
);
create unique index if not exists payment_reports_txn_uq
  on payment_reports (lower(network), lower(transaction_id));
create index if not exists payment_reports_reg_idx on payment_reports(reg_id, reported_at desc);
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
-- bumped on password change/reset/disable so older sign-ins stop working at once
alter table users add column if not exists sv integer not null default 0;
alter table users add column if not exists pw_changed_at timestamptz;

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
alter table media add constraint media_kind_check check (kind in ('image','logo','doc','email'));

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

-- Sept 2026: email is optional on registrations (name + phone are enough)
alter table registrations alter column email drop not null;

-- ---- CRM: pipeline, tasks, notes (v2.0, Sept 2026) ----
-- A deal is anything that can earn money: a sponsorship, a consulting job, a Family Desk family,
-- a membership. Values are always in Ghana cedis.
create table if not exists deals (
  id serial primary key,
  title text not null,
  contact_id int references contacts(id) on delete set null,
  company text,                         -- copied from the contact, so the board reads without joins
  kind text not null default 'consulting'
    check (kind in ('sponsorship','consulting','family_desk','membership','event','other')),
  stage text not null default 'lead'
    check (stage in ('lead','contacted','meeting','proposal','won','lost')),
  value numeric(14,2) not null default 0,   -- GHS
  owner text,                           -- users.email
  next_step text, next_date date,
  source text,                          -- where it came from: forum lead, sponsor enquiry, referral…
  lost_reason text,
  reg_id int references registrations(id) on delete set null,
  sponsor_lead_id int references sponsor_leads(id) on delete set null,
  sort int not null default 0,
  created_by text,
  created_at timestamptz default now(), updated_at timestamptz default now(), closed_at timestamptz
);
create index if not exists deals_stage_idx on deals (stage, sort);
create index if not exists deals_contact_idx on deals (contact_id);

create table if not exists deal_events (
  id serial primary key,
  deal_id int not null references deals(id) on delete cascade,
  from_stage text, to_stage text, detail text,
  by_user text, at timestamptz default now()
);

create table if not exists tasks (
  id serial primary key,
  title text not null,
  notes text,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('normal','high')),
  assignee text,                        -- users.email
  contact_id int references contacts(id) on delete cascade,
  deal_id int references deals(id) on delete cascade,
  reg_id int references registrations(id) on delete set null,
  done_at timestamptz, done_by text,
  created_by text, created_at timestamptz default now()
);
create index if not exists tasks_open_idx on tasks (assignee, due_at) where done_at is null;

-- a line in a company's history: a call, a WhatsApp, a meeting, a note
create table if not exists notes (
  id serial primary key,
  contact_id int references contacts(id) on delete cascade,
  deal_id int references deals(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','call','whatsapp','meeting','email')),
  body text not null,
  author text, at timestamptz default now()
);
create index if not exists notes_contact_idx on notes (contact_id, at desc);
create index if not exists notes_deal_idx on notes (deal_id, at desc);

-- ---- client database and email / SMS / WhatsApp broadcasts (v1.8) ----
-- what kind of client, and who agreed to hear from us on which channel (Act 843: purpose, consent, proof)
alter table contacts add column if not exists client_type text;          -- corporate | international | government | investor | sme | media | partner | other
alter table contacts add column if not exists language text default 'en';
alter table contacts add column if not exists whatsapp text;             -- if different from phone
alter table contacts add column if not exists consent_email text default 'unknown';     -- yes | no | unknown
alter table contacts add column if not exists consent_sms text default 'unknown';
alter table contacts add column if not exists consent_whatsapp text default 'unknown';
alter table contacts add column if not exists consent_source text;      -- "Brief signup", "forum registration", "business card at forum", …
alter table contacts add column if not exists consent_at timestamptz;
alter table contacts add column if not exists sms_unsub_at timestamptz;
alter table contacts add column if not exists whatsapp_unsub_at timestamptz;
alter table contacts add column if not exists reg_id int references registrations(id) on delete set null;
create unique index if not exists contacts_reg_uq on contacts (reg_id) where reg_id is not null;
create index if not exists contacts_type_idx on contacts (client_type, country);

alter table campaigns add column if not exists channel text not null default 'email';   -- email | sms | whatsapp
alter table campaigns add column if not exists seg_type text;
alter table campaigns add column if not exists seg_country text;
alter table campaigns add column if not exists seg_consent text default 'any';           -- any | yes (only people who said yes on this channel)
alter table campaigns add column if not exists sms_text text;
alter table campaigns add column if not exists wa_template text;                        -- approved WhatsApp template name
alter table campaigns add column if not exists wa_lang text default 'en';
alter table campaigns add column if not exists wa_params text;                          -- one per line, merge fields allowed
alter table campaigns drop constraint if exists campaigns_subject_check;

alter table campaign_sends add column if not exists channel text default 'email';
alter table campaign_sends add column if not exists to_addr text;
alter table campaign_sends add column if not exists outbox_id int;
alter table campaign_sends add column if not exists msg_id int;
alter table campaign_sends add column if not exists error text;
alter table campaign_sends add column if not exists delivered_at timestamptz;
alter table campaign_sends drop constraint if exists campaign_sends_status_check;
alter table campaign_sends add constraint campaign_sends_status_check
  check (status in ('queued','sending','sent','delivered','skipped','failed','manual'));

-- SMS and WhatsApp waiting to go out (the email outbox stays as it is)
create table if not exists msg_outbox (
  id serial primary key,
  channel text not null check (channel in ('sms','whatsapp')),
  to_phone text not null, to_name text,
  body text,                              -- SMS text, or the rendered WhatsApp text for hand sending
  template text, lang text, params jsonb, -- WhatsApp template
  kind text not null default 'campaign',
  contact_id int references contacts(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','cancelled','manual')),
  provider_id text, error text,
  created_at timestamptz default now(), sent_at timestamptz
);
create index if not exists msg_outbox_q on msg_outbox (status, channel, id);
create index if not exists outbox_kind_status on outbox (status, kind, id);
alter table outbox add column if not exists unsub_url text;

-- Carlson Capital Ltd is named (with Uffe's number) only on renewable energy / AI-software campaigns
alter table campaigns add column if not exists carlson boolean not null default false;

-- calendar: campaigns can be scheduled; everyone gets a private feed for their phone calendar
alter table campaigns add column if not exists starts_at timestamptz;
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check check (status in ('draft','scheduled','sending','paused','done'));
alter table users add column if not exists cal_token text;
create unique index if not exists users_cal_token_uq on users (cal_token) where cal_token is not null;

-- email designer: a campaign can be a list of blocks with pictures; designs can be saved and reused
alter table campaigns add column if not exists blocks jsonb not null default '[]'::jsonb;
alter table campaigns drop constraint if exists campaigns_template_check;
alter table campaigns add constraint campaigns_template_check check (template in ('invitation','sponsor','brief','plain','designer'));
alter table media drop constraint if exists media_kind_check;
alter table media add constraint media_kind_check check (kind in ('image','logo','doc','email'));
create table if not exists email_templates (
  id serial primary key,
  name text not null,
  subject text,
  blocks jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- WhatsApp conversations (incoming and what we replied), so the AI answers each message once and with context
create table if not exists wa_messages (
  id serial primary key,
  phone text not null,
  direction text not null check (direction in ('in','out')),
  body text,
  kind text,
  msg_id text unique,
  at timestamptz default now()
);
create index if not exists wa_messages_phone_idx on wa_messages (phone, at desc);

-- quotes and invoices: GHS for Ghana, EUR/USD only for non-residents (Bank of Ghana), Ghana VAT from 1 Jan 2026:
-- VAT 15% + NHIL 2.5% + GETFund 2.5% on the same value (not cascading). Amounts are stored as computed at the time.
create table if not exists invoices (
  id serial primary key,
  kind text not null default 'invoice' check (kind in ('quote','invoice')),
  number text unique,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','part_paid','paid','void')),
  contact_id int references contacts(id) on delete set null,
  deal_id int references deals(id) on delete set null,
  quote_id int references invoices(id) on delete set null,
  bill_to jsonb not null default '{}'::jsonb,
  currency text not null default 'GHS' check (currency in ('GHS','EUR','USD')),
  fx_rate numeric(14,6), fx_date date,
  tax_mode text not null default 'standard' check (tax_mode in ('standard','zero','exempt','none')),
  tax_note text,
  rates jsonb,
  lines jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) default 0, discount numeric(14,2) default 0, taxable numeric(14,2) default 0,
  vat numeric(14,2) default 0, nhil numeric(14,2) default 0, getfund numeric(14,2) default 0, total numeric(14,2) default 0,
  total_ghs numeric(14,2) default 0, tax_ghs numeric(14,2) default 0,
  issue_date date, due_date date, valid_until date,
  notes text, wht_rate numeric(5,2) default 0, evat_ref text,
  token text unique,
  sent_at timestamptz, paid_at timestamptz, accepted_at timestamptz, voided_at timestamptz, void_reason text,
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists invoices_status_idx on invoices (kind, status, issue_date desc);
create table if not exists invoice_payments (
  id serial primary key,
  invoice_id int not null references invoices(id) on delete cascade,
  paid_on date not null default current_date,
  amount numeric(14,2) not null,
  wht numeric(14,2) not null default 0,
  wht_cert boolean not null default false,
  method text not null default 'bank' check (method in ('momo','bank','card','cash','cheque','paystack','other')),
  reference text,
  fx_rate numeric(14,6),
  note text,
  recorded_by text, created_at timestamptz default now()
);
create unique index if not exists invoice_payments_ref_uq on invoice_payments (method, reference) where reference is not null and method = 'paystack';
create table if not exists invoice_seq (kind text not null, year int not null, n int not null default 0, primary key (kind, year));

-- pounds too: FirstBank's correspondent in London takes GBP
alter table invoices drop constraint if exists invoices_currency_check;
alter table invoices add constraint invoices_currency_check check (currency in ('GHS','EUR','USD','GBP'));

-- two-step sign-in (authenticator app)
alter table users add column if not exists totp_secret text;
alter table users add column if not exists totp_on boolean not null default false;
alter table users add column if not exists totp_last bigint;
alter table users add column if not exists totp_recovery jsonb;

-- credit notes (the VAT-correct way to reduce or cancel an issued invoice) and numbered receipts
alter table invoices drop constraint if exists invoices_kind_check;
alter table invoices add constraint invoices_kind_check check (kind in ('quote','invoice','credit'));
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check check (status in ('draft','sent','accepted','declined','part_paid','paid','credited','void'));
alter table invoices add column if not exists credit_for int references invoices(id) on delete set null;
create index if not exists invoices_credit_for on invoices (credit_for) where credit_for is not null;
alter table invoice_payments add column if not exists receipt_no text unique;
alter table invoice_payments add column if not exists receipt_sent_at timestamptz;

-- recurring invoices (retainers, memberships)
create table if not exists invoice_schedules (
  id serial primary key,
  template jsonb not null,
  every text not null default 'month' check (every in ('month','quarter','year')),
  next_date date not null, until date,
  auto_send boolean not null default false, active boolean not null default true,
  source_invoice_id int references invoices(id) on delete set null,
  last_invoice_id int references invoices(id) on delete set null,
  runs int not null default 0,
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now()
);
