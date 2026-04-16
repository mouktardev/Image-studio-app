import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Download } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { error as logError } from '@/lib/logger'
import {
  getBgRemovalModelStatus,
  downloadBgRemovalModel,
  checkFfmpegStatus,
  downloadFfmpeg,
} from '@/lib/tauri'
import type { Video } from '@/lib/tauri'

const BG_REMOVAL_MODEL_SIZE = 176 * 1024 * 1024

interface VideoBgRemovalDialogProps {
  videos: Video[]
  videoIds: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ids: number[]) => void
}

export function VideoBgRemovalDialog({
  videos,
  videoIds,
  open,
  onOpenChange,
  onConfirm,
}: VideoBgRemovalDialogProps) {
  const [modelDownloaded, setModelDownloaded] = useState(false)
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [isDownloadingFfmpeg, setIsDownloadingFfmpeg] = useState(false)

  const selectedVideos = useMemo(
    () => videos.filter((v) => videoIds.includes(v.id)),
    [videos, videoIds]
  )

  const checkPrerequisites = useCallback(async () => {
    try {
      const modelStatus = await getBgRemovalModelStatus()
      setModelDownloaded(modelStatus.downloaded)
    } catch (err) {
      logError(`Failed to check model status: ${err}`)
      setModelDownloaded(false)
    }
    try {
      const ffmpegStatus = await checkFfmpegStatus()
      setFfmpegAvailable(ffmpegStatus.available)
    } catch (err) {
      logError(`Failed to check FFmpeg status: ${err}`)
      setFfmpegAvailable(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      checkPrerequisites()
    }
  }, [open, checkPrerequisites])

  const handleDownloadModel = async () => {
    setIsDownloadingModel(true)
    try {
      await downloadBgRemovalModel()
      setModelDownloaded(true)
    } catch (err) {
      logError(`Failed to download model: ${err}`)
    } finally {
      setIsDownloadingModel(false)
    }
  }

  const handleDownloadFfmpeg = async () => {
    setIsDownloadingFfmpeg(true)
    try {
      await downloadFfmpeg()
      setFfmpegAvailable(true)
    } catch (err) {
      logError(`Failed to download FFmpeg: ${err}`)
    } finally {
      setIsDownloadingFfmpeg(false)
    }
  }

  const canProcess = modelDownloaded && ffmpegAvailable

  const handleConfirm = () => {
    onConfirm(videoIds)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Background from {videoIds.length} video(s)</DialogTitle>
          <DialogDescription>
            AI-powered video background removal using BRIA RMBG-1.4. Output will be WebM with
            transparency. This is a slow process that processes each frame individually.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
                  modelDownloaded ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {modelDownloaded ? 'AI Model Downloaded' : 'AI Model Not Downloaded'}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatBytes(BG_REMOVAL_MODEL_SIZE)}
                </span>
              </div>
            </div>
            {!modelDownloaded && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadModel}
                disabled={isDownloadingModel}
              >
                {isDownloadingModel ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                <span className="text-xs">
                  {isDownloadingModel ? 'Downloading...' : 'Download'}
                </span>
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
                  ffmpegAvailable ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {ffmpegAvailable ? 'FFmpeg Available' : 'FFmpeg Required'}
                </span>
                <span className="text-muted-foreground text-xs">
                  Required for video encoding (~80 MB)
                </span>
              </div>
            </div>
            {!ffmpegAvailable && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadFfmpeg}
                disabled={isDownloadingFfmpeg}
              >
                {isDownloadingFfmpeg ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                <span className="text-xs">
                  {isDownloadingFfmpeg ? 'Downloading...' : 'Download'}
                </span>
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              BRIA RMBG-1.4 processes each video frame individually. Processing time depends on
              video duration and resolution.
            </p>
          </div>

          {selectedVideos.length > 0 && (
            <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
              {selectedVideos.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between border-b py-1 last:border-b-0"
                >
                  <span className="max-w-37.5 truncate text-sm">{v.filename}</span>
                  <span className="text-muted-foreground text-xs">→ no_bg.webm</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canProcess}>
            Remove Background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
