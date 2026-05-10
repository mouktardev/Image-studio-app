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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatBytes } from '@/lib/utils'
import type { Video, CompressionPreset } from '@/lib/tauri'

interface CompressVideoDialogProps {
  videos: Video[]
  videoIds: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ids: number[], quality: number, preset: string) => void
  presets: CompressionPreset[]
}

export function CompressVideoDialog({
  videos,
  videoIds,
  open,
  onOpenChange,
  onConfirm,
  presets,
}: CompressVideoDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState(presets[2]?.preset || 'medium')

  const selectedVideos = useMemo(
    () => videos.filter((v) => videoIds.includes(v.id)),
    [videos, videoIds]
  )

  const currentPreset = presets.find((p) => p.preset === selectedPreset) || presets[2]

  const handleConfirm = () => {
    const quality = currentPreset?.crf || 20
    onConfirm(videoIds, quality, selectedPreset)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compress {videoIds.length} video(s)</DialogTitle>
          <DialogDescription>
            A compressed copy will be created and saved to your output folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label className="text-sm font-medium">Preset</Label>
              <span className="text-muted-foreground text-sm">CRF: {currentPreset?.crf || 20}</span>
            </div>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.preset} value={preset.preset}>
                    {preset.name} (CRF: {preset.crf})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Lower CRF = better quality but larger file. Higher preset = slower encoding but better
              compression.
            </p>
          </div>

          {videoIds.length > 0 && (
            <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
              {selectedVideos.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between border-b py-1 last:border-b-0"
                >
                  <span className="max-w-37.5 truncate text-sm">{video.filename}</span>
                  <span className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span>{video.size ? formatBytes(video.size) : '?'}</span>
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
          <Button onClick={handleConfirm}>Start Compression</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
