import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Bell, Check, CircleCheck, Info, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Notification,
  getAllNotifications,
  markAsRead,
  deleteNotification,
  markAllAsRead,
  clearAll,
  useNotificationCountWithEvents,
} from '@/lib/notifications'

function NotificationItem({
  notification,
  onRefresh,
}: {
  notification: Notification
  onRefresh: () => void
}) {
  const Icon =
    notification.status === 'success'
      ? CircleCheck
      : notification.status === 'error'
        ? XCircle
        : Info

  const iconColor =
    notification.status === 'success'
      ? 'text-green-500'
      : notification.status === 'error'
        ? 'text-red-500'
        : 'text-blue-500'

  const handleMarkRead = async () => {
    await markAsRead(notification.id)
    onRefresh()
  }

  const handleDelete = async () => {
    await deleteNotification(notification.id)
    onRefresh()
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md p-4 transition-colors',
        !notification.read && 'bg-muted'
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', iconColor)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words">{notification.message}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {formatDistanceToNow(new Date(notification.timestamp), {
            addSuffix: true,
          })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!notification.read && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleMarkRead}
            title="Mark as read"
          >
            <Check className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-8"
          onClick={handleDelete}
          title="Delete"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}

interface NotificationCenterProps {
  onRefresh?: () => void
}

export function NotificationCenter({ onRefresh }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadNotifications = async () => {
    try {
      const data = await getAllNotifications()
      setNotifications(data)
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  const handleMarkAllRead = async () => {
    await markAllAsRead()
    loadNotifications()
    onRefresh?.()
  }

  const handleClearAll = async () => {
    await clearAll()
    loadNotifications()
    onRefresh?.()
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <Card className="w-96">
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Notifications
            {unreadCount > 0 && (
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                ({unreadCount} unread)
              </span>
            )}
          </CardTitle>
          {notifications.length > 0 && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleMarkAllRead}>
                Mark all read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-8 text-xs"
                onClick={handleClearAll}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="max-h-[400px] overflow-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="border-t-primary h-6 w-6 animate-spin rounded-full border-4 border-gray-300" />
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-1 px-2 pb-2">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onRefresh={loadNotifications}
              />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center justify-center py-8 text-center">
            <Bell className="mb-2 size-8" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs">You have no new notifications.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export const useNotificationCount = useNotificationCountWithEvents
