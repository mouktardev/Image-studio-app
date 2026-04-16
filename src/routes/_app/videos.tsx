import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useEffect } from 'react'
import {
  getAllVideos,
  selectVideoFiles,
  importVideos,
  deleteVideosByIds,
  checkFfmpegStatus,
  downloadFfmpeg,
  getFilters,
  updateFilters,
  resetFilters,
} from '@/lib/tauri'
import type { Video, VideoQueryParams } from '@/lib/tauri'
import {
  getVideoSelections,
  setVideoSelections,
  removeVideoSelection,
  clearVideoSelections,
  addNotification,
} from '@/lib/notifications'
import { VideoGrid } from '@/components/video-grid'
import { VideoTools } from '@/components/video-tools'
import { VideoBgRemovalDialog } from '@/components/dialogs/video-bg-removal-dialog'
import { error as logError } from '@/lib/logger'
import { toast } from '@/lib/notifications'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/_app/videos')({
  beforeLoad: async () => {
    const filters = await getFilters('videos')
    return { filters }
  },
  loader: async ({ context }) => {
    const { filters } = context
    const [videos, selectedIds] = await Promise.all([getAllVideos(), getVideoSelections()])
    return { videos, selectedIds, filters }
  },
  gcTime: 0,
  staleTime: 0,
  component: VideosPage,
})

function VideosPage() {
  const loaderData = Route.useLoaderData()

  const [videos, setVideos] = useState<Video[]>(loaderData.videos)
  const [selectedIds, setSelectedIds] = useState<number[]>(loaderData.selectedIds)
  const [activeDialog, setActiveDialog] = useState<null | 'bgremove'>(null)

  const [searchQuery, setSearchQuery] = useState(loaderData.filters.search_query)
  const [sortField, setSortField] = useState<'name' | 'size' | 'date'>(
    loaderData.filters.sort_field
  )
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(loaderData.filters.sort_order)

  const [isImporting, setIsImporting] = useState(false)
  const [ffmpegNeeded, setFfmpegNeeded] = useState(false)
  const [isDownloadingFfmpeg, setIsDownloadingFfmpeg] = useState(false)
  const [ffmpegStatus, setFfmpegStatus] = useState<{
    available: boolean
    size: number | null
  } | null>(null)

  const hasActiveFilters = searchQuery !== '' || sortField !== 'date' || sortOrder !== 'desc'

  const reloadVideos = useCallback(async () => {
    try {
      const params: VideoQueryParams = {
        search: searchQuery || undefined,
        sort_field: sortField,
        sort_order: sortOrder,
      }
      const result = await getAllVideos(params)
      setVideos(result)
    } catch (err) {
      logError(`Failed to load videos: ${err}`)
    }
  }, [searchQuery, sortField, sortOrder])

  useEffect(() => {
    setVideos(loaderData.videos)
  }, [loaderData])

  // Sync filter changes to DB and reload
  useEffect(() => {
    setVideos(loaderData.videos)
  }, [loaderData])

  // Sync filters to DB and reload videos with params when filter state changes
  useEffect(() => {
    const syncAndReload = async () => {
      try {
        await updateFilters({
          page: 'videos',
          search_query: searchQuery,
          sort_field: sortField,
          sort_order: sortOrder,
        })
        const params: VideoQueryParams = {
          search: searchQuery || undefined,
          sort_field: sortField,
          sort_order: sortOrder,
        }
        const result = await getAllVideos(params)
        setVideos(result)
      } catch (err) {
        logError(`Failed to sync and reload videos: ${err}`)
      }
    }
    syncAndReload()
  }, [searchQuery, sortField, sortOrder])

  // Reload videos with current filter params
  useEffect(() => {
    const doReload = async () => {
      try {
        const params: VideoQueryParams = {
          search: searchQuery || undefined,
          sort_field: sortField,
          sort_order: sortOrder,
        }
        const result = await getAllVideos(params)
        setVideos(result)
      } catch (err) {
        logError(`Failed to reload videos: ${err}`)
      }
    }
    doReload()
  }, [searchQuery, sortField, sortOrder])

  const resetFiltersHandler = useCallback(async () => {
    try {
      const data = await resetFilters('videos')
      setSearchQuery(data.search_query)
      setSortField(data.sort_field)
      setSortOrder(data.sort_order)
      const params: VideoQueryParams = {
        search: data.search_query || undefined,
        sort_field: data.sort_field,
        sort_order: data.sort_order,
      }
      const result = await getAllVideos(params)
      setVideos(result)
    } catch (err) {
      logError(`Failed to reset filters: ${err}`)
    }
  }, [])

  const handleImport = useCallback(async () => {
    try {
      const status = await checkFfmpegStatus()
      if (!status.available) {
        setFfmpegNeeded(true)
        setFfmpegStatus(status)
        return
      }

      setIsImporting(true)
      const paths = await selectVideoFiles()
      if (!paths || paths.length === 0) {
        setIsImporting(false)
        return
      }

      const result = await importVideos(paths)
      const { imported, duplicates, failed } = result

      if (imported > 0) {
        toast(`Imported ${imported} video${imported > 1 ? 's' : ''}`, 'success')
      }

      if (duplicates > 0) {
        toast(`${duplicates} video${duplicates > 1 ? 's' : ''} already exists, skipped`, 'info')
      }

      if (paths.length > 1) {
        const parts: string[] = []
        if (imported > 0) parts.push(`${imported} imported`)
        if (duplicates > 0) parts.push(`${duplicates} already exists`)
        if (failed > 0) parts.push(`${failed} failed`)

        await addNotification({
          message: parts.join(', '),
          status: failed > 0 ? 'error' : 'success',
        })
      }

      await reloadVideos()
    } catch (err) {
      logError(`Failed to import videos: ${err}`)
      toast(String(err).replace(/^Error:\s*/, ''), 'error')
    } finally {
      setIsImporting(false)
    }
  }, [reloadVideos])

  const handleDownloadFfmpeg = useCallback(async () => {
    setIsDownloadingFfmpeg(true)
    try {
      await downloadFfmpeg()
      setFfmpegNeeded(false)
      const status = await checkFfmpegStatus()
      setFfmpegStatus(status)
      toast('FFmpeg downloaded successfully', 'success')
    } catch (err) {
      logError(`Failed to download FFmpeg: ${err}`)
      toast('Failed to download FFmpeg', 'error')
    } finally {
      setIsDownloadingFfmpeg(false)
    }
  }, [])

  const handleSelectionChange = useCallback(async (ids: number[]) => {
    setSelectedIds(ids)
    try {
      await setVideoSelections(ids)
    } catch (err) {
      logError(`Failed to sync video selections: ${err}`)
    }
  }, [])

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteVideosByIds([id])
        setSelectedIds((prev) => prev.filter((i) => i !== id))
        await removeVideoSelection(id)
        await reloadVideos()
      } catch (err) {
        logError(`Failed to delete video: ${err}`)
        toast('Failed to delete video', 'error')
      }
    },
    [reloadVideos]
  )

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return
    const count = selectedIds.length
    try {
      await deleteVideosByIds(selectedIds)
      setSelectedIds([])
      await clearVideoSelections()
      await reloadVideos()
      await addNotification({
        message: `Deleted ${count} video${count > 1 ? 's' : ''}`,
        status: 'success',
      })
    } catch (err) {
      logError(`Failed to delete videos: ${err}`)
      toast('Failed to delete videos', 'error')
    }
  }, [selectedIds, reloadVideos])

  const handleRemoveBackground = useCallback(
    async (_ids: number[]) => {
      // Video background removal is temporarily disabled
      // TODO: Re-enable when GPU acceleration is properly configured
      toast('Video background removal is coming soon!', 'info')

      // Previous implementation kept for reference:
      // try {
      //   const result = await removeVideoBg(ids)
      //   if (result.cancelled > 0) {
      //     await addNotification({
      //       message: `Video processing cancelled (${result.cancelled} cancelled${result.processed > 0 ? `, ${result.processed} completed` : ''})`,
      //       status: 'info',
      //     })
      //   } else if (result.processed > 0) {
      //     await addNotification({
      //       message: `Removed background from ${result.processed} video${result.processed !== 1 ? 's' : ''}`,
      //       status: 'success',
      //     })
      //   } else {
      //     await addNotification({
      //       message: 'No videos were processed',
      //       status: 'error',
      //     })
      //   }
      //   await reloadVideos()
      // } catch (err) {
      //   logError(`Failed to process videos: ${err}`)
      //   toast('Failed to process videos', 'error')
      // }
    },
    [reloadVideos]
  )

  const openBgRemovalDialog = useCallback(() => {
    if (selectedIds.length > 0) {
      setActiveDialog('bgremove')
    }
  }, [selectedIds])

  return (
    <>
      {isImporting && (
        <div className="bg-background/80 absolute inset-0 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">Importing videos...</p>
          </div>
        </div>
      )}

      <VideoTools
        videos={videos}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onBgRemovalClick={openBgRemovalDialog}
        onDeleteClick={handleDeleteSelected}
        onImportClick={handleImport}
        isImporting={isImporting}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortFieldChange={setSortField}
        onSortOrderChange={setSortOrder}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFiltersHandler}
      />

      <div className="flex-1 overflow-auto">
        <VideoGrid
          videos={videos}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          onDelete={handleDelete}
          onBgRemovalClick={(ids) => {
            handleSelectionChange(ids)
            setActiveDialog('bgremove')
          }}
        />
      </div>

      <VideoBgRemovalDialog
        videos={videos}
        videoIds={selectedIds}
        open={activeDialog === 'bgremove'}
        onOpenChange={(open) => setActiveDialog(open ? 'bgremove' : null)}
        onConfirm={handleRemoveBackground}
      />

      <Dialog open={ffmpegNeeded} onOpenChange={setFfmpegNeeded}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>FFmpeg Required</DialogTitle>
            <DialogDescription>
              FFmpeg is required to import and process videos. It needs to be downloaded before you
              can continue.
            </DialogDescription>
          </DialogHeader>
          {ffmpegStatus && !ffmpegStatus.available && (
            <div className="flex items-center gap-2 rounded-md border p-3">
              <Download className="text-muted-foreground h-5 w-5" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">FFmpeg (~80 MB)</span>
                <span className="text-muted-foreground text-xs">
                  Required for video metadata extraction and processing
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFfmpegNeeded(false)}>
              Cancel
            </Button>
            <Button onClick={handleDownloadFfmpeg} disabled={isDownloadingFfmpeg}>
              {isDownloadingFfmpeg ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download FFmpeg
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
