import { NavLink } from 'react-router';

import { NAV_ITEMS } from './nav-items';

export function BottomNav() {
  return (
    <nav
      aria-label="Nawigacja główna"
      className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-brass-700/50 bg-abyss-950"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-1 pt-1.5">
        {NAV_ITEMS.map(({ to, label, Icon, featured }) => (
          <li key={to} className="flex justify-center">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'group flex min-h-14 w-full flex-col items-center justify-end gap-1 rounded-lg pb-1 text-xs tracking-wide uppercase transition-colors',
                  isActive ? 'text-brass-300' : 'text-bone-600 active:text-bone-400',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      featured
                        ? `-mt-7 grid size-14 place-items-center rounded-full border-2 bg-gradient-to-b from-abyss-700 to-abyss-900 shadow-glow transition ${
                            isActive
                              ? 'border-verdigris-300 text-verdigris-300'
                              : 'border-brass-500 text-brass-300'
                          }`
                        : `grid size-8 place-items-center transition ${isActive ? 'drop-shadow-[0_0_6px_rgb(216_184_120/0.7)]' : ''}`
                    }
                  >
                    <Icon className={featured ? 'size-7' : 'size-6'} />
                  </span>
                  <span className="font-display font-semibold">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
