import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Types
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'nurse';
  created_at: string;
}

export interface Product {
  id: string;
  product_code: string;
  product_name: string;
  barcode: string | null;
  category: string | null;
  manufacturer: string | null;
  base_unit: string;
  reorder_level: number;
  notes: string | null;
  image_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductUnit {
  id: string;
  product_id: string;
  unit_name: string;
  factor_to_base: number;
  is_base: boolean;
  barcode: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarehouseSection {
  id: string;
  warehouse_id: string;
  section_name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryBatch {
  id: string;
  product_id: string;
  warehouse_id: string;
  section_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity_base_unit: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  transaction_type: 'stock_in' | 'dispensing' | 'transfer_in' | 'transfer_out' | 'disposal' | 'adjustment' | 'inventory_count';
  product_id: string;
  batch_id: string | null;
  warehouse_id: string;
  section_id: string | null;
  quantity: number;
  unit_id: string;
  quantity_base_unit: number;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'low_stock' | 'near_expiry' | 'expired' | 'import' | 'backup' | 'system';
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  category: string;
  key: string;
  value: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ClinicDB extends DBSchema {
  users: {
    key: string;
    value: User;
    indexes: { 'by-email': string };
  };
  products: {
    key: string;
    value: Product;
    indexes: { 'by-code': string; 'by-barcode': string };
  };
  product_units: {
    key: string;
    value: ProductUnit;
    indexes: { 'by-product': string };
  };
  warehouses: {
    key: string;
    value: Warehouse;
    indexes: { 'by-code': string };
  };
  warehouse_sections: {
    key: string;
    value: WarehouseSection;
    indexes: { 'by-warehouse': string };
  };
  inventory_batches: {
    key: string;
    value: InventoryBatch;
    indexes: { 'by-product': string; 'by-warehouse': string };
  };
  inventory_transactions: {
    key: string;
    value: InventoryTransaction;
    indexes: { 'by-product': string; 'by-warehouse': string };
  };
  audit_logs: {
    key: string;
    value: AuditLog;
    indexes: { 'by-user': string };
  };
  notifications: {
    key: string;
    value: Notification;
    indexes: { 'by-user': string };
  };
  system_settings: {
    key: string;
    value: SystemSetting;
    indexes: { 'by-category': string };
  };
}

const DB_NAME = 'clinic-inventory-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ClinicDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<ClinicDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ClinicDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Users store
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('by-email', 'email', { unique: true });
        }

        // Products store
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('by-code', 'product_code', { unique: false });
          productStore.createIndex('by-barcode', 'barcode', { unique: false });
        }

        // Product units store
        if (!db.objectStoreNames.contains('product_units')) {
          const unitStore = db.createObjectStore('product_units', { keyPath: 'id' });
          unitStore.createIndex('by-product', 'product_id', { unique: false });
        }

        // Warehouses store
        if (!db.objectStoreNames.contains('warehouses')) {
          const whStore = db.createObjectStore('warehouses', { keyPath: 'id' });
          whStore.createIndex('by-code', 'warehouse_code', { unique: false });
        }

        // Warehouse sections store
        if (!db.objectStoreNames.contains('warehouse_sections')) {
          const secStore = db.createObjectStore('warehouse_sections', { keyPath: 'id' });
          secStore.createIndex('by-warehouse', 'warehouse_id', { unique: false });
        }

        // Inventory batches store
        if (!db.objectStoreNames.contains('inventory_batches')) {
          const batchStore = db.createObjectStore('inventory_batches', { keyPath: 'id' });
          batchStore.createIndex('by-product', 'product_id', { unique: false });
          batchStore.createIndex('by-warehouse', 'warehouse_id', { unique: false });
        }

        // Inventory transactions store
        if (!db.objectStoreNames.contains('inventory_transactions')) {
          const txnStore = db.createObjectStore('inventory_transactions', { keyPath: 'id' });
          txnStore.createIndex('by-product', 'product_id', { unique: false });
          txnStore.createIndex('by-warehouse', 'warehouse_id', { unique: false });
        }

        // Audit logs store
        if (!db.objectStoreNames.contains('audit_logs')) {
          const auditStore = db.createObjectStore('audit_logs', { keyPath: 'id' });
          auditStore.createIndex('by-user', 'user_id', { unique: false });
        }

        // Notifications store
        if (!db.objectStoreNames.contains('notifications')) {
          const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
          notifStore.createIndex('by-user', 'user_id', { unique: false });
        }

        // System settings store
        if (!db.objectStoreNames.contains('system_settings')) {
          const settingsStore = db.createObjectStore('system_settings', { keyPath: 'id' });
          settingsStore.createIndex('by-category', 'category', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

// Utility functions
export function generateId(): string {
  return crypto.randomUUID();
}

export function generateCode(prefix: string): string {
  const num = Math.floor(Math.random() * 900000) + 100000;
  return `${prefix}-${num}`;
}

export function now(): string {
  return new Date().toISOString();
}

// Initialize default admin user if none exists
export async function initializeDB(): Promise<void> {
  const db = await getDB();
  const users = await db.getAll('users');
  if (users.length === 0) {
    // Create default admin user
    const defaultUser: User = {
      id: generateId(),
      email: 'admin@local',
      full_name: 'Administrator',
      role: 'admin',
      created_at: now(),
    };
    await db.put('users', defaultUser);
    // Store in localStorage for session
    localStorage.setItem('local-auth-user', JSON.stringify(defaultUser));
  }
}
