import { Navigate, type RouteObject } from 'react-router';
import { AgentsScreen } from '@/screens/agents/AgentsScreen';
import { AgentScreen } from '@/screens/agents/agent/AgentScreen';
import { ChatTab } from '@/screens/agents/agent/ChatTab';
import { ProfileTab } from '@/screens/agents/agent/ProfileTab';
import { RunsTab } from '@/screens/agents/agent/RunsTab';
import { TasksTab } from '@/screens/agents/agent/TasksTab';
import { ToolsTab } from '@/screens/agents/agent/ToolsTab';
import { RecruitScreen } from '@/screens/agents/RecruitScreen';
import { SignInScreen } from '@/screens/signIn/SignInScreen';
import { DesktopLayout } from './DesktopLayout';
import { RequireSession } from './RequireSession';
import { RouteError } from './RouteError';

/** Every route of the client, under the `/app` base path. */
export const APP_ROUTES: RouteObject[] = [
  { path: '/sign_in', element: <SignInScreen />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <DesktopLayout />
      </RequireSession>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/agents" replace /> },
      { path: 'agents', element: <AgentsScreen /> },
      { path: 'agents/new', element: <RecruitScreen /> },
      {
        path: 'agents/:agentId',
        element: <AgentScreen />,
        children: [
          { index: true, element: <ChatTab /> },
          { path: 'profile', element: <ProfileTab /> },
          { path: 'tools', element: <ToolsTab /> },
          { path: 'runs', element: <RunsTab /> },
          { path: 'tasks', element: <TasksTab /> },
        ],
      },
      { path: '*', element: <RouteError isMissing /> },
    ],
  },
];
