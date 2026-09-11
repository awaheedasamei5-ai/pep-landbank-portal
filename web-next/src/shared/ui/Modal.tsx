import type { ReactNode } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Generic overlay + card chrome shared by every blocking step in the
// attendance sign-in wizard (ATTENDANCE_BLUEPRINT.md §3) -- title/close
// row + body, same visual language as ops-tracker's own modals. Clicking
// the backdrop or the close button both count as "cancel" for a wizard
// step, matching the blueprint's "cancelling aborts the entire sign-in"
// rule (the caller decides what onClose actually does).
export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.headTitle}>{title}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
