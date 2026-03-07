import { useState, useCallback, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { formatBytes } from '@/lib/utils'
import { type Image, revealInExplorer, openFile, deleteImage } from '@/lib/tauri'
import { Check, ExternalLink, FolderSearch, Trash2, Upload } from 'lucide-react'

interface ImageGridProps {
  images: Image[]
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  onDelete: (id: number) => void
  onImport: () => void
  onDrop: (files: string[]) => void
}

export function ImageGrid({
  images,
  selectedIds,
  onSelectionChange,
  onDelete,
  onImport,
  onDrop,
}: ImageGridProps) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const unlistenDragEnter = listen<{ paths: string[] }>('tauri://drag-enter', () => {
      setIsDragging(true)
    })

    const unlistenDragLeave = listen<{ paths: string[] }>('tauri://drag-leave', () => {
      setIsDragging(false)
    })

    const unlistenDrop = listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
      setIsDragging(false)
      const files = event.payload.paths
      if (files && files.length > 0) {
        onDrop(files)
      }
    })

    return () => {
      unlistenDragEnter.then((fn) => fn())
      unlistenDragLeave.then((fn) => fn())
      unlistenDrop.then((fn) => fn())
    }
  }, [onDrop])

  const handleSelect = useCallback(
    (id: number, event: React.MouseEvent | React.KeyboardEvent) => {
      if (event.shiftKey && selectedIds.length > 0) {
        const lastSelected = selectedIds[selectedIds.length - 1]
        const allIds = images.map((img) => img.id)
        const lastIdx = allIds.indexOf(lastSelected)
        const currIdx = allIds.indexOf(id)
        const [start, end] = [lastIdx, currIdx].sort((a, b) => a - b)
        const range = allIds.slice(start, end + 1)
        onSelectionChange([...new Set([...selectedIds, ...range])])
      } else if (event.ctrlKey || event.metaKey) {
        if (selectedIds.includes(id)) {
          onSelectionChange(selectedIds.filter((i) => i !== id))
        } else {
          onSelectionChange([...selectedIds, id])
        }
      } else {
        if (selectedIds.includes(id)) {
          onSelectionChange(selectedIds.filter((i) => i !== id))
        } else {
          onSelectionChange([...selectedIds, id])
        }
      }
    },
    [images, selectedIds, onSelectionChange]
  )

  const handleKeyDown = useCallback(
    (id: number, event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handleSelect(id, event)
      }
    },
    [handleSelect]
  )

  return (
    <div className={`flex-1 overflow-auto p-4 ${isDragging ? 'bg-primary/5' : ''}`}>
      {images.length === 0 && !isDragging ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <Upload className="h-12 w-12" />
          <p className="text-lg">No images found</p>
          <p className="text-sm">Import images or drag and drop to get started</p>
          <button onClick={onImport} className="text-primary hover:underline">
            Import Images
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {images.map((image) => (
            <ImageGridItem
              key={image.id}
              image={image}
              isSelected={selectedIds.includes(image.id)}
              onSelect={handleSelect}
              onKeyDown={handleKeyDown}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {isDragging && (
        <div className="bg-primary/10 pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="border-primary bg-background rounded-lg border-2 border-dashed p-8 text-center">
            <Upload className="text-primary mx-auto h-12 w-12" />
            <p className="mt-4 text-lg font-semibold">Drop images here</p>
          </div>
        </div>
      )}
    </div>
  )
}

interface ImageGridItemProps {
  image: Image
  isSelected: boolean
  onSelect: (id: number, event: React.MouseEvent | React.KeyboardEvent) => void
  onKeyDown: (id: number, event: React.KeyboardEvent) => void
  onDelete: (id: number) => void
}

function ImageGridItem({ image, isSelected, onSelect, onKeyDown, onDelete }: ImageGridItemProps) {
  const [imageError, setImageError] = useState(false)

  const handleOpen = async () => {
    try {
      await openFile(image.filepath)
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  const handleReveal = async () => {
    try {
      await revealInExplorer(image.filepath)
    } catch (error) {
      console.error('Failed to reveal file:', error)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteImage(image.id)
      onDelete(image.id)
    } catch (error) {
      console.error('Failed to delete image:', error)
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={`group relative flex flex-col overflow-hidden rounded-lg shadow ${isSelected ? 'ring-primary ring-4' : 'hover:ring-muted-foreground/50 hover:ring-2'} `}
          style={{
            backgroundColor: '#f5f5f5',
            backgroundImage:
              'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            backgroundSize: '20px 20px',
          }}
          onClick={(e) => onSelect(image.id, e)}
          onKeyDown={(e) => onKeyDown(image.id, e)}
        >
          <div className="relative aspect-4/3 w-full overflow-hidden">
            {!imageError ? (
              <img
                src={convertFileSrc(image.filepath)}
                alt={image.filename}
                className="size-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="bg-muted flex size-full items-center justify-center">
                <FolderSearch className="text-muted-foreground h-8 w-8" />
              </div>
            )}

            <div className="absolute top-2 left-2">
              {isSelected && (
                <span className="bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full">
                  <Check className="h-4 w-4" />
                </span>
              )}
            </div>

            <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/70 to-transparent px-3 py-2">
              <p className="truncate text-sm font-semibold text-white">{image.filename}</p>
              <p className="text-xs text-white/80">
                {image.size ? formatBytes(image.size) : 'Unknown size'}
              </p>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleOpen}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open
        </ContextMenuItem>
        <ContextMenuItem onClick={handleReveal}>
          <FolderSearch className="mr-2 h-4 w-4" />
          Reveal in Explorer
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-red-500">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
