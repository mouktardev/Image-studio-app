import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ExternalLink, FolderSearch } from 'lucide-react'
import { getImageById, openFile, revealInExplorer } from '@/lib/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'
import { error as logError } from '@/lib/logger'
import { useCallback, useMemo } from 'react'
import { cn, formatBytes } from '@/lib/utils'

interface UpscaledVersion {
  scale: number
  filepath: string
  size: number | null
  model: string | null
}

interface VersionItem {
  id: string
  label: string
  filepath: string
  size: number | null
  model?: string
}

export const Route = createFileRoute('/_app/$imageId/')({
  validateSearch: (search: Record<string, string | undefined>) => ({
    view: search.view || 'original',
  }),
  loader: async ({ params }) => {
    const image = await getImageById(parseInt(params.imageId))
    return { image }
  },
  component: ImagePage,
  errorComponent: () => (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-4 text-center">
        <h2 className="text-destructive text-xl font-semibold">Image not found</h2>
        <p className="text-muted-foreground text-sm">The requested image could not be loaded.</p>
        <Button asChild variant="outline">
          <Link to="/" viewTransition={{ types: ['slide-right'] }}>
            <ArrowLeft className="mr-2 size-4" />
            Back to Gallery
          </Link>
        </Button>
      </div>
    </div>
  ),
})

function ImagePage() {
  const { image } = Route.useLoaderData()
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()

  const parsedUpscaled: UpscaledVersion[] = useMemo(() => {
    const raw = image.upscaled_versions
    if (!raw) return []
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return Array.isArray(parsed)
        ? (parsed as UpscaledVersion[]).filter((v) => v.scale != null && v.filepath)
        : []
    } catch {
      return []
    }
  }, [image.upscaled_versions])

  const versions: VersionItem[] = useMemo(() => {
    const list: VersionItem[] = [
      { id: 'original', label: 'Original', filepath: image.filepath, size: image.size },
    ]
    if (image.compressed_filepath) {
      list.push({
        id: 'compressed',
        label: 'Compressed',
        filepath: image.compressed_filepath,
        size: image.compressed_size ?? null,
      })
    }
    parsedUpscaled.forEach((v, i) => {
      list.push({
        id: `upscaled-${i}`,
        label: `Upscaled ${v.scale}x`,
        filepath: v.filepath,
        size: v.size ?? null,
        model: v.model || undefined,
      })
    })
    if (image.bg_removed_filepath) {
      list.push({
        id: 'bg_removed',
        label: 'BG Removed',
        filepath: image.bg_removed_filepath,
        size: image.bg_removed_size ?? null,
      })
    }
    image.converted_images.forEach((c, i) => {
      list.push({
        id: `converted-${i}`,
        label: c.format.toUpperCase(),
        filepath: c.filepath,
        size: c.size ?? null,
      })
    })
    return list
  }, [image, parsedUpscaled])

  const currentVersion = versions.find((v) => v.id === view) || versions[0]

  const handleBack = useCallback(() => {
    navigate({ to: '/', viewTransition: { types: ['slide-right'] } })
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
    if (currentVersion.size == null || image.size == null) return null
    return ((currentVersion.size - image.size) / image.size) * 100
  }, [currentVersion.size, image.size])

  return (
    <div className="flex flex-1 flex-col [view-transition-name:main-content]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          title="Back to gallery"
          className="shrink-0"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="max-w-[180px] shrink-0 truncate text-sm font-semibold">{image.filename}</h1>
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

      <main className="relative min-h-0 flex-1 bg-[#1a1a1a]">
        <img
          src={convertFileSrc(currentVersion.filepath)}
          alt={currentVersion.label}
          className="absolute inset-0 h-full w-full object-contain p-4"
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
        {image.width && image.height && (
          <span className="ml-auto whitespace-nowrap tabular-nums">
            {image.width}×{image.height}
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
