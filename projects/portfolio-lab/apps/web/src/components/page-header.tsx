export function PageHeader({
  title,
  subtitle,
}: Readonly<{ title: string; subtitle?: string }>): React.JSX.Element {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-primary">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-secondary">{subtitle}</p> : null}
    </header>
  );
}
