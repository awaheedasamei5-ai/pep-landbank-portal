import { useState } from 'react';
import styles from './PresetReasonPicker.module.css';

interface PresetReasonPickerProps {
  prompt: string;
  options: string[];
  continueLabel: string;
  onContinue: (reason: string) => void;
}

// ATTENDANCE_BLUEPRINT.md §3 steps 2 & 4 -- a preset dropdown + conditional
// custom field, not free text, for both the late-reason and off-site-
// reason wizard steps. "Other" is always the last option and reveals the
// custom text field; Continue stays disabled until a real reason exists
// (a non-"Other" pick is already a complete reason on its own).
export function PresetReasonPicker({ prompt, options, continueLabel, onContinue }: PresetReasonPickerProps) {
  const [choice, setChoice] = useState(options[0]);
  const [custom, setCustom] = useState('');
  const isOther = choice === 'Other';
  const canContinue = !isOther || custom.trim().length > 0;

  function submit() {
    if (!canContinue) return;
    onContinue(isOther ? custom.trim() : choice);
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.prompt}>{prompt}</p>
      <select className={styles.select} value={choice} onChange={(e) => setChoice(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {isOther && <input className={styles.customInput} placeholder="Briefly, what happened" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />}
      <button type="button" className={styles.continueBtn} onClick={submit} disabled={!canContinue}>
        {continueLabel}
      </button>
    </div>
  );
}
