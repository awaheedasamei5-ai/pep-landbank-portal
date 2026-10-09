"use client";

import { Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDeletePlannedLeave, useSendPlannedLeave } from '../hooks/useLeaveRequests';
import type { LeaveRequest } from '../../../types/domain';

// Row actions for a still-'planned' draft: send to Management now, or
// delete outright. Used as LeaveRequestsDataTable's actionSlot wherever
// planned drafts are listed.
export function PlannedRowActions({ request }: { request: LeaveRequest }) {
  const sendPlanned = useSendPlannedLeave();
  const remove = useDeletePlannedLeave();
  if (request.status !== 'planned') return null;
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Send to Management now" disabled={sendPlanned.isPending} onClick={() => sendPlanned.mutate(request.id)}>
        <Send />
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Delete request">
            <Trash2 />
          </Button>
        }
        title="Delete this planned leave?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync(request.id)}
      />
    </>
  );
}
