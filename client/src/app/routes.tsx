import type { ComponentType } from 'react';
import type { LazyRouteFunction, RouteObject } from 'react-router';
import { WorldLayout } from '@/game/WorldLayout';
import { SignInScreen } from '@/screens/signIn/SignInScreen';
import { DesktopLayout } from './DesktopLayout';
import { RequireSession } from './RequireSession';
import { RouteError } from './RouteError';

/** Loads a screen's code when its route is first opened, so the first page stays small. */
function screen(load: () => Promise<ComponentType>): LazyRouteFunction<RouteObject> {
  return async () => ({ Component: await load() });
}

/** The screens of the desk, which the in-world computer opens over the world. */
const DESK_ROUTES: RouteObject[] = [
  {
    path: 'agents',
    lazy: screen(() =>
      import('@/screens/agents/AgentsScreen').then((module) => module.AgentsScreen),
    ),
  },
  {
    path: 'agents/new',
    lazy: screen(() =>
      import('@/screens/agents/RecruitScreen').then((module) => module.RecruitScreen),
    ),
  },
  {
    path: 'agents/:agentId',
    lazy: screen(() =>
      import('@/screens/agents/agent/AgentScreen').then((module) => module.AgentScreen),
    ),
    children: [
      {
        index: true,
        lazy: screen(() =>
          import('@/screens/agents/agent/ChatTab').then((module) => module.ChatTab),
        ),
      },
      {
        path: 'profile',
        lazy: screen(() =>
          import('@/screens/agents/agent/ProfileTab').then((module) => module.ProfileTab),
        ),
      },
      {
        path: 'tools',
        lazy: screen(() =>
          import('@/screens/agents/agent/ToolsTab').then((module) => module.ToolsTab),
        ),
      },
      {
        path: 'runs',
        lazy: screen(() =>
          import('@/screens/agents/agent/RunsTab').then((module) => module.RunsTab),
        ),
      },
      {
        path: 'tasks',
        lazy: screen(() =>
          import('@/screens/agents/agent/TasksTab').then((module) => module.TasksTab),
        ),
      },
    ],
  },
  {
    path: 'departments',
    lazy: screen(() =>
      import('@/screens/departments/DepartmentsScreen').then((module) => module.DepartmentsScreen),
    ),
  },
  {
    path: 'tasks',
    lazy: screen(() => import('@/screens/tasks/TasksScreen').then((module) => module.TasksScreen)),
  },
  {
    path: 'tasks/:taskId',
    lazy: screen(() => import('@/screens/tasks/TaskScreen').then((module) => module.TaskScreen)),
  },
  {
    path: 'approvals',
    lazy: screen(() =>
      import('@/screens/approvals/ApprovalsScreen').then((module) => module.ApprovalsScreen),
    ),
  },
  {
    path: 'reports',
    lazy: screen(() =>
      import('@/screens/reports/ReportsScreen').then((module) => module.ReportsScreen),
    ),
  },
  {
    path: 'reports/:reportId',
    lazy: screen(() =>
      import('@/screens/reports/ReportScreen').then((module) => module.ReportScreen),
    ),
  },
  {
    path: 'repositories',
    lazy: screen(() =>
      import('@/screens/repositories/RepositoriesScreen').then(
        (module) => module.RepositoriesScreen,
      ),
    ),
  },
  {
    path: 'merge_requests',
    lazy: screen(() =>
      import('@/screens/mergeRequests/MergeRequestsScreen').then(
        (module) => module.MergeRequestsScreen,
      ),
    ),
  },
  {
    path: 'merge_requests/:mergeRequestId',
    lazy: screen(() =>
      import('@/screens/mergeRequests/MergeRequestScreen').then(
        (module) => module.MergeRequestScreen,
      ),
    ),
  },
  {
    path: 'sandbox_jobs',
    lazy: screen(() =>
      import('@/screens/sandboxJobs/SandboxJobsScreen').then((module) => module.SandboxJobsScreen),
    ),
  },
  {
    path: 'sandbox_jobs/:jobId',
    lazy: screen(() =>
      import('@/screens/sandboxJobs/SandboxJobScreen').then((module) => module.SandboxJobScreen),
    ),
  },
  {
    path: 'providers',
    lazy: screen(() =>
      import('@/screens/providers/ProvidersScreen').then((module) => module.ProvidersScreen),
    ),
  },
  {
    path: 'providers/new',
    lazy: screen(() =>
      import('@/screens/providers/NewProviderScreen').then((module) => module.NewProviderScreen),
    ),
  },
  {
    path: 'providers/:providerId',
    lazy: screen(() =>
      import('@/screens/providers/provider/ProviderScreen').then((module) => module.ProviderScreen),
    ),
  },
  {
    path: 'search_providers',
    lazy: screen(() =>
      import('@/screens/searchProviders/SearchProvidersScreen').then(
        (module) => module.SearchProvidersScreen,
      ),
    ),
  },
  {
    path: 'integrations',
    lazy: screen(() =>
      import('@/screens/integrations/IntegrationsLayout').then(
        (module) => module.IntegrationsLayout,
      ),
    ),
    children: [
      {
        index: true,
        lazy: screen(() =>
          import('@/screens/integrations/IntegrationsScreen').then(
            (module) => module.IntegrationsScreen,
          ),
        ),
      },
      {
        path: 'channels',
        lazy: screen(() =>
          import('@/screens/integrations/ChannelsScreen').then((module) => module.ChannelsScreen),
        ),
      },
      {
        path: 'log',
        lazy: screen(() =>
          import('@/screens/integrations/NotificationLogScreen').then(
            (module) => module.NotificationLogScreen,
          ),
        ),
      },
    ],
  },
  {
    path: 'integrations/new',
    lazy: screen(() =>
      import('@/screens/integrations/NewIntegrationScreen').then(
        (module) => module.NewIntegrationScreen,
      ),
    ),
  },
  {
    path: 'integrations/:integrationId',
    lazy: screen(() =>
      import('@/screens/integrations/IntegrationScreen').then((module) => module.IntegrationScreen),
    ),
  },
  {
    path: 'plugins',
    lazy: screen(() =>
      import('@/screens/plugins/PluginsScreen').then((module) => module.PluginsScreen),
    ),
  },
  {
    path: 'skills',
    lazy: screen(() =>
      import('@/screens/skills/SkillsScreen').then((module) => module.SkillsScreen),
    ),
  },
  {
    path: 'skills/:skillId',
    lazy: screen(() => import('@/screens/skills/SkillScreen').then((module) => module.SkillScreen)),
  },
  {
    path: 'instructions',
    lazy: screen(() =>
      import('@/screens/instructions/InstructionsScreen').then(
        (module) => module.InstructionsScreen,
      ),
    ),
  },
  {
    path: 'preferences',
    lazy: screen(() =>
      import('@/screens/preferences/PreferencesScreen').then((module) => module.PreferencesScreen),
    ),
  },
  {
    path: 'caches',
    lazy: screen(() =>
      import('@/screens/caches/CachesScreen').then((module) => module.CachesScreen),
    ),
  },
  { path: '*', element: <RouteError isMissing /> },
];

/** Every route of the client, under the `/app` base path: the world at `/`, the desk over it. */
export const APP_ROUTES: RouteObject[] = [
  { path: '/sign_in', element: <SignInScreen />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <WorldLayout />
      </RequireSession>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: null },
      { element: <DesktopLayout />, children: DESK_ROUTES },
    ],
  },
];
