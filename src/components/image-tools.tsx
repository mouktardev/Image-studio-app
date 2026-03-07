import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Trash2, Upload, Loader2, ArchiveRestore } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import type { Image } from '@/lib/tauri'

interface ImageToolsProps {
  images: Image[]
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  onImport: () => void
  onDeleteSelected: (ids: number[]) => void
  onCompressSelected: (ids: number[], quality: number) => void
  isImporting?: boolean
}

export function ImageTools({
  images,
  selectedIds,
  onSelectionChange,
  onImport,
  onDeleteSelected,
  onCompressSelected,
  isImporting = false,
}: ImageToolsProps) {
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)
  const [openCompressDialog, setOpenCompressDialog] = useState(false)
  const [compressionQuality, setCompressionQuality] = useState([80])

  const handleSelectAll = () => {
    if (selectedIds.length === images.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(images.map((img) => img.id))
    }
  }

  const handleDeleteConfirm = () => {
    onDeleteSelected(selectedIds)
    setOpenDeleteDialog(false)
  }

  const handleCompressConfirm = () => {
    onCompressSelected(selectedIds, compressionQuality[0])
    setOpenCompressDialog(false)
  }

  const selectedImages = images.filter((img) => selectedIds.includes(img.id))

  return (
    <div className="flex items-center gap-4 border-b p-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id="select-all"
          checked={
            selectedIds.length === images.length
              ? true
              : selectedIds.length > 0
                ? 'indeterminate'
                : false
          }
          onCheckedChange={handleSelectAll}
        />
        <label htmlFor="select-all" className="cursor-pointer text-sm">
          {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
        </label>
      </div>

      <Button onClick={onImport} disabled={isImporting}>
        {isImporting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Import Images
      </Button>

      {selectedIds.length > 0 && (
        <>
          <Button variant="outline" onClick={() => setOpenCompressDialog(true)}>
            <ArchiveRestore className="mr-2 h-4 w-4" />
            Compress ({selectedIds.length})
          </Button>

          <Button variant="destructive" onClick={() => setOpenDeleteDialog(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete ({selectedIds.length})
          </Button>

          <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete selected images?</DialogTitle>
                <DialogDescription>
                  You are about to delete {selectedIds.length} image(s) from the database. This
                  action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              {selectedIds.length > 0 && (
                <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
                  {selectedImages.map((img) => (
                    <div
                      key={img.id}
                      className="flex items-center justify-between border-b py-1 last:border-b-0"
                    >
                      <span className="max-w-[200px] truncate">{img.filename}</span>
                      <span className="text-muted-foreground text-xs">
                        {img.size ? formatBytes(img.size) : 'Unknown'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenDeleteDialog(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteConfirm}>
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openCompressDialog} onOpenChange={setOpenCompressDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Compress {selectedIds.length} image(s)</DialogTitle>
                <DialogDescription>
                  A compressed copy will be created and linked to the original image.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium">
                      Quality ({compressionQuality[0]}%)
                    </label>
                  </div>
                  <Slider
                    value={compressionQuality}
                    onValueChange={setCompressionQuality}
                    max={100}
                    min={1}
                    step={1}
                  />
                </div>

                {selectedIds.length > 0 && (
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
                          <span className="max-w-[150px] truncate text-sm">{img.filename}</span>
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
                <Button variant="outline" onClick={() => setOpenCompressDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCompressConfirm}>Start Compression</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
