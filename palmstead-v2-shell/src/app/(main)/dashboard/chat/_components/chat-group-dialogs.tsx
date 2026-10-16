// Real group creation + group info/member-management UI
// (15-chat-whatsapp-full-replica.md). Member add/remove/promote and
// settings changes are enforced for real by the chat_group_members /
// chat_groups RLS policies, not just hidden by the UI.
"use client";

import { useState } from "react";

import { Crown, LogOut, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getInitials } from "@/lib/utils";
import type { DirectoryStaff } from "@/app/(main)/dashboard/directory/_components/use-directory";

import {
  useAddGroupMember,
  useCreateGroup,
  useRemoveGroupMember,
  useSetGroupMemberRole,
  useUpdateGroupSettings,
  type ChatGroup,
} from "./use-chat-groups";

export function NewGroupDialog({
  open,
  onOpenChange,
  myKey,
  myName,
  staff,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  myKey: string;
  myName: string | undefined;
  staff: DirectoryStaff[];
  onCreated: (groupId: string) => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<DirectoryStaff[]>([]);
  const [pickValue, setPickValue] = useState<DirectoryStaff | null>(null);
  const createGroup = useCreateGroup(myKey, myName);
  const others = staff.filter((s) => s.agentKey !== myKey && !picked.some((p) => p.agentKey === s.agentKey));

  async function submit() {
    if (!name.trim() || picked.length === 0) return;
    try {
      const groupId = await createGroup.mutateAsync({ name: name.trim(), memberKeys: picked.map((p) => ({ key: p.agentKey, name: p.name })) });
      setName("");
      setPicked([]);
      onOpenChange(false);
      onCreated(groupId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the group");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />

        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <span key={p.agentKey} className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                {p.name}
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPicked(picked.filter((x) => x.agentKey !== p.agentKey))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Combobox
          items={others}
          itemToStringLabel={(s: DirectoryStaff) => s.name}
          isItemEqualToValue={(a: DirectoryStaff, b: DirectoryStaff) => a.agentKey === b.agentKey}
          value={pickValue}
          onValueChange={(v) => {
            const s = v as DirectoryStaff | null;
            if (s) setPicked([...picked, s]);
            setPickValue(null);
          }}
        >
          <ComboboxInput placeholder="Add members…" showTrigger={false} />
          <ComboboxContent className="pointer-events-auto">
            <ComboboxEmpty>No staff found</ComboboxEmpty>
            <ComboboxList>
              {(item: DirectoryStaff) => (
                <ComboboxItem key={item.agentKey} value={item} onClick={() => setPicked([...picked, item])}>
                  {item.name}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <Button onClick={() => void submit()} disabled={!name.trim() || picked.length === 0 || createGroup.isPending} className="w-full">
          Create group
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function GroupInfoDialog({
  open,
  onOpenChange,
  group,
  myKey,
  staff,
  onLeft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: ChatGroup | null;
  myKey: string;
  staff: DirectoryStaff[];
  onLeft: () => void;
}) {
  const [addValue, setAddValue] = useState<DirectoryStaff | null>(null);
  const addMember = useAddGroupMember(group?.id ?? "");
  const removeMember = useRemoveGroupMember(group?.id ?? "");
  const setRole = useSetGroupMemberRole(group?.id ?? "");
  const updateSettings = useUpdateGroupSettings(group?.id ?? "");

  if (!group) return null;
  const myRole = group.members.find((m) => m.staffKey === myKey)?.role;
  const isAdmin = myRole === "admin";
  const others = staff.filter((s) => s.agentKey !== myKey && !group.members.some((m) => m.staffKey === s.agentKey));

  async function leave() {
    try {
      await removeMember.mutateAsync(myKey);
      onOpenChange(false);
      onLeft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave the group");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{group.name}</DialogTitle>
        </DialogHeader>

        {isAdmin && (
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <Label htmlFor="only-admins-send" className="text-sm">
              Only admins can send messages
            </Label>
            <Switch
              id="only-admins-send"
              checked={group.onlyAdminsCanSend}
              onCheckedChange={(v) => updateSettings.mutate({ onlyAdminsCanSend: v })}
            />
          </div>
        )}

        <div className="text-muted-foreground text-xs">{group.members.length} members</div>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {group.members.map((m) => (
            <div key={m.staffKey} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <Avatar className="size-8">
                <AvatarFallback className="bg-muted text-foreground text-xs">{getInitials(m.staffName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{m.staffName}</div>
                {m.role === "admin" && <div className="flex items-center gap-1 text-[#1DA851] text-xs dark:text-[#00A884]"><Crown className="size-3" /> Admin</div>}
              </div>
              {isAdmin && m.staffKey !== myKey && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.role === "admin" ? `Remove admin from ${m.staffName}` : `Make ${m.staffName} admin`}
                    onClick={() => setRole.mutate({ staffKey: m.staffKey, role: m.role === "admin" ? "member" : "admin" })}
                  >
                    <Crown className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${m.staffName}`} onClick={() => removeMember.mutate(m.staffKey)}>
                    <UserMinus className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <Combobox
            items={others}
            itemToStringLabel={(s: DirectoryStaff) => s.name}
            isItemEqualToValue={(a: DirectoryStaff, b: DirectoryStaff) => a.agentKey === b.agentKey}
            value={addValue}
            onValueChange={(v) => {
              const s = v as DirectoryStaff | null;
              if (s) addMember.mutate({ key: s.agentKey, name: s.name });
              setAddValue(null);
            }}
          >
            <ComboboxInput placeholder="Add a member…" showTrigger={false} />
            <ComboboxContent className="pointer-events-auto">
              <ComboboxEmpty>No staff found</ComboboxEmpty>
              <ComboboxList>
                {(item: DirectoryStaff) => (
                  <ComboboxItem key={item.agentKey} value={item} onClick={() => addMember.mutate({ key: item.agentKey, name: item.name })}>
                    <UserPlus className="size-4" /> {item.name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        )}

        <Button type="button" variant="outline" className="w-full text-destructive" onClick={() => void leave()}>
          <LogOut className="size-4" /> Leave group
        </Button>
      </DialogContent>
    </Dialog>
  );
}
