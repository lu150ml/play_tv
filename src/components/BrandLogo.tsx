import playTvLogo from "../assets/play-tv-logo-vibrant.png";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <img
      src={playTvLogo}
      alt="Play TV"
      className={["w-auto object-contain", compact ? "h-9" : "h-20"].join(" ")}
    />
  );
}
