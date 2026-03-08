import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { getAllCompressedImages, type Image, revealInExplorer, openFile } from '@/lib/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'
import { error as logError } from '@/lib/logger'
import { formatBytes } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ExternalLink, FolderSearch, Archive } from 'lucide-react'

export const Route = createFileRoute('/_app/output')({
  loader: async () => {
    const images = await getAllCompressedImages()
    return { images }
  },
  staleTime: 0,
  component: OutputPage,
})

function OutputPage() {
  const loaderData = Route.useLoaderData()
  const [images, setImages] = useState<Image[]>(loaderData.images)

  useEffect(() => {
    setImages(loaderData.images)
  }, [loaderData])

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold tracking-tight">Output Gallery</h2>
        <p className="text-muted-foreground text-sm">
          View all your successfully processed images here.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {images.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-1 flex-col items-center justify-center gap-4 p-8">
            <Archive className="h-12 w-12 opacity-20" />
            <p className="text-lg">No processed images yet</p>
            <p className="text-sm">Compress some images from the main gallery to see them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {images.map((image) => (
              <OutputGridItem key={image.id} image={image} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function OutputGridItem({ image }: { image: Image }) {
  const [imageError, setImageError] = useState(false)

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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="group hover:ring-muted-foreground/50 relative flex flex-col overflow-hidden rounded-lg shadow hover:ring-2"
          style={{
            backgroundColor: '#f5f5f5',
            backgroundImage:
              'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            backgroundSize: '20px 20px',
          }}
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
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white shadow-md"
                title="Processed"
              >
                <Archive className="h-3 w-3" />
              </span>
            </div>

            <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/70 to-transparent px-3 py-2">
              <p className="truncate text-sm font-semibold text-white">{image.filename}</p>
              <div className="flex items-center justify-between text-xs text-white/80">
                <span className="font-medium text-green-300">
                  {image.size ? formatBytes(image.size) : 'Unknown'}
                </span>
              </div>
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
      </ContextMenuContent>
    </ContextMenu>
  )
}
