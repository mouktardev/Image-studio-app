import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { useSetRowCallback, useDelRowCallback } from '@/schema/tinybase-schema'

interface VideoCompressionProgress {
  id: number
  progress: number
  message: string
}

export function VideoCompressionListener() {
  const router = useRouter()

  const setCompression = useSetRowCallback(
    'video_compressions',
    (param: VideoCompressionProgress) => param.id.toString(),
    (param: VideoCompressionProgress) => ({ progress: param.progress, message: param.message }),
    []
  )

  const delCompression = useDelRowCallback(
    'video_compressions',
    (param: VideoCompressionProgress) => param.id.toString()
  )

  useEffect(() => {
    const unlistenProgress = listen<VideoCompressionProgress>(
      'video-compression-progress',
      (event) => {
        const { id, progress, message } = event.payload
        if (progress === 100 || progress === 0) {
          delCompression({ id, progress: 0, message: '' })
        } else {
          setCompression({ id, progress, message })
        }
      }
    )

    const unlistenUpdated = listen('videos-updated', () => {
      router.invalidate()
    })

    return () => {
      unlistenProgress.then((fn) => fn())
      unlistenUpdated.then((fn) => fn())
    }
  }, [router, setCompression, delCompression])

  return null
}
