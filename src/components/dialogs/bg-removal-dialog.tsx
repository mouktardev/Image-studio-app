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
import { getBgRemovalModelStatus, downloadBgRemovalModel } from '@/lib/tauri'
import type { Image } from '@/lib/tauri'

const BG_REMOVAL_MODEL_SIZE = 176 * 1024 * 1024 // BRIA RMBG-1.4 ONNX: ~176 MB

interface BgRemovalDialogProps {
  images: Image[]
  imageIds: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ids: number[]) => void
}

export function BgRemovalDialog({
  images,
  imageIds,
  open,
  onOpenChange,
  onConfirm,
}: BgRemovalDialogProps) {
  const [bgRemovalModelDownloaded, setBgRemovalModelDownloaded] = useState(false)
  const [bgRemovalModelSize, setBgRemovalModelSize] = useState<number | null>(null)
  const [isBgRemovalDownloading, setIsBgRemovalDownloading] = useState(false)

  const selectedImages = useMemo(
    () => images.filter((img) => imageIds.includes(img.id)),
    [images, imageIds]
  )

  const checkBgRemovalModelStatus = useCallback(async () => {
    try {
      const status = await getBgRemovalModelStatus()
      setBgRemovalModelDownloaded(status.downloaded)
      setBgRemovalModelSize(status.size ?? null)
    } catch (err) {
      logError(`Failed to check background removal model status: ${err}`)
      setBgRemovalModelDownloaded(false)
      setBgRemovalModelSize(null)
    }
  }, [])

  // Check background removal model status when dialog opens
  useEffect(() => {
    if (open) {
      checkBgRemovalModelStatus()
    }
  }, [open, checkBgRemovalModelStatus])

  const handleDownloadBgRemovalModel = async () => {
    setIsBgRemovalDownloading(true)
    try {
      await downloadBgRemovalModel()
      setBgRemovalModelDownloaded(true)
    } catch (err) {
      logError(`Failed to download background removal model: ${err}`)
    } finally {
      setIsBgRemovalDownloading(false)
    }
  }

  const handleConfirm = () => {
    onConfirm(imageIds)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Background from {imageIds.length} image(s)</DialogTitle>
          <DialogDescription>
            Remove backgrounds using AI-powered segmentation. Output will be PNG with transparency.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
                  bgRemovalModelDownloaded ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {bgRemovalModelDownloaded ? 'Downloaded' : 'Not Downloaded'}
                </span>
                <span className="text-muted-foreground text-xs">
                  {bgRemovalModelDownloaded && bgRemovalModelSize
                    ? formatBytes(bgRemovalModelSize)
                    : formatBytes(BG_REMOVAL_MODEL_SIZE)}
                </span>
              </div>
            </div>
            {!bgRemovalModelDownloaded && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadBgRemovalModel}
                disabled={isBgRemovalDownloading}
              >
                {isBgRemovalDownloading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                <span className="text-xs">
                  {isBgRemovalDownloading ? 'Downloading...' : 'Download'}
                </span>
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              BRIA RMBG-1.4 (~176 MB) - State-of-the-art background removal
            </p>
          </div>

          {imageIds.length > 0 && (
            <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
              {selectedImages.map((img) => (
                <div
                  key={img.id}
                  className="flex items-center justify-between border-b py-1 last:border-b-0"
                >
                  <span className="max-w-37.5 truncate text-sm">{img.filename}</span>
                  <span className="text-muted-foreground text-xs">→ no_bg.png</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!bgRemovalModelDownloaded}>
            Remove Background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
