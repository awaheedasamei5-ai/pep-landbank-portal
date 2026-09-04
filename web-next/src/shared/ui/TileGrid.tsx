import { Icon, type IconName } from './Icon';
import styles from './TileGrid.module.css';

export type TileColor = 'purple' | 'teal' | 'blue' | 'orange' | 'green' | 'red';

export interface TileItem {
  key: string;
  label: string;
  sub?: string;
  color: TileColor;
  icon: IconName;
  onOpen?: () => void;
}

// Port of tileGridHtml() (index.html:8558-8570) -- same {label, sub?, color}
// shape as the old items array. `icon` used to be a raw emoji glyph
// standing in for a real icon (see the git history) -- now the real thing,
// once the registry was widened past the 5 bottom-nav icons.
export function TileGrid({ items }: { items: TileItem[] }) {
  return (
    <div className={styles.grid}>
      {items.map((it) => (
        <button key={it.key} type="button" className={styles.tile} disabled={!it.onOpen} onClick={it.onOpen}>
          <span className={`${styles.badge} ${styles[it.color]}`}>
            <Icon name={it.icon} size={20} />
          </span>
          <span className={styles.textCol}>
            <span className={styles.label}>{it.label}</span>
            {it.sub && <span className={styles.sub}>{it.sub}</span>}
          </span>
          <span className={styles.chev}>
            <Icon name="chevronRight" size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}
