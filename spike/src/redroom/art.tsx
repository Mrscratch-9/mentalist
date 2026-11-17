// Original artwork for the Red room (no actor likeness). Shapes follow design/mentalist-home/02-red-room.html.
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;
const NS = "http://www.w3.org/2000/svg";

export function Smiley(props: Props) {
  return (
    <svg xmlns={NS} viewBox="0 0 64 74" {...props}>
      <g fill="none" stroke="#e0283a" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 6 C46 5 58 16 58 30 C58 44 47 55 32 55 C17 55 6 44 6 30 C6 16 18 6.5 33 7.5" strokeWidth="5" />
        <path d="M20 40 C26 47 38 47 44 40" strokeWidth="4.5" />
        <path d="M14 54 L14 66" strokeWidth="3" />
        <path d="M33 55 L33 71" strokeWidth="3.5" />
        <path d="M50 50 L50 60" strokeWidth="2.5" />
      </g>
      <g fill="#e0283a">
        <circle cx="22" cy="25" r="3.8" /><circle cx="42" cy="25" r="3.8" />
        <circle cx="14" cy="67" r="2.4" /><circle cx="33" cy="71.5" r="2.8" /><circle cx="50" cy="61" r="2" />
      </g>
    </svg>
  );
}

// Patrick Jane style silhouette: three-piece suit, wavy hair, hand in pocket (generic).
export function SilJane(props: Props) {
  return (
    <svg xmlns={NS} viewBox="0 0 60 80" {...props}>
      <g fill="#070606">
        <circle cx="30" cy="14" r="7.2" />
        <circle cx="23.5" cy="9.5" r="4.4" /><circle cx="30" cy="6.5" r="5" /><circle cx="36.5" cy="9.5" r="4.4" />
        <circle cx="21.5" cy="15" r="3.4" /><circle cx="38.5" cy="15" r="3.4" /><circle cx="24" cy="19" r="2.4" />
        <rect x="27" y="19" width="6" height="6" />
        <path d="M13 80 L14 38 Q15 27 27 24 L30 30 L33 24 Q45 27 46 38 L47 80 Z" />
        <path d="M14 38 L8 60 L14 63 L20 48 Z" />
        <path d="M46 38 L50 52 Q47 58 41 58 L40 50 Z" />
      </g>
      <path d="M27 24 L30 30 L33 24 L30 50 Z" fill="#1d1915" />
      <path d="M30 30 L24 48 L30 66 L36 48 Z" fill="none" stroke="#3b342b" strokeWidth="1" />
      <path d="M21 56 H27 M33 56 H39" stroke="#3b342b" strokeWidth="1" />
    </svg>
  );
}

// CBI team silhouette: three agents with badge on belt and holster.
export function SilCbi(props: Props) {
  return (
    <svg xmlns={NS} viewBox="0 0 90 80" {...props}>
      <g fill="#070606">
        <circle cx="45" cy="13" r="6.5" /><rect x="42" y="18" width="6" height="5" />
        <path d="M31 80 L32 36 Q33 25 45 23 Q57 25 58 36 L59 80 Z" />
        <circle cx="20" cy="26" r="5.8" /><rect x="17.5" y="30" width="5" height="4" />
        <path d="M7 80 L8 46 Q9 35 20 33 Q30 35 31 46 L32 80 Z" />
        <circle cx="70" cy="26" r="5.8" /><rect x="67.5" y="30" width="5" height="4" />
        <path d="M58 80 L59 46 Q60 35 70 33 Q81 35 82 46 L83 80 Z" />
      </g>
      <rect x="36" y="52" width="5" height="4" fill="#d9b25a" />
      <path d="M54 50 h4 v11 h-4 z" fill="#1d1915" stroke="#4a4136" strokeWidth="1" />
      <rect x="11" y="56" width="4" height="3" fill="#d9b25a" />
      <path d="M26 56 h4 v9 h-4 z" fill="#1d1915" stroke="#4a4136" strokeWidth="1" />
      <rect x="62" y="56" width="4" height="3" fill="#d9b25a" />
    </svg>
  );
}

export function Check(props: Props) {
  return (
    <svg viewBox="0 0 16 16" {...props}>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 8.3 L7 10.8 L11.6 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Lock(props: Props) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="#aca295" strokeWidth="1.6" />
      <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" fill="none" stroke="#aca295" strokeWidth="1.6" />
      <circle cx="12" cy="16" r="1.5" fill="#aca295" />
    </svg>
  );
}

// Gold landmark (CBI headquarters).
export function Landmark(props: Props) {
  return (
    <svg xmlns={NS} viewBox="0 0 24 24" {...props}>
      <path d="M3 21 V10 L12 4 L21 10 V21 Z" fill="#151110" stroke="#d9b25a" strokeWidth="1.6" />
      <path d="M8 21 V14 H16 V21 M12 4 V1.5" fill="none" stroke="#d9b25a" strokeWidth="1.4" />
    </svg>
  );
}

export function Ring({ color, dash }: { color: string; dash?: boolean }) {
  return (
    <svg xmlns={NS} viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="3" strokeDasharray={dash ? "7 7" : undefined} />
    </svg>
  );
}

export function Glow({ color }: { color: string }) {
  return (
    <svg xmlns={NS} viewBox="0 0 64 64" width="64" height="64">
      <defs>
        <radialGradient id="g"><stop offset="0" stopColor={color} stopOpacity=".7" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#g)" />
    </svg>
  );
}

// Same React artwork, serialized for deck.gl icon atlases.
export const toDataUri = (el: ReactElement) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(renderToStaticMarkup(el));
