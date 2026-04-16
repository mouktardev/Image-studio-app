import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { useSetRowCallback, useDelRowCallback } from '@/schema/tinybase-schema'
import type { VideoBgRemovalProgress } from '@/lib/tauri'

export function VideoBgRemovalListener() {
  const router = useRouter()

  const setVideoBgRemoval = useSetRowCallback(
    'video_bg_removals',
    (param: VideoBgRemovalProgress) => param.id.toString(),
    (param: VideoBgRemovalProgress) => ({
      progress: param.progress,
      message: param.message,
      eta_seconds: param.eta_seconds ?? 0,
    }),
    []
  )

  const delVideoBgRemoval = useDelRowCallback(
    'video_bg_removals',
    (param: VideoBgRemovalProgress) => param.id.toString()
  )

  useEffect(() => {
    const unlistenProgress = listen<VideoBgRemovalProgress>(
      'video-bg-removal-progress',
      (event) => {
        const { id, progress, message, eta_seconds } = event.payload
        if (progress === 100 || progress === 0) {
          delVideoBgRemoval({ id, progress: 0, message: '', eta_seconds: null })
        } else {
          setVideoBgRemoval({ id, progress, message, eta_seconds })
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
  }, [router, setVideoBgRemoval, delVideoBgRemoval])

  return null
}
