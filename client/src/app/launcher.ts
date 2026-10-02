/** One screen in the launcher. */
export interface LauncherItem {
  to: string;
  label: string;
}

/** A group of screens in the launcher. */
export interface LauncherSection {
  title: string;
  items: readonly LauncherItem[];
}

/** Every screen of the virtual desktop, as the launcher lists them. */
export const LAUNCHER: readonly LauncherSection[] = [
  {
    title: 'Company',
    items: [
      { to: '/agents', label: 'Agents' },
      { to: '/departments', label: 'Departments' },
      { to: '/tasks', label: 'Tasks' },
      { to: '/approvals', label: 'Approvals' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    title: 'Code',
    items: [
      { to: '/repositories', label: 'Repositories' },
      { to: '/merge_requests', label: 'Merge requests' },
      { to: '/sandbox_jobs', label: 'Sandbox jobs' },
    ],
  },
  {
    title: 'Connections',
    items: [
      { to: '/providers', label: 'Providers' },
      { to: '/search_providers', label: 'Search' },
      { to: '/integrations', label: 'Integrations' },
      { to: '/plugins', label: 'Plugins' },
    ],
  },
  {
    title: 'Knowledge',
    items: [
      { to: '/skills', label: 'Skills' },
      { to: '/instructions', label: 'Instructions' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { to: '/preferences', label: 'Preferences' },
      { to: '/caches', label: 'Cache savings' },
    ],
  },
];
