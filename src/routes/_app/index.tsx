import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { ImageTools } from '@/components/image-tools'
import { ImageGrid } from '@/components/image-grid'
import {
  getAllImages,
  deleteImagesByIds,
  selectFiles,
  importImagesBulk,
  type Image,
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

export const Route = createFileRoute('/_app/')({
  loader: async () => {
    const [images, selectedIds] = await Promise.all([getAllImages(), getSelections()])
    return { images, selectedIds }
  },
  staleTime: 0,
  component: IndexPage,
})

function IndexPage() {
  const loaderData = Route.useLoaderData()

  const [images, setImages] = useState<Image[]>(loaderData.images)
  const [selectedIds, setSelectedIds] = useState<number[]>(loaderData.selectedIds)
  const [isImporting, setIsImporting] = useState(false)

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

  return (
    <div className="relative flex flex-1 flex-col">
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
        isImporting={isImporting}
      />
      <ImageGrid
        images={images}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onDelete={handleDeleteSingle}
        onImport={handleImport}
        onDrop={handleDrop}
      />
    </div>
  )
}
