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
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/utils'
import { type Image, revealInExplorer, openFile, deleteImage } from '@/lib/tauri'
import { error as logError } from '@/lib/logger'
import {
  Check,
  ExternalLink,
  FolderSearch,
  Trash2,
  Upload,
  Archive,
  FileImage,
  Columns,
} from 'lucide-react'
import { useRow } from '@/schema/tinybase-schema'
import { ImageCompare } from '@/components/image-compare'

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
  const [compareImage, setCompareImage] = useState<Image | null>(null)

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
              onCompare={setCompareImage}
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

      <ImageCompare
        image={compareImage}
        open={!!compareImage}
        onOpenChange={(open) => !open && setCompareImage(null)}
      />
    </div>
  )
}

interface ImageGridItemProps {
  image: Image
  isSelected: boolean
  onSelect: (id: number, event: React.MouseEvent | React.KeyboardEvent) => void
  onKeyDown: (id: number, event: React.KeyboardEvent) => void
  onDelete: (id: number) => void
  onCompare: (image: Image) => void
}

function ImageGridItem({
  image,
  isSelected,
  onSelect,
  onKeyDown,
  onDelete,
  onCompare,
}: ImageGridItemProps) {
  const [imageError, setImageError] = useState(false)
  const compressingState = useRow('compressions', image.id.toString())

  const handleOpen = async () => {
    try {
      await openFile(image.filepath)
    } catch (err) {
      logError(`Failed to open file: ${err}`)
    }
  }

  const handleReveal = async () => {
    try {
      await revealInExplorer(image.filepath)
    } catch (err) {
      logError(`Failed to reveal file: ${err}`)
    }
  }

  const handleOpenCompressed = async () => {
    if (!image.compressed_filepath) return
    try {
      await openFile(image.compressed_filepath)
    } catch (err) {
      logError(`Failed to open compressed file: ${err}`)
    }
  }

  const handleRevealCompressed = async () => {
    if (!image.compressed_filepath) return
    try {
      await revealInExplorer(image.compressed_filepath)
    } catch (err) {
      logError(`Failed to reveal compressed file: ${err}`)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteImage(image.id)
      onDelete(image.id)
    } catch (err) {
      logError(`Failed to delete image: ${err}`)
    }
  }

  const handleCompare = () => {
    if (!image.compressed_filepath) return
    onCompare(image)
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

            <div className="absolute top-2 left-2 flex gap-1">
              {isSelected && (
                <span className="bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full shadow-md">
                  <Check className="h-4 w-4" />
                </span>
              )}
              {image.compressed_filepath && (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white shadow-md"
                  title="Compressed"
                >
                  <Archive className="h-3 w-3" />
                </span>
              )}
            </div>

            <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/70 to-transparent px-3 py-2">
              <p className="truncate text-sm font-semibold text-white">{image.filename}</p>
              <div className="flex items-center justify-between text-xs text-white/80">
                <span>{image.size ? formatBytes(image.size) : 'Unknown'}</span>
                {image.compressed_size && (
                  <span className="ml-2 text-green-300" title="Compressed Size">
                    {formatBytes(image.compressed_size)}
                  </span>
                )}
              </div>
            </div>

            {Object.keys(compressingState).length > 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 p-4 text-white backdrop-blur-sm">
                <Progress value={compressingState.progress as number} className="mb-2 h-2 w-full" />
                <span className="text-center text-xs font-medium">
                  {compressingState.message as string}
                </span>
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleOpen}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open Original
        </ContextMenuItem>
        <ContextMenuItem onClick={handleReveal}>
          <FolderSearch className="mr-2 h-4 w-4" />
          Reveal Original
        </ContextMenuItem>

        {image.compressed_filepath && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleCompare}>
              <Columns className="mr-2 h-4 w-4" />
              Compare
            </ContextMenuItem>
            <ContextMenuItem onClick={handleOpenCompressed}>
              <FileImage className="mr-2 h-4 w-4" />
              Open Compressed
            </ContextMenuItem>
            <ContextMenuItem onClick={handleRevealCompressed}>
              <FolderSearch className="mr-2 h-4 w-4" />
              Reveal Compressed
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-red-500">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
