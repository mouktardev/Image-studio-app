import { useState, useCallback, memo } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { type Video, revealInExplorer, openFile, cancelVideoBgRemoval } from '@/lib/tauri'
import { error as logError } from '@/lib/logger'
import { formatBytes } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Progress } from '@/components/ui/progress'
import { Scissors, Play, Trash2, ExternalLink, FolderSearch } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRow } from '@/schema/tinybase-schema'

interface VideoGridProps {
  videos: Video[]
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  onDelete: (id: number) => void
  onBgRemovalClick?: (ids: number[]) => void
}

const VideoGridItem = memo(function VideoGridItem({
  video,
  isSelected,
  onSelect,
  onKeyDown,
  onDelete,
  onBgRemovalClick,
}: {
  video: Video
  isSelected: boolean
  onSelect: (id: number, event: React.MouseEvent | React.KeyboardEvent) => void
  onKeyDown: (id: number, event: React.KeyboardEvent) => void
  onDelete: (id: number) => void
  onBgRemovalClick?: (ids: number[]) => void
}) {
  const [thumbnailError, setThumbnailError] = useState(false)
  const bgRemovalState = useRow('video_bg_removals', video.id.toString())

  const src = thumbnailError ? '' : convertFileSrc(video.filepath)

  const handleClick = useCallback(
    (e: React.MouseEvent) => onSelect(video.id, e),
    [video.id, onSelect]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => onKeyDown(video.id, e),
    [video.id, onKeyDown]
  )

  const isProcessing =
    bgRemovalState?.progress != null && bgRemovalState.progress > 0 && bgRemovalState.progress < 100

  const etaSeconds = bgRemovalState?.eta_seconds
    ? bgRemovalState.eta_seconds > 0
      ? bgRemovalState.eta_seconds
      : null
    : null

  const handleCancel = useCallback(async () => {
    try {
      await cancelVideoBgRemoval([video.id])
    } catch (e) {
      logError(`Failed to cancel: ${e}`)
    }
  }, [video.id])

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          role="button"
          tabIndex={0}
          className={`group bg-card hover:border-foreground/50 relative flex flex-col overflow-hidden border transition-all ${
            isSelected ? 'ring-2 ring-blue-600' : ''
          }`}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label={video.filename}
        >
          <div
            className="relative aspect-4/3 w-full overflow-hidden"
            style={{
              backgroundImage: `linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)`,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              backgroundColor: '#fff',
            }}
          >
            {src && !thumbnailError ? (
              <video
                src={src}
                className="size-full object-cover"
                muted
                preload="metadata"
                onError={() => setThumbnailError(true)}
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Play className="text-muted-foreground h-8 w-8" />
              </div>
            )}

            {video.bg_removed_filepath && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-white">
                    <Scissors className="h-3 w-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Background Removed</TooltipContent>
              </Tooltip>
            )}

            {isProcessing && bgRemovalState && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/60 p-2">
                <Progress value={bgRemovalState.progress} className="w-3/4" />
                <span className="text-xs text-white">{bgRemovalState.message}</span>
                {etaSeconds != null && (
                  <span className="text-[10px] text-white/70">ETA: {formatEta(etaSeconds)}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCancel()
                  }}
                  className="mt-1 rounded bg-red-600 px-2 py-0.5 text-[10px] text-white hover:bg-red-700"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/70 to-transparent px-2 py-1.5">
              <p className="truncate text-xs font-semibold text-white">{video.filename}</p>
              <p className="text-[10px] text-white/80">
                {video.size ? formatBytes(video.size) : 'Unknown'}
              </p>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => openFile(video.filepath).catch((e) => logError(`Failed: ${e}`))}
        >
          <ExternalLink className="mr-2 h-4 w-4" /> Open
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => revealInExplorer(video.filepath).catch((e) => logError(`Failed: ${e}`))}
        >
          <FolderSearch className="mr-2 h-4 w-4" /> Reveal in Explorer
        </ContextMenuItem>
        {video.bg_removed_filepath && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() =>
                openFile(video.bg_removed_filepath!).catch((e) => logError(`Failed: ${e}`))
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Open Background Removed
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                revealInExplorer(video.bg_removed_filepath!).catch((e) => logError(`Failed: ${e}`))
              }
            >
              <FolderSearch className="mr-2 h-4 w-4" /> Reveal Background Removed
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onBgRemovalClick?.([video.id])}>
          <Scissors className="mr-2 h-4 w-4" /> Remove Background
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive" onClick={() => onDelete(video.id)}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

export function VideoGrid({
  videos,
  selectedIds,
  onSelectionChange,
  onDelete,
  onBgRemovalClick,
}: VideoGridProps) {
  const handleSelect = useCallback(
    (id: number, event: React.MouseEvent | React.KeyboardEvent) => {
      if (event.shiftKey && selectedIds.length > 0) {
        const lastSelected = selectedIds[selectedIds.length - 1]
        const allIds = videos.map((v) => v.id)
        const lastIdx = allIds.indexOf(lastSelected)
        const currIdx = allIds.indexOf(id)
        const [start, end] = [lastIdx, currIdx].sort((a, b) => a - b)
        const range = allIds.slice(start, end + 1)
        onSelectionChange([...new Set([...selectedIds, ...range])])
      } else if (event.ctrlKey || event.metaKey) {
        if (selectedIds.includes(id)) {
          onSelectionChange(selectedIds.filter((i) => i !== id))
        } else {
          onSelectionChange([...selectedIds, id])
        }
      } else {
        if (selectedIds.includes(id)) {
          onSelectionChange(selectedIds.filter((i) => i !== id))
        } else {
          onSelectionChange([...selectedIds, id])
        }
      }
    },
    [videos, selectedIds, onSelectionChange]
  )

  const handleKeyDown = useCallback(
    (id: number, event: React.KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        handleSelect(id, event)
      }
    },
    [handleSelect]
  )

  if (videos.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">No videos imported yet</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {videos.map((video) => (
        <VideoGridItem
          key={video.id}
          video={video}
          isSelected={selectedIds.includes(video.id)}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          onDelete={onDelete}
          onBgRemovalClick={onBgRemovalClick}
        />
      ))}
    </div>
  )
}
