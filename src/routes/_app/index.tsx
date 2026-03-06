import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { ImageTools } from '@/components/image-tools'
import { ImageGrid } from '@/components/image-grid'
import { getAllImages, addImage, deleteImagesByIds, selectFiles, type Image } from '@/lib/tauri'

export const Route = createFileRoute('/_app/')({
  component: IndexPage,
})

function IndexPage() {
  const [images, setImages] = useState<Image[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    loadImages()
  }, [])

  async function loadImages() {
    setIsLoading(true)
    try {
      const data = await getAllImages()
      setImages(data)
    } catch (error) {
      console.error('Failed to load images:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = useCallback(async () => {
    try {
      const files = await selectFiles()
      if (!files || files.length === 0) return

      setIsImporting(true)
      for (const filepath of files) {
        const filename = filepath.split(/[\\/]/).pop() || 'unknown'
        await addImage({
          filename,
          filepath,
          mimetype: null,
          size: null,
          width: null,
          height: null,
        })
      }
      await loadImages()
    } catch (error) {
      console.error('Failed to import images:', error)
    } finally {
      setIsImporting(false)
    }
  }, [])

  const handleDeleteSelected = useCallback(async (ids: number[]) => {
    try {
      await deleteImagesByIds(ids)
      setSelectedIds([])
      await loadImages()
    } catch (error) {
      console.error('Failed to delete images:', error)
    }
  }, [])

  const handleDeleteSingle = useCallback(async (id: number) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
    setSelectedIds((prev) => prev.filter((i) => i !== id))
  }, [])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="border-t-primary h-8 w-8 animate-spin rounded-full border-4 border-gray-300" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <ImageTools
        images={images}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onImport={handleImport}
        onDeleteSelected={handleDeleteSelected}
        isImporting={isImporting}
      />
      <ImageGrid
        images={images}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onDelete={handleDeleteSingle}
        onImport={handleImport}
      />
    </div>
  )
}
