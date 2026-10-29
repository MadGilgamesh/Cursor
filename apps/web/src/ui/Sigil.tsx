/** Dekoracyjny znak: oko w kręgu z mackami promieni. Czysto ozdobny (aria-hidden). */
export function Sigil({ className = '' }: { className?: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="sigil-iris" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8fdcc0" />
          <stop offset="55%" stopColor="#3e9f86" />
          <stop offset="100%" stopColor="#0d0f14" />
        </radialGradient>
      </defs>
      <g stroke="#a8844a" strokeWidth="1.2" fill="none" opacity="0.8">
        <circle cx="100" cy="100" r="92" />
        <circle cx="100" cy="100" r="84" strokeDasharray="2 6" />
        {rays.map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle} 100 100)`}
            d="M100 16 C 96 30, 104 38, 100 52"
            strokeLinecap="round"
          />
        ))}
      </g>
      <path
        d="M30 100 C 60 58, 140 58, 170 100 C 140 142, 60 142, 30 100 Z"
        fill="#07080b"
        stroke="#d8b878"
        strokeWidth="2"
      />
      <circle cx="100" cy="100" r="26" fill="url(#sigil-iris)" />
      <ellipse cx="100" cy="100" rx="5" ry="20" fill="#07080b" />
    </svg>
  );
}
