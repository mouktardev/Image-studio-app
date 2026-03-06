import { createRootRoute, Outlet } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Inspector } from 'tinybase/ui-react-inspector'

const RootLayout = () => (
  <>
    <Outlet />
    <Inspector />
    {/* <TanStackRouterDevtools /> */}
  </>
)

export const Route = createRootRoute({ component: RootLayout })
