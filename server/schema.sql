-- Lumen System: bozza iniziale dello schema SQLite.
-- Progetto, non migrazione eseguita. Ogni connessione applicativa deve attivare PRAGMA foreign_keys=ON.
-- Tutti i *_at sono timestamp UTC ISO 8601; work_date e document_date sono date YYYY-MM-DD.
-- Le quantità sono espresse in millesimi dell'unità (1000 = 1 pz/kg/m).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN (
    'calendar.read', 'calendar.write', 'inventory.read', 'inventory.write',
    'documents.read', 'documents.write', 'imports.manage', 'users.manage'
  )),
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  work_date TEXT,
  place TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('in_sospeso', 'programmata', 'in_corso', 'completata')),
  notes TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS activities_date_idx ON activities(work_date);
CREATE INDEX IF NOT EXISTS activities_status_idx ON activities(status);

CREATE TABLE IF NOT EXISTS activity_people (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id),
  PRIMARY KEY (activity_id, person_id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  code TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  normalized_key TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS products_code_idx ON products(code);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('order', 'ddt', 'invoice', 'other')),
  state TEXT NOT NULL CHECK (state IN ('draft', 'confirmed', 'void')),
  supplier TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  document_date TEXT,
  original_filename TEXT NOT NULL DEFAULT '',
  stored_path TEXT,
  file_sha256 TEXT,
  file_mime TEXT,
  file_bytes INTEGER CHECK (file_bytes IS NULL OR file_bytes >= 0),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  created_by TEXT REFERENCES users(id),
  confirmed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS documents_lookup_idx ON documents(type, supplier, number, document_date);
CREATE INDEX IF NOT EXISTS documents_hash_idx ON documents(file_sha256);

CREATE TABLE IF NOT EXISTS document_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  product_id TEXT REFERENCES products(id),
  description TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER CHECK (quantity_milli IS NULL OR quantity_milli > 0),
  unit TEXT NOT NULL DEFAULT '',
  unit_price_micros INTEGER CHECK (unit_price_micros IS NULL OR unit_price_micros >= 0),
  linked_order_line_id TEXT REFERENCES document_lines(id),
  registration TEXT NOT NULL DEFAULT 'review' CHECK (registration IN ('review', 'ordered', 'received', 'none')),
  UNIQUE (document_id, line_number)
);
CREATE INDEX IF NOT EXISTS document_lines_product_idx ON document_lines(product_id);

-- Solo righe confermate generano movimenti. Una riga non crea due volte lo stesso movimento.
CREATE TABLE IF NOT EXISTS product_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  document_line_id TEXT UNIQUE REFERENCES document_lines(id),
  kind TEXT NOT NULL CHECK (kind IN ('ordered', 'received', 'issued', 'adjustment_in', 'adjustment_out')),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  event_date TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS product_movements_product_idx ON product_movements(product_id, kind);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  preview_json TEXT,
  imported_by TEXT REFERENCES users(id),
  imported_at TEXT NOT NULL,
  UNIQUE (source_type, source_ref, payload_sha256)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at);

-- Metadati dei file nella cartella condivisa, separati dai documenti di magazzino.
CREATE TABLE IF NOT EXISTS shared_files (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL
);

-- WhatsApp Cloud API data stays in the Lumen System database.
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_recent_idx ON whatsapp_conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wa_message_id TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('received','sent','delivered','read','failed')),
  status_detail TEXT NOT NULL DEFAULT '',
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_idx ON whatsapp_messages(conversation_id,timestamp,id);

-- Radar AI keeps source material and review state separate from operational data.
CREATE TABLE IF NOT EXISTS radar_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss', 'html')),
  category TEXT NOT NULL,
  projects_json TEXT NOT NULL DEFAULT '[]',
  skill TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  etag TEXT NOT NULL DEFAULT '',
  last_modified TEXT NOT NULL DEFAULT '',
  last_new_items INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS radar_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL,
  verified_at TEXT,
  category TEXT NOT NULL,
  projects_json TEXT NOT NULL DEFAULT '[]',
  skill TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'da_verificare' CHECK (verification_status IN ('verificata', 'da_verificare', 'non_confermata', 'obsoleta')),
  summary TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL DEFAULT '',
  cost_dependency TEXT NOT NULL DEFAULT '',
  proposed_action TEXT NOT NULL DEFAULT '',
  confirmation_required INTEGER NOT NULL DEFAULT 1 CHECK (confirmation_required IN (0, 1)),
  decision TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES radar_items(id),
  original_content TEXT NOT NULL DEFAULT '',
  action_status TEXT NOT NULL DEFAULT 'solo_informativa' CHECK (action_status IN ('solo_informativa', 'da_verificare', 'pronta_analisi', 'pronta_implementazione', 'in_attesa_conferma', 'completata', 'rifiutata')),
  unread INTEGER NOT NULL DEFAULT 1 CHECK (unread IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS radar_items_status_idx ON radar_items(verification_status, unread);
CREATE INDEX IF NOT EXISTS radar_items_source_idx ON radar_items(source_id, published_at);

CREATE TABLE IF NOT EXISTS radar_actions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES radar_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'solo_informativa' CHECK (status IN ('solo_informativa', 'da_verificare', 'pronta_analisi', 'pronta_implementazione', 'in_attesa_conferma', 'completata', 'rifiutata')),
  confirmation_required INTEGER NOT NULL DEFAULT 1 CHECK (confirmation_required IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS radar_actions_item_idx ON radar_actions(item_id, status);

-- Radar Spesa Locale: offers are source-backed and never include loyalty credentials.
CREATE TABLE IF NOT EXISTS shopping_stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_checked_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_offers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES shopping_stores(id),
  product_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  package_text TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  unit_price_cents INTEGER CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0),
  valid_from TEXT NOT NULL DEFAULT '',
  valid_to TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  source_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'da_verificare' CHECK (status IN ('verificata', 'da_verificare')),
  confidence TEXT NOT NULL DEFAULT 'media',
  content_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shopping_offers_lookup_idx ON shopping_offers(store_id, normalized_name, valid_to, status);

CREATE TABLE IF NOT EXISTS shopping_source_documents (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES shopping_stores(id),
  document_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  valid_from TEXT NOT NULL DEFAULT '',
  valid_to TEXT NOT NULL DEFAULT '',
  discovered_at TEXT NOT NULL,
  content_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shopping_source_documents_store_idx ON shopping_source_documents(store_id, valid_to);
