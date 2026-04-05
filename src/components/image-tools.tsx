import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Trash2,
  Upload,
  Loader2,
  ArchiveRestore,
  Maximize2,
  Download,
  Scissors,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { error as logError } from '@/lib/logger'
import {
  getModelStatus,
  downloadModel,
  getUpscaleSettings,
  setUpscaleSettings,
  getBgRemovalModelStatus,
  downloadBgRemovalModel,
} from '@/lib/tauri'
import type { Image } from '@/lib/tauri'
import { SearchBar } from '@/components/search-bar'
import { SortDropdown } from '@/components/sort-dropdown'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const MODEL_SIZES: Record<string, number> = {
  'realesrgan-x2': 54 * 1024 * 1024, // Swin2SR-classical-sr-x2-64: ~54 MB
  'realesrgan-x4': 54 * 1024 * 1024, // swin2SR-realworld-sr-x4: ~54 MB
}

const BG_REMOVAL_MODEL_SIZE = 176 * 1024 * 1024 // BRIA RMBG-1.4 ONNX: ~176 MB

interface ImageToolsProps {
  images: Image[]
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  onImport: () => void
  onDeleteSelected: (ids: number[]) => void
  onCompressSelected: (ids: number[], quality: number) => void
  onUpscaleSelected: (ids: number[], scale: number, model: string) => void
  onRemoveBackgroundSelected?: (ids: number[]) => void
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
  onCompressSelected,
  onUpscaleSelected,
  onRemoveBackgroundSelected,
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
  const [openCompressDialog, setOpenCompressDialog] = useState(false)
  const [openUpscaleDialog, setOpenUpscaleDialog] = useState(false)
  const [openBgRemovalDialog, setOpenBgRemovalDialog] = useState(false)
  const [compressionQuality, setCompressionQuality] = useState([80])
  const [upscaleScale, setUpscaleScale] = useState(4)
  const [upscaleModel, setUpscaleModel] = useState('realesrgan-x4')
  const [gpuEnabled, setGpuEnabled] = useState(false)
  const [modelDownloaded, setModelDownloaded] = useState(false)
  const [modelSize, setModelSize] = useState<number | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  // Background removal state
  const [bgRemovalModelDownloaded, setBgRemovalModelDownloaded] = useState(false)
  const [bgRemovalModelSize, setBgRemovalModelSize] = useState<number | null>(null)
  const [isBgRemovalDownloading, setIsBgRemovalDownloading] = useState(false)

  const checkModelStatus = useCallback(async () => {
    try {
      const status = await getModelStatus(upscaleModel)
      setModelDownloaded(status.downloaded)
      setModelSize(status.size ?? null)
    } catch (err) {
      logError(`Failed to check model status: ${err}`)
      setModelDownloaded(false)
      setModelSize(null)
    }
  }, [upscaleModel])

  const loadUpscaleSettings = useCallback(async () => {
    try {
      const settings = await getUpscaleSettings()
      setUpscaleModel(settings.model)
      setUpscaleScale(settings.model.includes('x2') ? 2 : 4)
      setGpuEnabled(settings.gpu_enabled)
    } catch (err) {
      logError(`Failed to load upscale settings: ${err}`)
    }
  }, [])

  // Load settings once on component mount
  useEffect(() => {
    loadUpscaleSettings()
  }, [loadUpscaleSettings])

  // Check model status when dialog opens
  useEffect(() => {
    if (openUpscaleDialog) {
      checkModelStatus()
    }
  }, [openUpscaleDialog, checkModelStatus])

  // Check model status when model changes
  useEffect(() => {
    if (openUpscaleDialog && upscaleModel) {
      checkModelStatus()
    }
  }, [upscaleModel, openUpscaleDialog, checkModelStatus])

  const handleDownloadModel = async () => {
    setIsDownloading(true)
    try {
      await downloadModel(upscaleModel)
      await setUpscaleSettings(upscaleModel, gpuEnabled)
      setModelDownloaded(true)
    } catch (err) {
      logError(`Failed to download model: ${err}`)
    } finally {
      setIsDownloading(false)
    }
  }

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

  const handleUpscaleConfirm = async () => {
    await setUpscaleSettings(upscaleModel, gpuEnabled)
    onUpscaleSelected(selectedIds, upscaleScale, upscaleModel)
    setOpenUpscaleDialog(false)
  }

  // Background removal handlers
  const checkBgRemovalModelStatus = useCallback(async () => {
    try {
      const status = await getBgRemovalModelStatus()
      setBgRemovalModelDownloaded(status.downloaded)
      setBgRemovalModelSize(status.size ?? null)
    } catch (err) {
      logError(`Failed to check background removal model status: ${err}`)
      setBgRemovalModelDownloaded(false)
      setBgRemovalModelSize(null)
    }
  }, [])

  // Check background removal model status when dialog opens
  useEffect(() => {
    if (openBgRemovalDialog) {
      checkBgRemovalModelStatus()
    }
  }, [openBgRemovalDialog, checkBgRemovalModelStatus])

  const handleDownloadBgRemovalModel = async () => {
    setIsBgRemovalDownloading(true)
    try {
      await downloadBgRemovalModel()
      setBgRemovalModelDownloaded(true)
    } catch (err) {
      logError(`Failed to download background removal model: ${err}`)
    } finally {
      setIsBgRemovalDownloading(false)
    }
  }

  const handleBgRemovalConfirm = async () => {
    if (onRemoveBackgroundSelected) {
      onRemoveBackgroundSelected(selectedIds)
    }
    setOpenBgRemovalDialog(false)
  }

  const selectedImages = images.filter((img) => selectedIds.includes(img.id))

  return (
    <div className="bg-background flex flex-wrap items-center gap-2 border-b p-3">
      <Button onClick={onImport} disabled={isImporting} variant="secondary">
        {isImporting ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-1.5 h-4 w-4" />
        )}
        Import
      </Button>
      {selectedIds.length > 0 && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <MoreHorizontal className="mr-1.5 h-4 w-4" />
                Actions
                <span className="ml-1 text-xs">({selectedIds.length})</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setOpenCompressDialog(true)}>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Compress
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenUpscaleDialog(true)}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Upscale
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenBgRemovalDialog(true)}>
                <Scissors className="mr-2 h-4 w-4" />
                Remove Background
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setOpenDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
                    <Label className="text-sm font-medium">
                      Quality ({compressionQuality[0]}%)
                    </Label>
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
                <Button variant="outline" onClick={() => setOpenCompressDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCompressConfirm}>Start Compression</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openUpscaleDialog} onOpenChange={setOpenUpscaleDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upscale {selectedIds.length} image(s)</DialogTitle>
                <DialogDescription>
                  Upscale images using AI-powered super resolution.
                </DialogDescription>
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
                        {modelDownloaded && modelSize
                          ? formatBytes(modelSize)
                          : formatBytes(MODEL_SIZES[upscaleModel] || 0)}
                      </span>
                    </div>
                  </div>
                  {!modelDownloaded && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadModel}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      <span className="text-xs">
                        {isDownloading ? 'Downloading...' : 'Download'}
                      </span>
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

                {selectedIds.length > 0 && (
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
                <Button variant="outline" onClick={() => setOpenUpscaleDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpscaleConfirm} disabled={!modelDownloaded}>
                  Start Upscaling
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openBgRemovalDialog} onOpenChange={setOpenBgRemovalDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove Background from {selectedIds.length} image(s)</DialogTitle>
                <DialogDescription>
                  Remove backgrounds using AI-powered segmentation. Output will be PNG with
                  transparency.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        bgRemovalModelDownloaded ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {bgRemovalModelDownloaded ? 'Downloaded' : 'Not Downloaded'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {bgRemovalModelDownloaded && bgRemovalModelSize
                          ? formatBytes(bgRemovalModelSize)
                          : formatBytes(BG_REMOVAL_MODEL_SIZE)}
                      </span>
                    </div>
                  </div>
                  {!bgRemovalModelDownloaded && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadBgRemovalModel}
                      disabled={isBgRemovalDownloading}
                    >
                      {isBgRemovalDownloading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      <span className="text-xs">
                        {isBgRemovalDownloading ? 'Downloading...' : 'Download'}
                      </span>
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs">
                    BRIA RMBG-1.4 (~176 MB) - State-of-the-art background removal
                  </p>
                </div>

                {selectedIds.length > 0 && (
                  <div className="bg-muted max-h-40 overflow-y-auto rounded border p-2">
                    {selectedImages.map((img) => (
                      <div
                        key={img.id}
                        className="flex items-center justify-between border-b py-1 last:border-b-0"
                      >
                        <span className="max-w-37.5 truncate text-sm">{img.filename}</span>
                        <span className="text-muted-foreground text-xs">→ no_bg.png</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenBgRemovalDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleBgRemovalConfirm} disabled={!bgRemovalModelDownloaded}>
                  Remove Background
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
          <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Enter file name" />
          <SortDropdown
            sortField={sortField}
            sortOrder={sortOrder}
            onSortFieldChange={onSortFieldChange}
            onSortOrderChange={onSortOrderChange}
          />
          {hasActiveFilters && onResetFilters && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={onResetFilters}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset filters</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  )
}
