export function StubScreen({ title }: { title: string }) {
  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <h1>{title}</h1>
      <p style={{ color: 'var(--c-muted)' }}>Coming in a later phase.</p>
    </div>
  );
}
