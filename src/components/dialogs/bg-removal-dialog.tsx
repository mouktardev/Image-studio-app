import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Download } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { error as logError } from '@/lib/logger'
import { addNotification } from '@/lib/notifications'
import { useValue, useCell, useSetRowCallback } from '@/schema/tinybase-schema'
import { downloadBgRemovalModel } from '@/lib/tauri'
import type { Image } from '@/lib/tauri'

const MODEL_NAME = 'bria-rmbg-1.4'
const BG_REMOVAL_MODEL_SIZE = 176 * 1024 * 1024

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
  const isDownloading = useValue('isDownloadingBgRemoval')
  const modelDownloaded = useCell('model_downloads', MODEL_NAME, 'downloaded')
  const downloadProgress = useValue('bgRemovalDownloadProgress')

  const markDownloaded = useSetRowCallback(
    'model_downloads',
    (name: string) => name,
    () => ({ downloaded: true }),
    []
  )

  const selectedImages = useMemo(
    () => images.filter((img) => imageIds.includes(img.id)),
    [images, imageIds]
  )

  const handleDownloadModel = async () => {
    try {
      await downloadBgRemovalModel()
      markDownloaded(MODEL_NAME)
      await addNotification({ message: `${MODEL_NAME} downloaded successfully`, status: 'success' })
    } catch (err) {
      logError(`Failed to download background removal model: ${err}`)
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
                  modelDownloaded ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {modelDownloaded ? 'Downloaded' : 'Not Downloaded'}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatBytes(BG_REMOVAL_MODEL_SIZE)}
                </span>
              </div>
            </div>
            {isDownloading && (
              <div className="flex items-center gap-2">
                <Progress value={downloadProgress} className="w-20" />
                <span className="text-xs">{downloadProgress}%</span>
              </div>
            )}
            {!modelDownloaded && !isDownloading && (
              <Button size="sm" variant="outline" onClick={handleDownloadModel}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                <span className="text-xs">Download</span>
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
          <Button onClick={handleConfirm} disabled={!modelDownloaded}>
            Remove Background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
