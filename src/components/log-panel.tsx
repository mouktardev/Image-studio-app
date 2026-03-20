import { useEffect, useRef, useState } from 'react'
import { LogLevel } from '@tauri-apps/plugin-log'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import {
  useSortedRowIds,
  useRow,
  useDelTableCallback,
  useSetValueCallback,
} from '@/schema/tinybase-schema'

const LEVEL_LABEL: Record<LogLevel, string> = {
  [LogLevel.Trace]: 'TRACE',
  [LogLevel.Debug]: 'DEBUG',
  [LogLevel.Info]: 'INFO',
  [LogLevel.Warn]: 'WARN',
  [LogLevel.Error]: 'ERROR',
}

const LEVEL_CLASS: Record<LogLevel, string> = {
  [LogLevel.Trace]: 'text-muted-foreground',
  [LogLevel.Debug]: 'text-muted-foreground',
  [LogLevel.Info]: 'text-blue-400',
  [LogLevel.Warn]: 'text-amber-400',
  [LogLevel.Error]: 'text-red-400',
}

const BADGE_CLASS: Record<LogLevel, string> = {
  [LogLevel.Trace]: 'bg-muted text-muted-foreground',
  [LogLevel.Debug]: 'bg-muted text-muted-foreground',
  [LogLevel.Info]: 'bg-blue-500/20 text-blue-400',
  [LogLevel.Warn]: 'bg-amber-500/20 text-amber-400',
  [LogLevel.Error]: 'bg-red-500/20 text-red-400',
}

function LogEntry({ id }: { id: string }) {
  const row = useRow('logs', id)

  if (!row) return null

  const level = row.level as LogLevel
  const message = row.message as string
  const timestamp = new Date(row.timestamp as number)

  return (
    <div className={cn('flex items-baseline gap-2', LEVEL_CLASS[level])}>
      <span className="text-muted-foreground shrink-0 tabular-nums">
        {timestamp.toLocaleTimeString()}
      </span>
      <span
        className={cn(
          'shrink-0 rounded px-1 py-px text-[10px] font-semibold uppercase',
          BADGE_CLASS[level]
        )}
      >
        {LEVEL_LABEL[level]}
      </span>
      <span className="break-all">{message}</span>
    </div>
  )
}

export function LogPanel() {
  const { state } = useSidebar()
  const logIds = useSortedRowIds('logs', 'timestamp', false)
  const clearLogs = useDelTableCallback('logs')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const closeLogPanel = useSetValueCallback('logsOpen', () => false)

  const left = state === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)'

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logIds, autoScroll])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  return (
    <div
      className="bg-background fixed right-0 bottom-6.75 z-50 flex flex-col border-t shadow-lg transition-[left] duration-200 ease-linear"
      style={{ left, height: '240px' }}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
        <span className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          Logs
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title="Clear logs"
            onClick={clearLogs}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title="Close"
            onClick={closeLogPanel}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-1 font-mono text-xs"
        onScroll={handleScroll}
      >
        {logIds.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center">No logs yet.</p>
        ) : (
          <div className="space-y-0.5">
            {logIds.map((id) => (
              <LogEntry key={id} id={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
