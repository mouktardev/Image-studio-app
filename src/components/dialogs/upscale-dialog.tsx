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
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { error as logError } from '@/lib/logger'
import { addNotification } from '@/lib/notifications'
import { useValue, useCell, useSetRowCallback } from '@/schema/tinybase-schema'
import {
  downloadModel,
  getUpscaleSettings,
  setUpscaleSettings as saveUpscaleSettings,
} from '@/lib/tauri'
import type { Image } from '@/lib/tauri'

const MODEL_SIZES: Record<string, number> = {
  'realesrgan-x2': 54 * 1024 * 1024,
  'realesrgan-x4': 54 * 1024 * 1024,
}

interface UpscaleDialogProps {
  images: Image[]
  imageIds: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ids: number[], scale: number, model: string) => void
}

export function UpscaleDialog({
  images,
  imageIds,
  open,
  onOpenChange,
  onConfirm,
}: UpscaleDialogProps) {
  const [upscaleScale, setUpscaleScale] = useState(4)
  const [upscaleModel, setUpscaleModel] = useState('realesrgan-x4')

  const isDownloading = useValue('isDownloadingUpscale')
  const modelDownloaded = useCell('model_downloads', upscaleModel, 'downloaded')
  const downloadProgress = useValue('upscaleDownloadProgress')

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

  const loadUpscaleSettings = useCallback(async () => {
    try {
      const settings = await getUpscaleSettings()
      setUpscaleModel(settings.model)
      setUpscaleScale(settings.model.includes('x2') ? 2 : 4)
    } catch (err) {
      logError(`Failed to load upscale settings: ${err}`)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadUpscaleSettings()
    }
  }, [open, loadUpscaleSettings])

  const handleDownloadModel = async () => {
    try {
      await downloadModel(upscaleModel)
      markDownloaded(upscaleModel)
      await saveUpscaleSettings(upscaleModel)
      await addNotification({ message: `${upscaleModel} downloaded successfully`, status: 'success' })
    } catch (err) {
      logError(`Failed to download model: ${err}`)
    }
  }

  const handleConfirm = async () => {
    await saveUpscaleSettings(upscaleModel)
    onConfirm(imageIds, upscaleScale, upscaleModel)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upscale {imageIds.length} image(s)</DialogTitle>
          <DialogDescription>Upscale images using AI-powered super resolution.</DialogDescription>
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
                  {formatBytes(MODEL_SIZES[upscaleModel] || 0)}
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
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadModel}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                <span className="text-xs">Download</span>
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <Label className="text-sm font-medium">Scale Factor</Label>
            <div className="flex gap-4">
              <Button
                variant={upscaleScale === 2 ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setUpscaleScale(2)
                  setUpscaleModel('realesrgan-x2')
                }}
              >
                2x
              </Button>
              <Button
                variant={upscaleScale === 4 ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setUpscaleScale(4)
                  setUpscaleModel('realesrgan-x4')
                }}
              >
                4x
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {upscaleScale === 2
                ? 'Swin2SR Classical x2 (~54 MB)'
                : 'Swin2SR Real-world x4 (~54 MB)'}
            </p>
          </div>

          {imageIds.length > 0 && (
            <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
              {selectedImages.map((img) => {
                const origWidth = img.width || 0
                const origHeight = img.height || 0
                const newWidth = origWidth * upscaleScale
                const newHeight = origHeight * upscaleScale

                return (
                  <div
                    key={img.id}
                    className="flex items-center justify-between border-b py-1 last:border-b-0"
                  >
                    <span className="max-w-37.5 truncate text-sm">{img.filename}</span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span>
                        {origWidth}x{origHeight}
                      </span>
                      <span>→</span>
                      <span className="text-foreground font-medium">
                        {newWidth}x{newHeight}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!modelDownloaded}>
            Start Upscaling
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
