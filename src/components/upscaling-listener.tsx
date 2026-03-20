import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { useSetRowCallback, useDelRowCallback } from '@/schema/tinybase-schema'

interface UpscaleProgress {
  id: number
  progress: number
  message: string
}

export function UpscalingListener() {
  const router = useRouter()

  const setUpscaling = useSetRowCallback(
    'upscalings',
    (param: UpscaleProgress) => param.id.toString(),
    (param: UpscaleProgress) => ({ progress: param.progress, message: param.message }),
    []
  )

  const delUpscaling = useDelRowCallback('upscalings', (param: UpscaleProgress) =>
    param.id.toString()
  )

  useEffect(() => {
    const unlistenProgress = listen<UpscaleProgress>('upscale-progress', (event) => {
      const { id, progress, message } = event.payload
      if (progress === 100 || progress === 0) {
        delUpscaling({ id, progress: 0, message: '' })
      } else {
        setUpscaling({ id, progress, message })
      }
    })

    const unlistenUpdated = listen('images-updated', () => {
      router.invalidate()
    })

    return () => {
      unlistenProgress.then((fn) => fn())
      unlistenUpdated.then((fn) => fn())
    }
  }, [router, setUpscaling, delUpscaling])

  return null
}
