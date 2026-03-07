import { useEffect, useRef, useState } from 'react'
import { LogLevel, attachLogger } from '@tauri-apps/plugin-log'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

interface LogEntry {
  id: number
  level: LogLevel
  message: string
  timestamp: Date
}

const MAX_ENTRIES = 200

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

let idCounter = 0

interface LogPanelProps {
  onClose: () => void
}

export function LogPanel({ onClose }: LogPanelProps) {
  const { state } = useSidebar()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Mirror sidebar's left offset using its CSS variables so it tracks the toggle animation
  const left = state === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)'

  useEffect(() => {
    let detach: (() => void) | null = null

    attachLogger((record) => {
      setEntries((prev) => [
        ...prev.slice(-(MAX_ENTRIES - 1)),
        { id: ++idCounter, level: record.level, message: record.message, timestamp: new Date() },
      ])
    }).then((fn) => {
      detach = fn
    })

    return () => {
      detach?.()
    }
  }, [])

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  return (
    <div
      className="bg-background fixed right-0 bottom-0 z-50 flex flex-col border-t shadow-lg transition-[left] duration-200 ease-linear"
      style={{ left, height: '240px' }}
    >
      {/* Header */}
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
            onClick={() => setEntries([])}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6" title="Close" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Log list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-1 font-mono text-xs"
        onScroll={handleScroll}
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center">No logs yet.</p>
        ) : (
          <div className="space-y-0.5">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={cn('flex items-baseline gap-2', LEVEL_CLASS[entry.level])}
              >
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1 py-px text-[10px] font-semibold uppercase',
                    BADGE_CLASS[entry.level]
                  )}
                >
                  {LEVEL_LABEL[entry.level]}
                </span>
                <span className="break-all">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
