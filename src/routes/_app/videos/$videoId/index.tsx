import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ExternalLink, FolderSearch } from 'lucide-react'
import { getVideoById, openFile, revealInExplorer } from '@/lib/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'
import { error as logError } from '@/lib/logger'
import { useCallback, useMemo } from 'react'
import { cn, formatBytes } from '@/lib/utils'

interface VersionItem {
  id: string
  label: string
  filepath: string
  size: number | null
  model?: string
}

export const Route = createFileRoute('/_app/videos/$videoId/')({
  validateSearch: (search: Record<string, string | undefined>) => ({
    view: search.view || 'original',
  }),
  loader: async ({ params }) => {
    const video = await getVideoById(parseInt(params.videoId))
    return { video }
  },
  component: VideoPage,
  errorComponent: () => (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-4 text-center">
        <h2 className="text-destructive text-xl font-semibold">Video not found</h2>
        <p className="text-muted-foreground text-sm">The requested video could not be loaded.</p>
        <Button asChild variant="outline">
          <Link to="/videos" viewTransition={{ types: ['slide-right'] }}>
            <ArrowLeft className="mr-2 size-4" />
            Back to Videos
          </Link>
        </Button>
      </div>
    </div>
  ),
})

function VideoPage() {
  const { video } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const { view } = Route.useSearch()

  const versions: VersionItem[] = useMemo(() => {
    const list: VersionItem[] = [
      { id: 'original', label: 'Original', filepath: video.filepath, size: video.size },
    ]
    if (video.compressed_filepath) {
      list.push({
        id: 'compressed',
        label: 'Compressed',
        filepath: video.compressed_filepath,
        size: video.compressed_size ?? null,
      })
    }
    if (video.bg_removed_filepath) {
      list.push({
        id: 'bg_removed',
        label: 'BG Removed',
        filepath: video.bg_removed_filepath,
        size: video.bg_removed_size ?? null,
        model: video.bg_removed_model || undefined,
      })
    }
    video.converted_videos.forEach((c, i) => {
      list.push({
        id: `converted-${i}`,
        label: c.format.toUpperCase(),
        filepath: c.filepath,
        size: c.size ?? null,
      })
    })
    return list
  }, [video])

  const currentVersion = versions.find((v) => v.id === view) || versions[0]

  const handleBack = useCallback(() => {
    navigate({ to: '/videos', viewTransition: { types: ['slide-right'] } })
  }, [navigate])

  const handleTabChange = useCallback(
    (id: string) => {
      navigate({ search: { view: id }, replace: true })
    },
    [navigate]
  )

  const handleOpen = useCallback(async (fp: string) => {
    try {
      await openFile(fp)
    } catch (err) {
      logError(`Failed to open file: ${err}`)
    }
  }, [])

  const handleReveal = useCallback(async (fp: string) => {
    try {
      await revealInExplorer(fp)
    } catch (err) {
      logError(`Failed to reveal file: ${err}`)
    }
  }, [])

  const sizeDiff = useMemo(() => {
    if (currentVersion.size == null || video.size == null) return null
    return ((currentVersion.size - video.size) / video.size) * 100
  }, [currentVersion.size, video.size])

  return (
    <div className="flex flex-1 flex-col [view-transition-name:main-content]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          title="Back to videos"
          className="shrink-0"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="max-w-[180px] shrink-0 truncate text-sm font-semibold">{video.filename}</h1>
        {versions.length > 1 && (
          <div className="w-px shrink-0 self-stretch bg-border" />
        )}
        {versions.length > 1 && (
          <div className="flex min-w-0 shrink items-center gap-0 overflow-x-auto self-stretch">
            {versions.map((v, i) => (
              <div key={v.id} className="flex items-center gap-0 self-stretch">
                {i > 0 && <div className="mx-1.5 w-px self-stretch bg-muted-foreground/20" />}
                <button
                  type="button"
                  onClick={() => handleTabChange(v.id)}
                  className={cn(
                    'shrink-0 text-[0.7rem] font-medium transition-colors',
                    view === v.id
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center bg-[#1a1a1a] p-4">
        <video
          key={currentVersion.id}
          src={convertFileSrc(currentVersion.filepath)}
          controls
          className="max-h-full max-w-full object-contain"
        />
      </main>

      <div className="text-muted-foreground flex h-10 shrink-0 items-center gap-3 border-t px-4 text-xs">
        <span className="text-foreground font-medium">{currentVersion.label}</span>
        {currentVersion.size != null && <span>{formatBytes(currentVersion.size)}</span>}
        {currentVersion.model && (
          <span className="text-muted-foreground/60">— {currentVersion.model}</span>
        )}
        {sizeDiff != null && currentVersion.id !== 'original' && (
          <span className={sizeDiff <= 0 ? 'text-emerald-500' : 'text-amber-500'}>
            ({sizeDiff >= 0 ? '+' : ''}
            {sizeDiff.toFixed(1)}%)
          </span>
        )}
        {video.width && video.height && (
          <span className="ml-auto whitespace-nowrap tabular-nums">
            {video.width}×{video.height}
          </span>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => handleOpen(currentVersion.filepath)}
          >
            <ExternalLink className="size-3.5" />
            Open
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => handleReveal(currentVersion.filepath)}
          >
            <FolderSearch className="size-3.5" />
            Reveal
          </Button>
        </div>
      </div>
    </div>
  )
}
