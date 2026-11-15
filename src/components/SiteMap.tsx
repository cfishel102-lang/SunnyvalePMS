import Link from "next/link";

export type Pin = {
  name: string;
  x: number;
  y: number;
  /** Fill colour. */
  color: string;
  /** Text colour; defaults to white. */
  text?: string;
  href?: string;
  title?: string;
  /** Faded and not clickable-looking, e.g. a site that is taken. */
  dim?: boolean;
};

/**
 * The park map with a round marker on each site's printed number.
 * Markers are sized relative to the map so they scale with it on any screen.
 */
export function SiteMap({ src, pins, alt }: { src: string; pins: Pin[]; alt: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line" style={{ containerType: "inline-size" }}>
      <img src={src} alt={alt} className="block w-full" />
      {pins.map((p) => {
        const style: React.CSSProperties = {
          left: `${p.x}%`, top: `${p.y}%`, width: "2.5cqw", height: "2.5cqw", fontSize: "1.05cqw",
          background: p.color, color: p.text ?? "#fff", opacity: p.dim ? 0.45 : 1,
        };
        const cls = "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold tabular-nums shadow ring-1 ring-white/80";
        return p.href ? (
          <Link key={p.name} href={p.href} title={p.title} style={style} className={`${cls} transition hover:z-10 hover:scale-150`}>{p.name}</Link>
        ) : (
          <span key={p.name} title={p.title} style={style} className={cls}>{p.name}</span>
        );
      })}
    </div>
  );
}
