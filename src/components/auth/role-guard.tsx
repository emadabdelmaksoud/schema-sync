import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { can, isAdmin, type Action, type Resource } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";

interface RoleGuardProps {
  children: ReactNode;
  /** Require admin role. Overrides resource/action when set. */
  adminOnly?: boolean;
  resource?: Resource;
  action?: Action;
  /** Optional fallback when access is denied. Defaults to a styled message. */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on the current user's role and granular permissions.
 * Use for both page-level guards and inline UI gating.
 */
export function RoleGuard({ children, adminOnly, resource, action = "view", fallback }: RoleGuardProps) {
  const { role, loading } = useAuth();
  if (loading) return null;

  const allowed = adminOnly ? isAdmin(role) : resource ? can(role, resource, action) : true;
  if (allowed) return <>{children}</>;

  return (
    fallback ?? (
      <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <h2 className="text-lg font-semibold">Access denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have permission to view this section. Contact an administrator if you believe this is a mistake.
        </p>
      </div>
    )
  );
}
