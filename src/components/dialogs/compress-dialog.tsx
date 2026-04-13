import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { formatBytes } from '@/lib/utils'
import type { Image } from '@/lib/tauri'

interface CompressDialogProps {
  images: Image[]
  imageIds: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ids: number[], quality: number) => void
}

export function CompressDialog({
  images,
  imageIds,
  open,
  onOpenChange,
  onConfirm,
}: CompressDialogProps) {
  const [compressionQuality, setCompressionQuality] = useState([80])

  const selectedImages = useMemo(
    () => images.filter((img) => imageIds.includes(img.id)),
    [images, imageIds]
  )

  const handleConfirm = () => {
    onConfirm(imageIds, compressionQuality[0])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compress {imageIds.length} image(s)</DialogTitle>
          <DialogDescription>
            A compressed copy will be created and linked to the original image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label className="text-sm font-medium">Quality ({compressionQuality[0]}%)</Label>
            </div>
            <Slider
              value={compressionQuality}
              onValueChange={setCompressionQuality}
              max={100}
              min={1}
              step={1}
            />
          </div>

          {imageIds.length > 0 && (
            <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
              {selectedImages.map((img) => {
                const ext = img.filename.split('.').pop()?.toLowerCase()
                const isLossless = ext === 'png'
                const estSize = isLossless
                  ? 'Lossless'
                  : img.size
                    ? formatBytes(img.size * (compressionQuality[0] / 100) * 0.6)
                    : 'Unknown'

                return (
                  <div
                    key={img.id}
                    className="flex items-center justify-between border-b py-1 last:border-b-0"
                  >
                    <span className="max-w-37.5 truncate text-sm">{img.filename}</span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span>{img.size ? formatBytes(img.size) : '?'}</span>
                      <span>→</span>
                      <span className="text-foreground font-medium">{estSize}</span>
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
          <Button onClick={handleConfirm}>Start Compression</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
