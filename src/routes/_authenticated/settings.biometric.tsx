import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Fingerprint, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/biometric")({
  component: BioPage,
});

const BIO_KEY = "storectrl:bio:email";

function BioPage() {
  const { user } = useAuth();
  const [enrolled, setEnrolled] = useState<string | null>(null);

  useEffect(() => {
    setEnrolled(localStorage.getItem(BIO_KEY));
  }, []);

  async function enroll() {
    if (!window.PublicKeyCredential) return toast.error("WebAuthn not supported on this device");
    try {
      await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: "StoreCtrl" },
          user: {
            id: new TextEncoder().encode(user!.id),
            name: user!.email!,
            displayName: user!.email!,
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { userVerification: "required" },
          timeout: 60000,
        },
      });
      localStorage.setItem(BIO_KEY, user!.email!);
      setEnrolled(user!.email!);
      toast.success("Biometric enrolled on this device");
    } catch {
      toast.error("Enrollment cancelled");
    }
  }

  function remove() {
    localStorage.removeItem(BIO_KEY);
    setEnrolled(null);
    toast.success("Removed from this device");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Biometric Login</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />This device</CardTitle>
          <CardDescription>
            After enrolling, you can use Face ID, Touch ID, Windows Hello, or your device's fingerprint
            to quickly request a sign-in link without typing your email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {enrolled ? (
            <>
              <div className="text-sm">Enrolled as <span className="font-medium">{enrolled}</span></div>
              <Button variant="outline" onClick={remove}><Trash2 className="h-4 w-4 mr-2" />Remove from this device</Button>
            </>
          ) : (
            <Button onClick={enroll}><Fingerprint className="h-4 w-4 mr-2" />Enroll biometric</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}