PRAGMA foreign_keys = ON;

-- Mezzi e attrezzature dell'officina. Una targa sconosciuta resta NULL.
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  plate TEXT UNIQUE,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  category TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS equipment_vehicle_idx ON equipment(vehicle_id, active, name);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_serial_idx ON equipment(serial_number) WHERE serial_number <> '';

CREATE TABLE IF NOT EXISTS activity_vehicles (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  driver_person_id TEXT REFERENCES people(id),
  outbound_at TEXT,
  outbound_by TEXT REFERENCES users(id),
  returned_at TEXT,
  returned_by TEXT REFERENCES users(id),
  PRIMARY KEY (activity_id, vehicle_id)
);
CREATE INDEX IF NOT EXISTS activity_vehicles_vehicle_idx ON activity_vehicles(vehicle_id, activity_id);

CREATE TABLE IF NOT EXISTS activity_equipment (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  loaded_quantity INTEGER NOT NULL DEFAULT 0 CHECK (loaded_quantity >= 0),
  returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  loaded_at TEXT,
  loaded_by TEXT REFERENCES users(id),
  returned_at TEXT,
  returned_by TEXT REFERENCES users(id),
  CHECK (returned_quantity <= loaded_quantity AND loaded_quantity <= quantity),
  PRIMARY KEY (activity_id, equipment_id)
);

-- Quantita in millesimi, come nel magazzino. Le righe collegate a prodotti
-- generano movimenti di magazzino al carico e al rientro.
CREATE TABLE IF NOT EXISTS activity_materials (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
  unit TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  loaded_milli INTEGER NOT NULL DEFAULT 0 CHECK (loaded_milli >= 0),
  returned_milli INTEGER NOT NULL DEFAULT 0 CHECK (returned_milli >= 0),
  loaded_at TEXT,
  loaded_by TEXT REFERENCES users(id),
  returned_at TEXT,
  returned_by TEXT REFERENCES users(id),
  CHECK (returned_milli <= loaded_milli AND loaded_milli <= quantity_milli)
);
CREATE INDEX IF NOT EXISTS activity_materials_activity_idx ON activity_materials(activity_id);

CREATE TABLE IF NOT EXISTS activity_material_movements (
  movement_id TEXT PRIMARY KEY REFERENCES product_movements(id) ON DELETE CASCADE,
  activity_material_id TEXT REFERENCES activity_materials(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('load', 'return'))
);
CREATE INDEX IF NOT EXISTS activity_material_movements_material_idx ON activity_material_movements(activity_material_id);
