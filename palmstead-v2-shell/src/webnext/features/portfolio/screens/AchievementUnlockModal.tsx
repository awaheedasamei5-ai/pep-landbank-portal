'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AchievementDef } from '../../../types/domain';
import styles from './AchievementUnlockModal.module.css';

// Port of index.html's openAchievementUnlockModal() (index.html:
// 20149-20165) -- the "successCard/successCheckWrap" celebration
// component adapted into a trophy-unlock variant. docs/plans/
// 21-my-portfolio-plan.md: a real shadcn Dialog (focus trap, Escape to
// close, accessible labelling for free) rather than the hand-rolled
// overlay div index.html used.
export function AchievementUnlockModal({ def, onClose }: { def: AchievementDef | null; onClose: () => void }) {
  return (
    <Dialog open={!!def} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="sr-only">Achievement unlocked</DialogTitle>
        </DialogHeader>
        {def && (
          <>
            <div className={styles.badgeWrap}>
              <div className={styles.burst} />
              <div className={styles.badge}>{def.icon || '🏆'}</div>
            </div>
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Achievement unlocked!</div>
            <div className="text-lg font-bold">{def.label}</div>
            {def.description && <p className="text-sm text-muted-foreground">{def.description}</p>}
            {def.points > 0 && (
              <Badge variant="outline" className="mx-auto mt-1 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                +{def.points} points
              </Badge>
            )}
            <Button type="button" className="mt-4 w-full" onClick={onClose}>
              Nice!
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
