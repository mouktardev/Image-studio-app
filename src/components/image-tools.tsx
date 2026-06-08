import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Trash2,
  Upload,
  Loader2,
  Maximize2,
  Scissors,
  RotateCcw,
  Minimize2,
  Repeat2,
} from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import type { Image } from '@/lib/tauri'
import { SearchBar } from '@/components/search-bar'
import { SortDropdown } from '@/components/sort-dropdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ImageToolsProps {
  images: Image[]
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  onImport: () => void
  onDeleteSelected: (ids: number[]) => void
  onCompressClick: () => void
  onUpscaleClick: () => void
  onBgRemovalClick: () => void
  onConvertClick: () => void
  isImporting?: boolean
  // Filter props
  searchQuery?: string
  onSearchChange?: (value: string) => void
  sortField?: 'name' | 'size' | 'date'
  sortOrder?: 'asc' | 'desc'
  onSortFieldChange?: (field: 'name' | 'size' | 'date') => void
  onSortOrderChange?: (order: 'asc' | 'desc') => void
  hasActiveFilters?: boolean
  onResetFilters?: () => void
}

export function ImageTools({
  images,
  selectedIds,
  onSelectionChange,
  onImport,
  onDeleteSelected,
  onCompressClick,
  onUpscaleClick,
  onBgRemovalClick,
  onConvertClick,
  isImporting = false,
  // Filter props
  searchQuery = '',
  onSearchChange,
  sortField = 'date',
  sortOrder = 'desc',
  onSortFieldChange,
  onSortOrderChange,
  hasActiveFilters = false,
  onResetFilters,
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
    <div className="bg-background flex flex-wrap items-center gap-2 border-b p-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onImport}
            disabled={isImporting}
            variant="secondary"
            size="icon"
            className="h-8 w-8"
          >
            {isImporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Import</TooltipContent>
      </Tooltip>
      {selectedIds.length > 0 && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={onCompressClick} size="icon" className="h-8 w-8">
                <Minimize2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Compress</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={onUpscaleClick} size="icon" className="h-8 w-8">
                <Maximize2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upscale</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={onBgRemovalClick} size="icon" className="h-8 w-8">
                <Scissors className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove Background</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={onConvertClick} size="icon" className="h-8 w-8">
                <Repeat2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Convert Format</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                onClick={() => setOpenDeleteDialog(true)}
                size="icon"
                className="h-8 w-8"
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove</TooltipContent>
          </Tooltip>

          <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove selected images?</DialogTitle>
                <DialogDescription>
                  You are about to remove {selectedIds.length} image(s) from the app and database.
                  The original file on your device will not be affected. This action cannot be
                  undone.
                </DialogDescription>
              </DialogHeader>
              {selectedIds.length > 0 && (
                <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
                  {selectedImages.map((img) => (
                    <div
                      key={img.id}
                      className="flex items-center justify-between border-b py-1 last:border-b-0"
                    >
                      <span className="max-w-50 truncate">{img.filename}</span>
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
                  Remove
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Checkbox
          id="select-all"
          checked={
            images.length === 0
              ? false
              : selectedIds.length === images.length
                ? true
                : selectedIds.length > 0
                  ? 'indeterminate'
                  : false
          }
          onCheckedChange={handleSelectAll}
          disabled={images.length === 0}
        />
        <Label
          htmlFor="select-all"
          className={`text-sm ${images.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        >
          {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
        </Label>
      </div>
      {/* Search and Sort Controls */}
      {onSearchChange && onSortFieldChange && onSortOrderChange && (
        <div className="flex items-center gap-2">
          <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Search images..." />
          <SortDropdown
            sortField={sortField}
            sortOrder={sortOrder}
            onSortFieldChange={onSortFieldChange}
            onSortOrderChange={onSortOrderChange}
          />
          {hasActiveFilters && onResetFilters && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={onResetFilters}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset filters</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}
