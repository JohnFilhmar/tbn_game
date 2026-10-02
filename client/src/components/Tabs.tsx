import { NavLink } from 'react-router';
import { cx } from '@/lib/ui/cx';

/** One tab: where it leads and its name. */
export interface TabLink {
  to: string;
  label: string;
  /** Matches only the exact path, for the first tab of a screen. */
  end?: boolean;
}

/** Props of `TabLinks`. */
export interface TabLinksProps {
  label: string;
  tabs: readonly TabLink[];
}

/** Sections of a screen as links, so each has its own address and the back button works. */
export function TabLinks({ label, tabs }: TabLinksProps) {
  return (
    <nav aria-label={label} className="border-b border-slate-200 dark:border-slate-800">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cx(
                  'inline-block border-b-2 px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'border-teal-700 text-teal-800 dark:border-teal-400 dark:text-teal-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                )
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One choice of a `ChipGroup`. */
export interface Chip<Value extends string> {
  value: Value;
  label: string;
  count?: number;
}

/** Props of `ChipGroup`. */
export interface ChipGroupProps<Value extends string> {
  label: string;
  chips: ReadonlyArray<Chip<Value>>;
  value: Value;
  onChange: (value: Value) => void;
}

/** A filter: one of a few choices, each a toggle button. */
export function ChipGroup<Value extends string>({
  label,
  chips,
  value,
  onChange,
}: ChipGroupProps<Value>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = chip.value === value;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(chip.value)}
            className={cx(
              'rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset',
              isActive
                ? 'bg-teal-700 text-white ring-teal-700 dark:bg-teal-500 dark:text-slate-950 dark:ring-teal-500'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
            )}
          >
            {chip.label}
            {chip.count !== undefined && <span className="ml-1 opacity-80">{chip.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
