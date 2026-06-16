import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getDB, generateId, now, type User } from "./local-db";

export type AppRole = "admin" | "nurse";

interface LocalSession {
  user: User;
}

interface AuthCtx {
  session: LocalSession | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const stored = localStorage.getItem("local-auth-user");
      if (stored) {
        const user = JSON.parse(stored) as User;
        setSession({ user });
      }
    } catch (e) {
      console.error("Failed to load session:", e);
      localStorage.removeItem("local-auth-user");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const db = await getDB();
      const users = await db.getAll("users");
      const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (!user) {
        // Auto-create user if not found (offline mode)
        const newUser: User = {
          id: generateId(),
          email: email.toLowerCase(),
          full_name: email.split("@")[0],
          role: "admin",
          created_at: now(),
        };
        await db.put("users", newUser);
        localStorage.setItem("local-auth-user", JSON.stringify(newUser));
        setSession({ user: newUser });
        return { error: null };
      }

      // In offline mode, accept any password for existing users
      localStorage.setItem("local-auth-user", JSON.stringify(user));
      setSession({ user });
      return { error: null };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const signUp = async (email: string, _password: string, fullName?: string): Promise<{ error: string | null }> => {
    try {
      const db = await getDB();
      const users = await db.getAll("users");
      const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (existing) {
        return { error: "A user with this email already exists." };
      }

      const newUser: User = {
        id: generateId(),
        email: email.toLowerCase(),
        full_name: fullName || email.split("@")[0],
        role: "admin",
        created_at: now(),
      };

      await db.put("users", newUser);
      localStorage.setItem("local-auth-user", JSON.stringify(newUser));
      setSession({ user: newUser });
      return { error: null };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const signOut = async () => {
    localStorage.removeItem("local-auth-user");
    setSession(null);
  };

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    role: session?.user?.role ?? null,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
