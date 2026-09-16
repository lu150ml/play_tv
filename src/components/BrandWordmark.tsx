export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <p
      aria-label="Play TV"
      className={[
        "font-display font-bold tracking-[-0.045em]",
        compact ? "text-xl" : "text-3xl"
      ].join(" ")}
    >
      <span className="text-on-surface">Play</span>
      <span className="ml-1.5 text-primary">TV</span>
    </p>
  );
}
