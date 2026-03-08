import { useState, useEffect } from 'react'
import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Bell } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { Button } from '@/components/ui/button'
import { NotificationCenter, useNotificationCount } from '@/components/notification-center'
import { LogPanel } from '@/components/log-panel'
import { useStore } from '@/schema/tinybase-schema'

export const Route = createFileRoute('/_app')({
  component: RouteComponent,
})

interface CompressionProgress {
  id: number
  progress: number
  message: string
}

function NotificationBell() {
  const { count, refresh } = useNotificationCount()
  const [open, setOpen] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      refresh()
    }
    setOpen(isOpen)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {count > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={4} className="w-96 p-0">
        <NotificationCenter onRefresh={refresh} />
      </PopoverContent>
    </Popover>
  )
}

function CompressionListener() {
  const store = useStore()
  const router = useRouter()

  useEffect(() => {
    if (!store) return

    const unlistenProgress = listen<CompressionProgress>('compression-progress', (event) => {
      const { id, progress, message } = event.payload
      if (progress === 100 || progress === 0) {
        store.delRow('compressions', id.toString())
      } else {
        store.setRow('compressions', id.toString(), { progress, message })
      }
    })

    const unlistenUpdated = listen('images-updated', () => {
      router.invalidate()
    })

    return () => {
      unlistenProgress.then((fn) => fn())
      unlistenUpdated.then((fn) => fn())
    }
  }, [store, router])

  return null
}

function RouteComponent() {
  const [logsOpen, setLogsOpen] = useState(false)

  return (
    <SidebarProvider defaultOpen style={{ '--sidebar-width': '14rem' } as React.CSSProperties}>
      <CompressionListener />
      <AppSidebar onToggleLogs={() => setLogsOpen((v) => !v)} logsOpen={logsOpen} />
      <SidebarInset className="flex flex-col">
        <header className="bg-sidebar sticky top-0 z-10 flex h-10 shrink-0 items-center justify-between gap-4 border-b px-4">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
        {logsOpen && <LogPanel onClose={() => setLogsOpen(false)} />}
      </SidebarInset>
    </SidebarProvider>
  )
}
