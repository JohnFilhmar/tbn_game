import type { PropKind } from '@tbn/contracts';
import { PROP_CATALOG, type PropCategory } from '@/game/props/catalog';
import { useBuildStore } from './buildStore';
import { newPlacement } from './draft';

const CATEGORIES: { category: PropCategory; title: string }[] = [
  { category: 'desks', title: 'Desks' },
  { category: 'furniture', title: 'Furniture' },
  { category: 'plants', title: 'Plants' },
  { category: 'storage', title: 'Storage' },
  { category: 'zones', title: 'Departments' },
];

const KINDS = Object.keys(PROP_CATALOG).filter(
  (kind): kind is PropKind => kind in PROP_CATALOG && kind !== 'computer_desk',
);

/**
 * Every prop the owner can add, by category. Picking one puts a new one in hand at the middle of
 * the view; a click on the floor drops it. There is one computer, which can move but not multiply.
 */
export function BuildCatalog() {
  const hold = useBuildStore((state) => state.hold);
  const take = (kind: PropKind): void => {
    const { focus } = useBuildStore.getState();
    hold(newPlacement(kind, focus.x, focus.z, crypto.randomUUID()));
  };
  return (
    <div className="flex flex-col gap-3">
      {CATEGORIES.map(({ category, title }) => (
        <section key={category} className="flex flex-col gap-1.5" aria-label={title}>
          <h3 className="text-xs font-semibold tracking-widest text-slate-300 uppercase">
            {title}
          </h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {KINDS.filter((kind) => PROP_CATALOG[kind].category === category).map((kind) => (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => take(kind)}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-left text-sm text-slate-100 shadow-chunk hover:bg-slate-700 active:translate-y-px active:shadow-none"
                >
                  {PROP_CATALOG[kind].label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
