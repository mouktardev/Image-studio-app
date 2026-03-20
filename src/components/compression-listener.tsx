import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { useSetRowCallback, useDelRowCallback } from '@/schema/tinybase-schema'

interface CompressionProgress {
  id: number
  progress: number
  message: string
}

export function CompressionListener() {
  const router = useRouter()

  const setCompression = useSetRowCallback(
    'compressions',
    (param: CompressionProgress) => param.id.toString(),
    (param: CompressionProgress) => ({ progress: param.progress, message: param.message }),
    []
  )

  const delCompression = useDelRowCallback('compressions', (param: CompressionProgress) =>
    param.id.toString()
  )

  useEffect(() => {
    const unlistenProgress = listen<CompressionProgress>('compression-progress', (event) => {
      const { id, progress, message } = event.payload
      if (progress === 100 || progress === 0) {
        delCompression({ id, progress: 0, message: '' })
      } else {
        setCompression({ id, progress, message })
      }
    })

    const unlistenUpdated = listen('images-updated', () => {
      router.invalidate()
    })

    return () => {
      unlistenProgress.then((fn) => fn())
      unlistenUpdated.then((fn) => fn())
    }
  }, [router, setCompression, delCompression])

  return null
}
