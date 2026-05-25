import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { ImageGrid } from '@/components/image-grid'
import {
  getAllImages,
  deleteImagesByIds,
  selectFiles,
  importImagesBulk,
  compressImagesByIds,
  upscaleImagesByIds,
  removeBackgroundByIds,
  convertImagesByIds,
  checkDbHealth,
  getFilters,
  updateFilters,
  resetFilters,
  type Image,
  type ImageFormat,
} from '@/lib/tauri'
import {
  addNotification,
  toast,
  getSelections,
  setSelections,
  removeSelection,
  clearSelections,
} from '@/lib/notifications'
import { error as logError } from '@/lib/logger'
import { ImageTools } from '@/components/image-tools'
import { useSetValueCallback } from '@/schema/tinybase-schema'
import { CompressDialog, UpscaleDialog, BgRemovalDialog, ConvertFormatDialog } from '@/components/dialogs'

export const Route = createFileRoute('/_app/')({
  beforeLoad: async () => {
    // Fetch filters before route renders to prevent flash of unfiltered content
    const filters = await getFilters('index')
    return { filters }
  },
  loader: async ({ context }) => {
    const { filters } = context
    const [images, selectedIds] = await Promise.all([
      getAllImages({
        search: filters.search_query || undefined,
        sort_field: filters.sort_field,
        sort_order: filters.sort_order,
      }),
      getSelections(),
    ])
    return { images, selectedIds, filters }
  },
  gcTime: 0,
  staleTime: 0,
  component: IndexPage,
})

function IndexPage() {
  const loaderData = Route.useLoaderData()

  const [images, setImages] = useState<Image[]>(loaderData.images)
  const [selectedIds, setSelectedIds] = useState<number[]>(loaderData.selectedIds)
  const [isImporting, setIsImporting] = useState(false)

  // Initialize filter state from loader data (fetched via beforeLoad)
  const [searchQuery, setSearchQuery] = useState(loaderData.filters.search_query)
  const [sortField, setSortField] = useState<'name' | 'size' | 'date'>(
    loaderData.filters.sort_field
  )
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(loaderData.filters.sort_order)

  const resetFiltersHandler = useCallback(async () => {
    try {
      const data = await resetFilters('index')
      setSearchQuery(data.search_query)
      setSortField(data.sort_field)
      setSortOrder(data.sort_order)
      const params = {
        search: data.search_query || undefined,
        sort_field: data.sort_field as 'name' | 'size' | 'date',
        sort_order: data.sort_order as 'asc' | 'desc',
      }
      const result = await getAllImages(params)
      setImages(result)
    } catch (err) {
      logError(`Failed to reset filters: ${err}`)
    }
  }, [])

  const setDbNeedsSync = useSetValueCallback('dbNeedsSync', () => true)

  // Dialog state
  const [activeDialog, setActiveDialog] = useState<null | 'compress' | 'upscale' | 'bgremove' | 'convert'>(null)
  const [dialogImageIds, setDialogImageIds] = useState<number[]>([])

  // Sync search query changes to SQLite and reload images
  useEffect(() => {
    const syncAndReload = async () => {
      try {
        await updateFilters({ page: 'index', search_query: searchQuery })
        const updated = await getAllImages({
          search: searchQuery || undefined,
          sort_field: sortField,
          sort_order: sortOrder,
        })
        setImages(updated)
      } catch (err) {
        logError(`Failed to sync search and reload images: ${err}`)
      }
    }

    syncAndReload()
  }, [searchQuery])

  // Sync sort field changes to SQLite and reload images
  useEffect(() => {
    const syncAndReload = async () => {
      try {
        await updateFilters({ page: 'index', sort_field: sortField })
        const updated = await getAllImages({
          search: searchQuery || undefined,
          sort_field: sortField,
          sort_order: sortOrder,
        })
        setImages(updated)
      } catch (err) {
        logError(`Failed to sync sort field and reload images: ${err}`)
      }
    }

    syncAndReload()
  }, [sortField])

  // Sync sort order changes to SQLite and reload images
  useEffect(() => {
    const syncAndReload = async () => {
      try {
        await updateFilters({ page: 'index', sort_order: sortOrder })
        const updated = await getAllImages({
          search: searchQuery || undefined,
          sort_field: sortField,
          sort_order: sortOrder,
        })
        setImages(updated)
      } catch (err) {
        logError(`Failed to sync sort order and reload images: ${err}`)
      }
    }

    syncAndReload()
  }, [sortOrder])

  // Check if any filters are active
  const hasActiveFilters = searchQuery !== '' || sortField !== 'date' || sortOrder !== 'desc'

  // Check DB health on mount to detect orphaned records
  useEffect(() => {
    checkDbHealth()
      .then((orphanCount) => {
        if (orphanCount > 0) {
          setDbNeedsSync()
        }
      })
      .catch((err) => logError(`Failed to check DB health: ${err}`))
  }, [setDbNeedsSync])

  useEffect(() => {
    setImages(loaderData.images)
    setSelectedIds(loaderData.selectedIds)
  }, [loaderData])

  const handleSelectionChange = useCallback(async (ids: number[]) => {
    setSelectedIds(ids)
    try {
      await setSelections(ids)
    } catch (err) {
      logError(`Failed to sync selections: ${err}`)
    }
  }, [])

  const handleImport = useCallback(async () => {
    try {
      const files = await selectFiles()
      if (!files || files.length === 0) return

      setIsImporting(true)
      await importFiles(files)
      const updated = await getAllImages()
      setImages(updated)
    } catch (err) {
      logError(`Failed to import images: ${err}`)
    } finally {
      setIsImporting(false)
    }
  }, [])

  const handleDrop = useCallback(async (files: string[]) => {
    if (files.length === 0) return

    setIsImporting(true)
    try {
      await importFiles(files)
      const updated = await getAllImages()
      setImages(updated)
    } catch (err) {
      logError(`Failed to import dropped files: ${err}`)
    } finally {
      setIsImporting(false)
    }
  }, [])

  async function importFiles(filepaths: string[]) {
    const result = await importImagesBulk(filepaths)
    const { imported, duplicates, failed } = result

    if (imported > 0) {
      toast(`Imported ${imported} image${imported > 1 ? 's' : ''}`, 'success')
    }

    if (duplicates > 0) {
      toast(`${duplicates} file${duplicates > 1 ? 's' : ''} already exists, skipped`, 'info')
    }

    if (filepaths.length > 1) {
      const parts: string[] = []
      if (imported > 0) parts.push(`${imported} imported`)
      if (duplicates > 0) parts.push(`${duplicates} already exists`)
      if (failed > 0) parts.push(`${failed} failed`)

      await addNotification({
        message: parts.join(', '),
        status: failed > 0 ? 'error' : 'success',
      })
    }
  }

  const handleDeleteSelected = useCallback(async (ids: number[]) => {
    try {
      const count = ids.length
      await deleteImagesByIds(ids)
      setSelectedIds([])
      await clearSelections()
      setImages((prev) => prev.filter((img) => !ids.includes(img.id)))
      await addNotification({
        message: `Deleted ${count} image${count > 1 ? 's' : ''}`,
        status: 'success',
      })
    } catch (err) {
      logError(`Failed to delete images: ${err}`)
    }
  }, [])

  const handleDeleteSingle = useCallback(
    async (id: number) => {
      setImages((prev) => prev.filter((img) => img.id !== id))
      const newIds = selectedIds.filter((i) => i !== id)
      setSelectedIds(newIds)
      await removeSelection(id)
      await addNotification({
        message: 'Deleted 1 image',
        status: 'success',
      })
    },
    [selectedIds]
  )

  const handleCompressSelected = useCallback(async (ids: number[], quality: number) => {
    try {
      const count = ids.length
      await compressImagesByIds(ids, quality)
      const updated = await getAllImages()
      setImages(updated)
      await addNotification({
        message: `Compressed ${count} image${count > 1 ? 's' : ''}`,
        status: 'success',
      })
    } catch (err) {
      logError(`Failed to compress images: ${err}`)
    }
  }, [])

  const handleUpscaleSelected = useCallback(async (ids: number[], scale: number, model: string) => {
    try {
      const count = ids.length
      await upscaleImagesByIds(ids, scale, model)
      const updated = await getAllImages()
      setImages(updated)
      await addNotification({
        message: `Upscaled ${count} image${count > 1 ? 's' : ''} with ${model}`,
        status: 'success',
      })
    } catch (err) {
      logError(`Failed to upscale images: ${err}`)
    }
  }, [])

  const handleRemoveBackgroundSelected = useCallback(async (ids: number[]) => {
    try {
      const count = ids.length
      await removeBackgroundByIds(ids)
      const updated = await getAllImages()
      setImages(updated)
      await addNotification({
        message: `Removed background from ${count} image${count > 1 ? 's' : ''}`,
        status: 'success',
      })
    } catch (err) {
      logError(`Failed to remove backgrounds: ${err}`)
    }
  }, [])

  // Dialog open handlers
  const handleConvertSelected = useCallback(async (ids: number[], format: string) => {
    try {
      const count = ids.length
      await convertImagesByIds(ids, format as ImageFormat)
      const updated = await getAllImages()
      setImages(updated)
      await addNotification({
        message: `Converted ${count} image${count > 1 ? 's' : ''} to ${format.toUpperCase()}`,
        status: 'success',
      })
    } catch (err) {
      logError(`Failed to convert images: ${err}`)
    }
  }, [])

  const openCompressDialog = useCallback((ids: number[]) => {
    setDialogImageIds(ids)
    setActiveDialog('compress')
  }, [])

  const openUpscaleDialog = useCallback((ids: number[]) => {
    setDialogImageIds(ids)
    setActiveDialog('upscale')
  }, [])

  const openBgRemovalDialog = useCallback((ids: number[]) => {
    setDialogImageIds(ids)
    setActiveDialog('bgremove')
  }, [])

  const openConvertDialog = useCallback((ids: number[]) => {
    setDialogImageIds(ids)
    setActiveDialog('convert')
  }, [])

  const closeDialog = useCallback(() => {
    setActiveDialog(null)
    setDialogImageIds([])
  }, [])

  return (
    <>
      {isImporting && (
        <div className="bg-background/80 absolute inset-0 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">Importing...</p>
          </div>
        </div>
      )}
      <ImageTools
        images={images}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onImport={handleImport}
        onDeleteSelected={handleDeleteSelected}
        onCompressClick={() => openCompressDialog(selectedIds)}
        onUpscaleClick={() => openUpscaleDialog(selectedIds)}
        onBgRemovalClick={() => openBgRemovalDialog(selectedIds)}
        onConvertClick={() => openConvertDialog(selectedIds)}
        isImporting={isImporting}
        // Filter props
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortFieldChange={setSortField}
        onSortOrderChange={setSortOrder}
        hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFiltersHandler}
      />
      <ImageGrid
        images={images}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onDelete={handleDeleteSingle}
        onImport={handleImport}
        onDrop={handleDrop}
        onCompressClick={openCompressDialog}
        onUpscaleClick={openUpscaleDialog}
        onBgRemovalClick={openBgRemovalDialog}
        onConvertClick={openConvertDialog}
      />

      {/* Dialogs */}
      <CompressDialog
        images={images}
        imageIds={dialogImageIds}
        open={activeDialog === 'compress'}
        onOpenChange={(open) => !open && closeDialog()}
        onConfirm={handleCompressSelected}
      />
      <UpscaleDialog
        images={images}
        imageIds={dialogImageIds}
        open={activeDialog === 'upscale'}
        onOpenChange={(open) => !open && closeDialog()}
        onConfirm={handleUpscaleSelected}
      />
      <BgRemovalDialog
        images={images}
        imageIds={dialogImageIds}
        open={activeDialog === 'bgremove'}
        onOpenChange={(open) => !open && closeDialog()}
        onConfirm={handleRemoveBackgroundSelected}
      />
      <ConvertFormatDialog
        items={images.map((img) => ({ id: img.id, filename: img.filename, size: img.size }))}
        ids={dialogImageIds}
        open={activeDialog === 'convert'}
        onOpenChange={(open) => !open && closeDialog()}
        onConfirm={handleConvertSelected}
        isVideo={false}
      />
    </>
  )
}
