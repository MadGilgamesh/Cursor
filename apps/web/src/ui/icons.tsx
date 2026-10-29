import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...props,
});

/** Dom — latarnia nad progiem. */
export const HomeIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9 3h6M10 3v2h4V3M8 5h8l1 3H7l1-3Z" />
    <path d="M8 8v9a4 4 0 0 0 8 0V8" />
    <path d="M12 11c1.2 1.2 1.2 3.4 0 4.6-1.2-1.2-1.2-3.4 0-4.6Z" />
    <path d="M6 21h12" />
  </svg>
);

/** Miasto — dachy i wieża portu. */
export const CityIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 21V12l4-3 4 3v9" />
    <path d="M11 21V7l3-4 3 4v14" />
    <path d="M17 21v-7h4v7" />
    <path d="M2 21h20M6 15h2M13.5 10h1M13.5 14h1" />
  </svg>
);

/** Mrok — oko z mackami. */
export const DarkIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M2.5 11c3-4.5 16-4.5 19 0-3 4.5-16 4.5-19 0Z" />
    <circle cx="12" cy="11" r="2.6" />
    <path d="M7 15c-.5 2.5-2 3.5-3.5 4M12 15.8v5M17 15c.5 2.5 2 3.5 3.5 4" />
  </svg>
);

/** Postać — sylwetka w owalnej ramce dagerotypu. */
export const CharacterIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <ellipse cx="12" cy="12" rx="8" ry="10" />
    <circle cx="12" cy="9.5" r="2.8" />
    <path d="M7.2 18c.8-2.6 2.6-4 4.8-4s4 1.4 4.8 4" />
  </svg>
);

/** Wspólnota — trzy postacie w kapturach. */
export const CommunityIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 4c1.8 0 3 1.6 3 3.5S13.8 11 12 11 9 9.4 9 7.5 10.2 4 12 4Z" />
    <path d="M6.5 20c0-3.2 2.4-6 5.5-6s5.5 2.8 5.5 6" />
    <path d="M6 7.5c-1.4 0-2.5 1.3-2.5 2.8S4.6 13 6 13M18 7.5c1.4 0 2.5 1.3 2.5 2.8S19.4 13 18 13" />
    <path d="M2 19c0-2 1-3.6 2.6-4.4M22 19c0-2-1-3.6-2.6-4.4" />
  </svg>
);

export const LockIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
