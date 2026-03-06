import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'

export const Route = createFileRoute('/_app')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider defaultOpen style={{ '--sidebar-width': '14rem' } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-muted/40 flex h-10 items-center justify-between gap-4 border-b px-6">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
