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
        <DialogHeader className="min-w-0">
          <DialogTitle className="w-full min-w-0 truncate overflow-hidden text-ellipsis whitespace-nowrap">
            {image.filename}
          </DialogTitle>
          <DialogDescription>
            Drag the slider to compare original and compressed images
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
          <ReactCompareSlider
            className="size-full object-contain"
            itemOne={
              <div className="relative h-full w-full">
                <ReactCompareSliderImage src={convertFileSrc(image.filepath)} alt="Original" />
                <div className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[0.62rem] font-semibold text-white">
                  Original
                </div>
              </div>
            }
            itemTwo={
              <div className="relative h-full w-full">
                <ReactCompareSliderImage
                  src={convertFileSrc(image.compressed_filepath)}
                  alt="Compressed"
                />
                <div className="pointer-events-none absolute top-2 right-2 rounded-full bg-emerald-600/80 px-2 py-1 text-[0.62rem] font-semibold text-white">
                  Compressed
                </div>
              </div>
            }
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        </div>
        <div className="border-muted/40 border-t px-3 pt-2 pb-2 text-xs">
          <div className="mx-auto flex max-w-160 flex-wrap justify-center gap-2 text-center">
            <div className="bg-muted/20 min-w-25 rounded-lg px-2 py-1.5">
              <p className="text-muted-foreground text-[0.61rem] tracking-wide uppercase">
                Original
              </p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {image.size ? `${(image.size / 1024).toFixed(1)} KB` : 'Unknown'}
              </p>
            </div>
            <div className="bg-muted/20 min-w-25 rounded-lg px-2 py-1.5">
              <p className="text-muted-foreground text-[0.61rem] tracking-wide uppercase">
                Compressed
              </p>
              <p className="font-medium text-emerald-600 dark:text-emerald-400">
                {image.compressed_size
                  ? `${(image.compressed_size / 1024).toFixed(1)} KB`
                  : 'Unknown'}
              </p>
            </div>
            {image.size && image.compressed_size ? (
              <div className="bg-muted/20 min-w-25 rounded-lg px-2 py-1.5">
                <p className="text-muted-foreground text-[0.61rem] tracking-wide uppercase">
                  Savings
                </p>
                <p
                  className={`font-medium ${
                    image.compressed_size <= image.size
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-500 dark:text-rose-400'
                  }`}
                >
                  {((1 - image.compressed_size / image.size) * 100).toFixed(1)}%
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
