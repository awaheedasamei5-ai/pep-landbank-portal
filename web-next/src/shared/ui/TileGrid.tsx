import styles from './TileGrid.module.css';

export type TileColor = 'purple' | 'teal' | 'blue' | 'orange';

export interface TileItem {
  key: string;
  label: string;
  sub?: string;
  color: TileColor;
  glyph: string;
  onOpen?: () => void;
}

// Port of tileGridHtml() (index.html:8558-8570) -- same {label, sub?, color}
// shape as the old items array, so porting real call sites later is close
// to mechanical. `glyph` stands in for the old fic() SVG icon for now (a
// single emoji/character) until the full Icon registry is widened.
export function TileGrid({ items }: { items: TileItem[] }) {
  return (
    <div className={styles.grid}>
      {items.map((it) => (
        <button key={it.key} type="button" className={styles.tile} disabled={!it.onOpen} onClick={it.onOpen}>
          <span className={`${styles.badge} ${styles[it.color]}`}>{it.glyph}</span>
          <span className={styles.label}>{it.label}</span>
          {it.sub && <span className={styles.sub}>{it.sub}</span>}
        </button>
      ))}
    </div>
  );
}
