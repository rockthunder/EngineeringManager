export function Soon({ title }: { title: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      <p className="lede muted">This screen is part of the build but not wired up yet.</p>
    </header>
  );
}
