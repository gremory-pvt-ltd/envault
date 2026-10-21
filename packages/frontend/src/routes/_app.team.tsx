import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Member } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { initials, relativeTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { membersQuery, sessionQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
});

function TeamPage() {
  const members = useQuery(membersQuery);
  const session = useQuery(sessionQuery);
  const currentUser = session.data?.user as { id?: string; role?: string } | undefined;
  const isAdmin = currentUser?.role === "admin";

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [memberToBlock, setMemberToBlock] = useState<Member | null>(null);

  const createMember = useMutation({
    mutationFn: () =>
      api.members.create({
        name: name.trim(),
        email: email.trim(),
        role,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      setAddOpen(false);
      setName("");
      setEmail("");
      setRole("member");
      setTempPassword(result.tempPassword ?? null);
      if (!result.tempPassword) toast.success("Member added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMember = useMutation({
    mutationFn: (variables: { id: string; body: { role?: string; banned?: boolean } }) =>
      api.members.update(variables.id, variables.body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      setMemberToBlock(null);
      toast.success("Member updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPassword = useMutation({
    mutationFn: (member: Member) => api.members.resetPassword(member.id),
    onSuccess: (result) => setTempPassword(result.tempPassword),
    onError: (error: Error) => toast.error(error.message),
  });

  async function copyTempPassword() {
    if (!tempPassword) return;
    const copied = await copyToClipboard(tempPassword);
    toast[copied ? "success" : "error"](
      copied ? "Temporary password copied." : "Could not copy — select it manually.",
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-7 lg:px-10 lg:py-9">
      <PageHeader
        title="Team"
        description="Everyone with access to the vault. Members can reveal and manage secrets; admins manage projects and people."
        actions={
          isAdmin && (
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus /> Add member
            </Button>
          )
        }
      />

      <Card className="mt-6 gap-0 overflow-hidden p-0">
        {members.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : members.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">2FA</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead className="w-12 pr-5">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((member) => {
                const self = member.id === currentUser?.id;
                return (
                  <TableRow key={member.id}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8 rounded-lg">
                          <AvatarFallback className="rounded-lg bg-muted text-[0.65rem] font-medium">
                            {initials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{member.name}</span>
                            {self && (
                              <span className="text-[0.62rem] text-muted-foreground">(you)</span>
                            )}
                            {member.banned && (
                              <Badge variant="outline" className="border-red-400/30 text-[0.58rem] text-red-300">
                                blocked
                              </Badge>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          member.role === "admin"
                            ? "gap-1 bg-purple-500/15 text-purple-200"
                            : "font-normal text-muted-foreground"
                        }
                      >
                        {member.role === "admin" && <ShieldCheck className="size-3" />}
                        {member.role === "admin" ? "Admin" : "Member"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {member.twoFactorEnabled ? (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                          <ShieldCheck className="size-3.5" /> On
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Off</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {relativeTime(member.createdAt)}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {isAdmin && !self ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
                            aria-label={`Actions for ${member.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              disabled={member.banned ?? false}
                              onClick={() =>
                                updateMember.mutate({
                                  id: member.id,
                                  body: { role: member.role === "admin" ? "member" : "admin" },
                                })
                              }
                            >
                              {member.role === "admin" ? (
                                <>
                                  <ShieldOff /> Make member
                                </>
                              ) : (
                                <>
                                  <ShieldCheck /> Make admin
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => resetPassword.mutate(member)}>
                              <KeyRound /> Reset password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant={member.banned ? "default" : "destructive"}
                              onClick={() =>
                                member.banned
                                  ? updateMember.mutate({ id: member.id, body: { banned: false } })
                                  : setMemberToBlock(member)
                              }
                            >
                              {member.banned ? "Restore access" : "Block access"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-12 text-center">
            <Users className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No members yet.</p>
          </div>
        )}
      </Card>

      <p className="mt-3 text-[0.7rem] text-muted-foreground">
        Admins can create projects, manage environments and add people. Members can reveal,
        add, edit, import and export secrets in every environment.
      </p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              A temporary password is generated once. Share it over a secure channel; they can
              change it in Settings.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && email.trim()) createMember.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Aarav Sharma"
                maxLength={80}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="aarav@gremory.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as "admin" | "member")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value) =>
                      value === "admin"
                        ? "Admin — also manages projects and people"
                        : "Member — reveal and manage secrets"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — reveal and manage secrets</SelectItem>
                  <SelectItem value="admin">Admin — also manages projects and people</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || !email.trim() || createMember.isPending}
              >
                {createMember.isPending && <Loader2 className="animate-spin" />}
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tempPassword} onOpenChange={(open) => !open && setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              This is shown once. Share it with the member and ask them to change it after
              signing in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-3">
            <code className="mono flex-1 text-sm break-all">{tempPassword}</code>
            <Button size="icon-sm" variant="outline" onClick={copyTempPassword} aria-label="Copy password">
              <Copy />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!memberToBlock} onOpenChange={(open) => !open && setMemberToBlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {memberToBlock?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their sessions are revoked immediately and they cannot sign in until restored.
              Their audit history stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
              disabled={updateMember.isPending}
              onClick={() =>
                memberToBlock &&
                updateMember.mutate({ id: memberToBlock.id, body: { banned: true } })
              }
            >
              {updateMember.isPending && <Loader2 className="animate-spin" />}
              Block access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
