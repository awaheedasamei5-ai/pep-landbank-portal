import { avatarTone, initials } from '../lib/avatar';
import styles from './Avatar.module.css';

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span className={`${styles.avatar} ${styles[`tone_${avatarTone(name)}`]}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} title={name}>
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className={styles.stack}>
      {shown.map((n, i) => (
        <span key={n + i} className={styles.stackItem} style={{ zIndex: shown.length - i }}>
          <Avatar name={n} size={24} />
        </span>
      ))}
      {extra > 0 && (
        <span className={styles.stackItem} style={{ zIndex: 0 }}>
          <span className={`${styles.avatar} ${styles.tone_more}`} style={{ width: 24, height: 24, fontSize: 10 }}>
            +{extra}
          </span>
        </span>
      )}
    </span>
  );
}
