import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Trash2, Upload, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import type { Image } from '@/lib/tauri'

interface ImageToolsProps {
  images: Image[]
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  onImport: () => void
  onDeleteSelected: (ids: number[]) => void
  isImporting?: boolean
}

export function ImageTools({
  images,
  selectedIds,
  onSelectionChange,
  onImport,
  onDeleteSelected,
  isImporting = false,
}: ImageToolsProps) {
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)

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
        </>
      )}
    </div>
  )
}
