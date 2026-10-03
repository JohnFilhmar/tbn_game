import type { PropKind } from '@tbn/contracts';
import type { PackManifest } from '@/game/assets/packManifest';
import { PROP_CATALOG, type PropCategory } from '@/game/props/catalog';
import { useBuildStore } from './buildStore';
import { newPlacement } from './draft';
import { nearestFit } from './placing';

const CATEGORIES: { category: PropCategory; title: string }[] = [
  { category: 'desks', title: 'Desks' },
  { category: 'work', title: 'The company' },
  { category: 'furniture', title: 'Furniture' },
  { category: 'lights', title: 'Lights' },
  { category: 'plants', title: 'Plants' },
  { category: 'storage', title: 'Storage' },
  { category: 'zones', title: 'Departments' },
];

const KINDS = Object.keys(PROP_CATALOG).filter(
  (kind): kind is PropKind => kind in PROP_CATALOG && kind !== 'computer_desk',
);

/** Props of `BuildCatalog`. */
export interface BuildCatalogProps {
  /** The pack being built, whose walls and doorways a new prop must keep clear. */
  manifest: PackManifest;
}

/**
 * Every prop the owner can add, by category. Picking one puts a new one in hand at the nearest
 * free spot to the middle of the view; a click on the floor, or Enter, drops it. There is one
 * computer, which can move but not multiply.
 */
export function BuildCatalog({ manifest }: BuildCatalogProps) {
  const hold = useBuildStore((state) => state.hold);
  const take = (kind: PropKind): void => {
    const { focus, history } = useBuildStore.getState();
    const fresh = newPlacement(kind, focus.x, focus.z, crypto.randomUUID());
    hold(nearestFit(manifest.bounds, manifest, fresh, history?.present.placements ?? []));
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
