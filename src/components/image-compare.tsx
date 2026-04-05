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
  compareType: 'compressed' | 'bg_removed' | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageCompare({ image, compareType, open, onOpenChange }: ImageCompareProps) {
  const hasCompressed = !!image?.compressed_filepath
  const hasBgRemoved = !!image?.bg_removed_filepath

  if (!hasCompressed && !hasBgRemoved) return null

  // Use the explicitly passed compareType, or default based on what's available
  const isBgRemovedComparison = compareType === 'bg_removed' || (!compareType && hasBgRemoved)
  const compareFilepath = isBgRemovedComparison
    ? image.bg_removed_filepath
    : image.compressed_filepath
  const compareSize = isBgRemovedComparison ? image.bg_removed_size : image.compressed_size
  const compareLabel = isBgRemovedComparison ? 'Background Removed' : 'Compressed'
  const compareColorClass = isBgRemovedComparison
    ? 'text-purple-600 dark:text-purple-400'
    : 'text-emerald-600 dark:text-emerald-400'
  const compareBadgeClass = isBgRemovedComparison ? 'bg-purple-600/80' : 'bg-emerald-600/80'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full">
        <DialogHeader className="min-w-0">
          <DialogTitle className="w-full min-w-0 truncate overflow-hidden text-ellipsis whitespace-nowrap">
            {image.filename}
          </DialogTitle>
          <DialogDescription>
            Drag the slider to compare original and{' '}
            {isBgRemovedComparison ? 'background removed' : 'compressed'} images
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
              <div className="bg-card relative h-full w-full">
                <ReactCompareSliderImage
                  src={convertFileSrc(compareFilepath!)}
                  alt={compareLabel}
                />
                <div
                  className={`pointer-events-none absolute top-2 right-2 rounded-full ${compareBadgeClass} px-2 py-1 text-[0.62rem] font-semibold text-white`}
                >
                  {compareLabel}
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
          <div className="mx-auto flex max-w-160 justify-center gap-2 text-center">
            <div className="bg-muted/20 min-w-[70px] rounded-lg px-2 py-1">
              <p className="text-muted-foreground text-[0.61rem] tracking-wide uppercase">
                Original
              </p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {image.size ? `${(image.size / 1024).toFixed(1)} KB` : 'Unknown'}
              </p>
            </div>
            <div className="bg-muted/20 min-w-[70px] rounded-lg px-2 py-1">
              <p className="text-muted-foreground text-[0.61rem] tracking-wide uppercase">
                {compareLabel}
              </p>
              <p className={`font-medium ${compareColorClass}`}>
                {compareSize ? `${(compareSize / 1024).toFixed(1)} KB` : 'Unknown'}
              </p>
            </div>
            {image.size && compareSize ? (
              <div className="bg-muted/20 min-w-[70px] rounded-lg px-2 py-1">
                <p className="text-muted-foreground text-[0.61rem] tracking-wide uppercase">
                  {isBgRemovedComparison ? 'Diff' : 'Save'}
                </p>
                <p
                  className={`font-medium ${
                    !isBgRemovedComparison && compareSize <= image.size
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isBgRemovedComparison
                        ? 'text-slate-600 dark:text-slate-400'
                        : 'text-rose-500 dark:text-rose-400'
                  }`}
                >
                  {Math.abs((1 - compareSize / image.size) * 100).toFixed(1)}%
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
