import { useCallback } from 'react'
import { useRouter } from '@tanstack/react-router'
import { DatabaseZap } from 'lucide-react'
import { useValue, useSetValueCallback } from '@/schema/tinybase-schema'
import { syncDatabase } from '@/lib/tauri'
import { toast } from '@/lib/notifications'
import { error as logError } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function DbSyncButton() {
  const router = useRouter()
  const dbNeedsSync = useValue('dbNeedsSync')

  const clearDbNeedsSync = useSetValueCallback('dbNeedsSync', () => false)

  const handleSyncDb = useCallback(async () => {
    try {
      const deletedCount = await syncDatabase()
      if (deletedCount > 0) {
        toast(`Cleaned up ${deletedCount} orphaned records.`, 'success')
      } else {
        toast('Database is in sync.', 'info')
      }
      clearDbNeedsSync()
      // Invalidate router cache to refresh all route loaders
      await router.invalidate()
    } catch (err) {
      logError(`Failed to sync database: ${err}`)
      toast('Failed to sync database', 'error')
    }
  }, [clearDbNeedsSync, router])

  return (
    <Tooltip>
      <div className="flex items-center gap-1">
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto justify-start gap-1.5 px-1 py-0.5"
            onClick={handleSyncDb}
          >
            <div className="relative">
              <DatabaseZap className="h-3.5 w-3.5" />
              <span
                className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${
                  dbNeedsSync ? 'bg-amber-500' : 'bg-green-500'
                }`}
              />
            </div>
            <span className="text-[10px]">DB</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <p>{dbNeedsSync ? 'Database needs sync' : 'Database in sync'} - Click to sync</p>
        </TooltipContent>
      </div>
    </Tooltip>
  )
}
