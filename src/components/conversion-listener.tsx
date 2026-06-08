import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { useSetRowCallback, useDelRowCallback } from '@/schema/tinybase-schema'

interface ConversionProgress {
  id: number
  progress: number
  message: string
}

export function ConversionListener() {
  const router = useRouter()

  const setImageConversion = useSetRowCallback(
    'image_conversions',
    (param: ConversionProgress) => param.id.toString(),
    (param: ConversionProgress) => ({ progress: param.progress, message: param.message }),
    []
  )

  const delImageConversion = useDelRowCallback('image_conversions', (param: ConversionProgress) =>
    param.id.toString()
  )

  const setVideoConversion = useSetRowCallback(
    'video_conversions',
    (param: ConversionProgress) => param.id.toString(),
    (param: ConversionProgress) => ({ progress: param.progress, message: param.message }),
    []
  )

  const delVideoConversion = useDelRowCallback('video_conversions', (param: ConversionProgress) =>
    param.id.toString()
  )

  useEffect(() => {
    const unlistenImageProgress = listen<ConversionProgress>(
      'image-conversion-progress',
      (event) => {
        const { id, progress, message } = event.payload
        if (progress === 100 || progress === 0) {
          delImageConversion({ id, progress: 0, message: '' })
        } else {
          setImageConversion({ id, progress, message })
        }
      }
    )

    const unlistenVideoProgress = listen<ConversionProgress>(
      'video-conversion-progress',
      (event) => {
        const { id, progress, message } = event.payload
        if (progress === 100 || progress === 0) {
          delVideoConversion({ id, progress: 0, message: '' })
        } else {
          setVideoConversion({ id, progress, message })
        }
      }
    )

    const unlistenImagesUpdated = listen('images-updated', () => {
      router.invalidate()
    })

    const unlistenVideosUpdated = listen('videos-updated', () => {
      router.invalidate()
    })

    return () => {
      unlistenImageProgress.then((fn) => fn())
      unlistenVideoProgress.then((fn) => fn())
      unlistenImagesUpdated.then((fn) => fn())
      unlistenVideosUpdated.then((fn) => fn())
    }
  }, [router, setImageConversion, delImageConversion, setVideoConversion, delVideoConversion])

  return null
}
