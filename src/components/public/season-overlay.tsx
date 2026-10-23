import type { CSSProperties } from "react";

// Decoration only: every element is aria-hidden, ignores pointer input, and stops animating for
// visitors who ask their device to reduce motion.
const COUNT = 22;

const STYLE = `
.cms-season{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50}
.cms-season__item{position:absolute;top:-10%;display:block;animation-name:cms-fall;animation-timing-function:linear;animation-iteration-count:infinite}
.cms-season--spring .cms-season__item{width:10px;height:8px;border-radius:70% 0 70% 0;background:#f9a8d4;opacity:.8}
.cms-season--summer .cms-season__item{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle,#fde68a 0,#fbbf24 45%,transparent 70%);opacity:.7}
.cms-season--autumn .cms-season__item{width:12px;height:9px;border-radius:0 80% 0 80%;background:#d97706;opacity:.85}
.cms-season--winter .cms-season__item{width:6px;height:6px;border-radius:50%;background:#ffffff;box-shadow:0 0 3px rgba(255,255,255,.8);opacity:.9}
@keyframes cms-fall{from{transform:translate3d(0,0,0) rotate(0deg)}to{transform:translate3d(30px,110vh,0) rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.cms-season{display:none}}
`;

export function SeasonOverlay({ season }: { season: "spring" | "summer" | "autumn" | "winter" }) {
  const items = Array.from({ length: COUNT }, (_, i) => {
    // Positions and timings are fixed per index, so server and browser render the same markup.
    const left = (i * 37) % 100;
    const delay = ((i * 13) % 20) * -1;
    const duration = 9 + ((i * 7) % 8);
    const style: CSSProperties = {
      left: `${left}%`,
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
    };
    return <span key={i} className="cms-season__item" style={style} />;
  });
  return (
    <div className={`cms-season cms-season--${season}`} aria-hidden="true">
      <style>{STYLE}</style>
      {items}
    </div>
  );
}
