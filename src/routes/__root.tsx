import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Inspector } from 'tinybase/ui-react-inspector'

const RootLayout = () => (
  <>
    <Outlet />
    {import.meta.env.DEV && (
      <>
        <Inspector />
        {/* <TanStackRouterDevtools /> */}
      </>
    )}
  </>
)

export const Route = createRootRoute({ component: RootLayout })
