import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import {
  getAllCompressedImages,
  getAllUpscaledImages,
  revealInExplorer,
  openFile,
  checkDbHealth,
} from '@/lib/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'
import { error as logError } from '@/lib/logger'
import { formatBytes } from '@/lib/utils'
import { useSetValueCallback } from '@/schema/tinybase-schema'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { FolderSearch, Archive, Maximize2, FileImage } from 'lucide-react'

export const Route = createFileRoute('/_app/output')({
  loader: async () => {
    const [compressedImages, upscaledImages] = await Promise.all([
      getAllCompressedImages(),
      getAllUpscaledImages(),
    ])
    return { compressedImages, upscaledImages }
  },
  gcTime: 0,
  staleTime: 0,
  component: OutputPage,
})

type OutputType = 'all' | 'compressed' | 'upscaled'

type UpscaledVersion = {
  scale: number
  filepath: string
  size: number | null
  model: string | null
}

type OutputImage = {
  id: number
  filename: string
  filepath: string
  resultType: 'compressed' | 'upscaled'
  displayFilepath: string
  displaySize: number | null
  upscaled_scale?: number
}

function parseUpscaledVersions(
  versions: string | UpscaledVersion[] | undefined
): UpscaledVersion[] {
  if (!versions) return []
  try {
    return typeof versions === 'string' ? JSON.parse(versions) : versions
  } catch {
    return []
  }
}

// Memoized grid item to prevent unnecessary re-renders
const OutputGridItem = memo(function OutputGridItem({ image }: { image: OutputImage }) {
  const [imageError, setImageError] = useState(false)

  const isCompressed = image.resultType === 'compressed'
  const isUpscaled = image.resultType === 'upscaled'

  const handleOpen = useCallback(async () => {
    try {
      await openFile(image.displayFilepath)
    } catch (err) {
      logError(`Failed to open file: ${err}`)
    }
  }, [image.displayFilepath])

  const handleReveal = useCallback(async () => {
    try {
      await revealInExplorer(image.displayFilepath)
    } catch (err) {
      logError(`Failed to reveal file: ${err}`)
    }
  }, [image.displayFilepath])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="group bg-card hover:border-foreground/50 relative flex flex-col overflow-hidden border transition-all"
        >
          <div className="bg-muted relative aspect-4/3 w-full overflow-hidden">
            {!imageError ? (
              <img
                src={convertFileSrc(image.displayFilepath)}
                alt={image.filename}
                className="size-full object-cover"
                onError={() => setImageError(true)}
                loading="lazy"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <FolderSearch className="text-muted-foreground h-8 w-8" />
              </div>
            )}

            <div className="absolute top-2 left-2 flex gap-1">
              {isCompressed && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white"
                  title="Compressed"
                >
                  <Archive className="h-2.5 w-2.5" />
                </span>
              )}
              {isUpscaled && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white"
                  title={`Upscaled ${image.upscaled_scale}x`}
                >
                  <Maximize2 className="h-2.5 w-2.5" />
                </span>
              )}
            </div>

            <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/70 to-transparent px-2 py-1.5">
              <p className="truncate text-xs font-semibold text-white">{image.filename}</p>
              <div className="flex items-center justify-between text-[10px] text-white/80">
                <span className={isUpscaled ? 'text-blue-300' : 'text-green-300'}>
                  {image.displaySize ? formatBytes(image.displaySize) : 'Unknown'}
                </span>
                {isUpscaled && image.upscaled_scale && (
                  <span className="text-blue-300">{image.upscaled_scale}x</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleOpen}>
          <FileImage className="mr-2 h-4 w-4" />
          Open {isCompressed ? 'Compressed' : 'Upscaled'}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleReveal}>
          <FolderSearch className="mr-2 h-4 w-4" />
          Reveal in Explorer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

function OutputPage() {
  const loaderData = Route.useLoaderData()
  const [outputType, setOutputType] = useState<OutputType>('all')

  const setDbNeedsSync = useSetValueCallback('dbNeedsSync', () => true)

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

  // Memoized image processing
  const images = useMemo(() => {
    const compressedList: OutputImage[] = loaderData.compressedImages
      .filter((img) => img.compressed_filepath)
      .map((img) => ({
        id: img.id,
        filename: img.filename,
        filepath: img.compressed_filepath!,
        resultType: 'compressed' as const,
        displayFilepath: img.compressed_filepath!,
        displaySize: img.compressed_size ?? null,
      }))

    const upscaledList: OutputImage[] = []

    // Process upscaled images - each row has one upscaled version in the JSON
    for (const img of loaderData.upscaledImages) {
      const versions = parseUpscaledVersions(img.upscaled_versions)
      for (const version of versions) {
        upscaledList.push({
          id: img.id,
          filename: img.filename,
          filepath: version.filepath,
          resultType: 'upscaled' as const,
          displayFilepath: version.filepath,
          displaySize: version.size,
          upscaled_scale: version.scale,
        })
      }
    }

    if (outputType === 'all') {
      return [...compressedList, ...upscaledList]
    } else if (outputType === 'compressed') {
      return compressedList
    } else {
      return upscaledList
    }
  }, [loaderData, outputType])

  const handleOutputTypeChange = useCallback((type: OutputType) => {
    setOutputType(type)
  }, [])

  return (
    <>
      <div className="flex gap-2 border-b px-4 py-2">
        <Button
          variant={outputType === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleOutputTypeChange('all')}
        >
          All ({loaderData.compressedImages.length + loaderData.upscaledImages.length})
        </Button>
        <Button
          variant={outputType === 'compressed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleOutputTypeChange('compressed')}
        >
          <Archive className="mr-2 h-4 w-4" />
          Compressed ({loaderData.compressedImages.length})
        </Button>
        <Button
          variant={outputType === 'upscaled' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleOutputTypeChange('upscaled')}
        >
          <Maximize2 className="mr-2 h-4 w-4" />
          Upscaled ({loaderData.upscaledImages.length})
        </Button>
      </div>

      <section className="customScrollStyle relative h-full max-h-[calc(100vh-113px)] overflow-auto">
        {images.length === 0 ? (
          <div className="flex h-full flex-1 flex-col items-center justify-center gap-4">
            <div className="text-center">
              <Archive className="text-muted-foreground mx-auto h-10 w-10 opacity-20" />
              <p className="mt-2 text-sm font-medium">No processed images yet</p>
              <p className="text-muted-foreground text-xs">
                Compress or upscale some images from the main gallery to see them here.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {images.map((image) => (
              <OutputGridItem
                key={`${image.id}-${image.resultType}-${image.upscaled_scale ?? '0'}`}
                image={image}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
