import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";
import { sessionQuery } from "@/lib/queries";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await queryClient.ensureQueryData(sessionQuery);
    if (session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    // The login guard cached `null` in beforeLoad; drop it so the app layout
    // fetches the freshly-set session cookie instead of reusing that miss.
    queryClient.removeQueries({ queryKey: ["session"] });
    queryClient.removeQueries({ queryKey: ["projects"] });
    navigate({ to: "/", replace: true });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed.");
        return;
      }
      const data = result.data as { twoFactorRedirect?: boolean } | null;
      if (data?.twoFactorRedirect) {
        setNeeds2fa(true);
        return;
      }
      await finish();
    } catch {
      setError("Could not reach the vault API. Check the LAN URL and that the backend is running.");
    } finally {
      setPending(false);
    }
  }

  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (result.error) {
        setError(result.error.message ?? "That code did not work.");
        return;
      }
      await finish();
    } catch {
      setError("Could not verify the code. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="dotted-grid relative hidden flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        <div className="pointer-events-none absolute -top-40 -left-32 size-[32rem] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 size-[26rem] rounded-full bg-fuchsia-600/10 blur-3xl" />
        <Logo />
        <div className="relative max-w-lg">
          <p className="mb-4 text-xs font-medium tracking-[0.2em] text-purple-300 uppercase">
            Internal credential vault
          </p>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight">
            Every project&apos;s env,
            <br />
            in one safe place.
          </h1>
          <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-muted-foreground">
            Self-hosted env credentials for every Gremory project. Reveal, rotate
            and export with a full audit trail — no more `.env` files over chat.
          </p>
          <div className="mt-10 grid gap-4 text-sm">
            <Feature icon={<KeyRound className="size-4" />} title="Project → environment → key">
              Dev, staging and production credentials, versioned and reversible.
            </Feature>
            <Feature icon={<ShieldCheck className="size-4" />} title="Everything is logged">
              Every reveal, export and edit is attributed to a person.
            </Feature>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/70">
          envault · Gremory Pvt Ltd · internal use only
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">
            {needs2fa ? "Two-factor check" : "Sign in"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {needs2fa
              ? "Enter the 6-digit code from your authenticator app."
              : "Access is invite-only. Ask an admin for an account."}
          </p>

          {needs2fa ? (
            <form className="mt-8 space-y-5" onSubmit={onVerify}>
              <div className="space-y-2">
                <Label htmlFor="code">Authenticator code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="mono h-12 text-center text-lg tracking-[0.5em]"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending || code.length < 6}>
                {pending && <Loader2 className="animate-spin" />}
                Verify and continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setNeeds2fa(false);
                  setCode("");
                  setError(null);
                }}
              >
                Back to sign in
              </Button>
            </form>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@gremory.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Sign in
              </Button>
            </form>
          )}

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            First admin? Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem]">
              pnpm create-admin
            </code>{" "}
            on the server.
          </p>
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border/70 bg-card/40 p-3.5 backdrop-blur">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-purple-500/15 text-purple-300">
        {icon}
      </span>
      <span>
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {children}
        </span>
      </span>
    </div>
  );
}
