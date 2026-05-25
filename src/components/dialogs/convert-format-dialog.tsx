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
import { Label } from '@/components/ui/label'
import { formatBytes } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ConvertFormatDialogProps {
  items: Array<{ id: number; filename: string; size: number | null }>
  ids: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ids: number[], format: string) => void
  isVideo: boolean
}

const IMAGE_FORMATS = [
  { value: 'jpg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
]

const VIDEO_FORMATS = [
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'mov', label: 'MOV' },
  { value: 'gif', label: 'GIF' },
]

export function ConvertFormatDialog({
  items,
  ids,
  open,
  onOpenChange,
  onConfirm,
  isVideo,
}: ConvertFormatDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState(
    isVideo ? 'mp4' : 'jpg'
  )

  const selectedItems = useMemo(
    () => items.filter((item) => ids.includes(item.id)),
    [items, ids]
  )

  const formats = isVideo ? VIDEO_FORMATS : IMAGE_FORMATS

  const handleConfirm = () => {
    onConfirm(ids, selectedFormat)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert {ids.length} {isVideo ? 'video(s)' : 'image(s)'}</DialogTitle>
          <DialogDescription>
            Convert to a different format. A converted copy will be created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Target Format</Label>
            <Select value={selectedFormat} onValueChange={setSelectedFormat}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {formats.map((fmt) => (
                  <SelectItem key={fmt.value} value={fmt.value}>
                    {fmt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {ids.length > 0 && (
            <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border-b py-1 last:border-b-0"
                >
                  <span className="max-w-37.5 truncate text-sm">{item.filename}</span>
                  <span className="text-muted-foreground text-xs">
                    {item.size ? formatBytes(item.size) : '?'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Start Conversion</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
