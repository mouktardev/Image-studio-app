import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { toast as sonnerToast } from 'sonner'
import { useCallback, useEffect, useState } from 'react'

export interface Notification {
  id: number
  message: string
  status: 'success' | 'error' | 'info'
  timestamp: number
  read: boolean
  action_label?: string
  action_payload?: string
}

export interface AddNotificationData {
  message: string
  status?: 'success' | 'error' | 'info'
  action_label?: string
  action_payload?: string
}

export async function getAllNotifications(): Promise<Notification[]> {
  return invoke<Notification[]>('get_all_notifications')
}

export async function addNotification(data: AddNotificationData): Promise<Notification> {
  return invoke<Notification>('add_notification', { data })
}

export async function markAsRead(id: number): Promise<void> {
  return invoke<void>('mark_notification_read', { id })
}

export async function deleteNotification(id: number): Promise<void> {
  return invoke<void>('delete_notification', { id })
}

export async function markAllAsRead(): Promise<void> {
  return invoke<void>('mark_all_notifications_read')
}

export async function clearAll(): Promise<void> {
  return invoke<void>('clear_all_notifications')
}

export function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  switch (type) {
    case 'success':
      sonnerToast.success(message)
      break
    case 'error':
      sonnerToast.error(message)
      break
    case 'info':
    default:
      sonnerToast(message)
      break
  }
}

export async function getSelections(): Promise<number[]> {
  return invoke<number[]>('get_selections')
}

export async function setSelections(imageIds: number[]): Promise<void> {
  return invoke<void>('set_selections', { imageIds })
}

export async function addSelection(imageId: number): Promise<void> {
  return invoke<void>('add_selection', { imageId })
}

export async function removeSelection(imageId: number): Promise<void> {
  return invoke<void>('remove_selection', { imageId })
}

export async function clearSelections(): Promise<void> {
  return invoke<void>('clear_selections')
}

let notificationCountCallback: (() => void) | null = null

export function setNotificationCountCallback(callback: () => void) {
  notificationCountCallback = callback
}

export function useNotificationCountWithEvents() {
  const [count, setCount] = useState(0)

  const loadCount = useCallback(async () => {
    try {
      const notifications = await getAllNotifications()
      setCount(notifications.filter((n) => !n.read).length)
    } catch {
      setCount(0)
    }
  }, [])

  useEffect(() => {
    loadCount()

    const unlisteners: (() => void)[] = []

    const setupListeners = async () => {
      unlisteners.push(
        await listen('notification-added', () => {
          loadCount()
          notificationCountCallback?.()
        })
      )
      unlisteners.push(
        await listen('notification-deleted', () => {
          loadCount()
          notificationCountCallback?.()
        })
      )
      unlisteners.push(
        await listen('notification-read', () => {
          loadCount()
          notificationCountCallback?.()
        })
      )
      unlisteners.push(
        await listen('notifications-all-read', () => {
          loadCount()
          notificationCountCallback?.()
        })
      )
      unlisteners.push(
        await listen('notifications-cleared', () => {
          loadCount()
          notificationCountCallback?.()
        })
      )
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [loadCount])

  return { count, refresh: loadCount }
}
