import { convertFileSrc } from '@tauri-apps/api/core'
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { type Image } from '@/lib/tauri'

interface ImageCompareProps {
  image: Image | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageCompare({ image, open, onOpenChange }: ImageCompareProps) {
  if (!image?.compressed_filepath) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full">
        <DialogHeader>
          <DialogTitle className="truncate">{image.filename}</DialogTitle>
          <DialogDescription>
            Drag the slider to compare original and compressed images
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
          <ReactCompareSlider
            className="size-full object-contain"
            itemOne={
              <ReactCompareSliderImage src={convertFileSrc(image.filepath)} alt="Original" />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={convertFileSrc(image.compressed_filepath)}
                alt="Compressed"
              />
            }
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        </div>
        <div className="text-muted-foreground flex justify-center gap-8 text-sm">
          <span>Original: {image.size ? `${(image.size / 1024).toFixed(1)} KB` : 'Unknown'}</span>
          <span>
            Compressed:{' '}
            {image.compressed_size ? `${(image.compressed_size / 1024).toFixed(1)} KB` : 'Unknown'}
          </span>
          {image.size && image.compressed_size && (
            <span className="text-green-500">
              Saved: {((1 - image.compressed_size / image.size) * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
