// Minimal stub for backwards compatibility
// This project now uses IndexedDB via local-db.ts for offline storage

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    getUser: async () => ({ data: { user: null } }),
    signInWithPassword: async () => ({ error: { message: "Offline mode - use local auth" } }),
    signUp: async () => ({ error: { message: "Offline mode - use local auth" } }),
    signOut: async () => {},
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => ({
    select: () => ({ data: [], error: null }),
    insert: () => ({ data: null, error: { message: "Offline mode" } }),
    update: () => ({ data: null, error: { message: "Offline mode" } }),
    delete: () => ({ data: null, error: { message: "Offline mode" } }),
  }),
  rpc: async () => ({ data: null, error: { message: "Offline mode" } }),
  storage: {
    from: () => ({
      upload: async () => ({ error: { message: "Offline mode" } }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
    }),
  },
};
