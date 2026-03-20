import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { NotificationCenter, useNotificationCount } from '@/components/notification-center'

export function NotificationBell() {
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
