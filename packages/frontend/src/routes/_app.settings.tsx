import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { copyToClipboard } from "@/lib/clipboard";
import { absoluteDate, initials } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { sessionQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

interface TwoFactorSetup {
  totpURI: string;
  backupCodes: string[];
}

function SettingsPage() {
  const navigate = useNavigate();
  const session = useQuery(sessionQuery);
  const user = session.data?.user as
    | {
        id: string;
        name: string;
        email: string;
        role?: string | null;
        twoFactorEnabled?: boolean | null;
        createdAt?: string;
      }
    | undefined;

  const [name, setName] = useState("");
  const [nameReady, setNameReady] = useState(false);
  const [profilePending, setProfilePending] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  const [enableOpen, setEnableOpen] = useState(false);
  const [enablePassword, setEnablePassword] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [twoFactorPending, setTwoFactorPending] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  useEffect(() => {
    if (user && !nameReady) {
      setName(user.name);
      setNameReady(true);
    }
  }, [user, nameReady]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setProfilePending(true);
    try {
      const result = await authClient.updateUser({ name: name.trim() });
      if (result.error) {
        toast.error(result.error.message ?? "Could not update profile.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Profile updated.");
    } finally {
      setProfilePending(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }
    setPasswordPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Could not change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed. Other sessions were signed out.");
    } finally {
      setPasswordPending(false);
    }
  }

  async function startEnable(event: React.FormEvent) {
    event.preventDefault();
    setTwoFactorPending(true);
    try {
      const result = await authClient.twoFactor.enable({ password: enablePassword });
      if (result.error) {
        toast.error(result.error.message ?? "Could not start 2FA setup.");
        return;
      }
      setSetup(result.data as TwoFactorSetup);
      setEnablePassword("");
    } finally {
      setTwoFactorPending(false);
    }
  }

  async function confirmEnable(event: React.FormEvent) {
    event.preventDefault();
    setTwoFactorPending(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: verifyCode.trim() });
      if (result.error) {
        toast.error(result.error.message ?? "That code did not work.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Two-factor authentication is on.");
      closeEnable();
    } finally {
      setTwoFactorPending(false);
    }
  }

  function closeEnable() {
    setEnableOpen(false);
    setSetup(null);
    setVerifyCode("");
    setEnablePassword("");
  }

  async function disableTwoFactor(event: React.FormEvent) {
    event.preventDefault();
    setTwoFactorPending(true);
    try {
      const result = await authClient.twoFactor.disable({ password: disablePassword });
      if (result.error) {
        toast.error(result.error.message ?? "Could not disable 2FA.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      setDisableOpen(false);
      setDisablePassword("");
      toast.success("Two-factor authentication is off.");
    } finally {
      setTwoFactorPending(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    navigate({ to: "/login", replace: true });
  }

  async function copy(value: string) {
    const copied = await copyToClipboard(value);
    toast[copied ? "success" : "error"](copied ? "Copied." : "Could not copy.");
  }

  const secret = setup ? extractTotpSecret(setup.totpURI) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-7 lg:px-10 lg:py-9">
      <PageHeader
        title="Settings"
        description="Your account, password and second factor."
        actions={
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        }
      />

      {user ? (
        <div className="mt-6 mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/25 to-violet-600/20 text-xs font-semibold text-purple-200">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              Joined {user.createdAt ? absoluteDate(user.createdAt) : "—"}
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto capitalize">
            {user.role ?? "member"}
          </Badge>
        </div>
      ) : (
        <Skeleton className="mt-6 mb-6 h-16" />
      )}

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your display name across the vault.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveProfile}>
              <div className="space-y-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" value={user?.email ?? ""} disabled />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || name === user?.name || profilePending}
              >
                {profilePending && <Loader2 className="animate-spin" />}
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Changing your password signs out your other sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={changePassword}>
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={!currentPassword || newPassword.length < 8 || passwordPending}
              >
                {passwordPending && <Loader2 className="animate-spin" />}
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Two-factor authentication
                {user?.twoFactorEnabled ? (
                  <Badge variant="secondary" className="gap-1 bg-emerald-400/15 text-emerald-300">
                    <Check className="size-3" /> On
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-muted-foreground">
                    Off
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Require a TOTP code from an authenticator app at sign-in.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {user?.twoFactorEnabled ? (
              <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)}>
                <ShieldOff /> Disable 2FA
              </Button>
            ) : (
              <Button size="sm" onClick={() => setEnableOpen(true)}>
                <ShieldCheck /> Enable 2FA
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Recommended for every admin. Works with 1Password, Authy, Google Authenticator.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This device</CardTitle>
            <CardDescription>
              You are signed in with an httpOnly session cookie on the API origin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={enableOpen}
        onOpenChange={(open) => {
          if (!open) closeEnable();
          else setEnableOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enable two-factor authentication</DialogTitle>
            <DialogDescription>
              {setup
                ? "Add the secret to your authenticator, then enter the 6-digit code to confirm."
                : "Confirm your password to start setup."}
            </DialogDescription>
          </DialogHeader>

          {!setup ? (
            <form className="space-y-4" onSubmit={startEnable}>
              <div className="space-y-2">
                <Label htmlFor="enable-password">Password</Label>
                <Input
                  id="enable-password"
                  type="password"
                  autoComplete="current-password"
                  value={enablePassword}
                  onChange={(event) => setEnablePassword(event.target.value)}
                  required
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeEnable}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!enablePassword || twoFactorPending}>
                  {twoFactorPending && <Loader2 className="animate-spin" />}
                  Continue
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Secret key
                </p>
                <div className="flex items-center gap-2">
                  <code className="mono flex-1 text-sm break-all">{secret ?? setup.totpURI}</code>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => copy(secret ?? setup.totpURI)}
                    aria-label="Copy secret"
                  >
                    <Copy />
                  </Button>
                </div>
                {secret && (
                  <p className="mono mt-2 text-[0.6rem] break-all text-muted-foreground/70">
                    {setup.totpURI}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <KeyRound className="size-3.5" /> Backup codes — save these now
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {setup.backupCodes.map((backupCode) => (
                    <code key={backupCode} className="mono text-[0.7rem]">
                      {backupCode}
                    </code>
                  ))}
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-2.5"
                  onClick={() => copy(setup.backupCodes.join("\n"))}
                >
                  <Copy /> Copy all
                </Button>
              </div>

              <form className="space-y-3" onSubmit={confirmEnable}>
                <div className="space-y-2">
                  <Label htmlFor="verify-code">6-digit code</Label>
                  <Input
                    id="verify-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(event) => setVerifyCode(event.target.value)}
                    className="mono text-center tracking-[0.4em]"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={closeEnable}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={verifyCode.length < 6 || twoFactorPending}>
                    {twoFactorPending && <Loader2 className="animate-spin" />}
                    Turn on 2FA
                  </Button>
                </DialogFooter>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              Your account will only need a password. Confirm your password to continue.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={disableTwoFactor}>
            <div className="space-y-2">
              <Label htmlFor="disable-password">Password</Label>
              <Input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDisableOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!disablePassword || twoFactorPending}
              >
                {twoFactorPending && <Loader2 className="animate-spin" />}
                Disable 2FA
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractTotpSecret(uri: string): string | null {
  try {
    return new URL(uri).searchParams.get("secret");
  } catch {
    return null;
  }
}
