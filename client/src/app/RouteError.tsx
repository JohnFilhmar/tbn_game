import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { buttonClasses } from '@/components/Button';

/** Props of `RouteError`. */
export interface RouteErrorProps {
  /** The address matches no screen. */
  isMissing?: boolean;
}

/** What the desktop shows when a screen fails to render or its address does not exist. */
export function RouteError({ isMissing: isUnknownPath = false }: RouteErrorProps) {
  const error = useRouteError();
  const isMissing = isUnknownPath || (isRouteErrorResponse(error) && error.status === 404);
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-6">
      <h1 className="text-xl font-semibold">
        {isMissing ? 'There is no screen here' : 'This screen stopped working'}
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {isMissing
          ? 'The address does not match any screen of the desktop.'
          : 'Reload the page to try again. The company keeps working on the server meanwhile.'}
      </p>
      <Link to="/agents" className={buttonClasses('secondary')}>
        Go to the agents
      </Link>
    </div>
  );
}
