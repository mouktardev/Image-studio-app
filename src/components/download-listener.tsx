import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useSetValueCallback } from '@/schema/tinybase-schema'

interface DownloadProgress {
  id: number
  progress: number
  message: string
}

interface FfmpegDownloadProgress {
  id: number
  progress: number
  message: string
  eta_seconds?: number | null
}

export function DownloadListener() {
  const upscaleProgressRef = useRef(0)
  const bgRemovalProgressRef = useRef(0)
  const ffmpegProgressRef = useRef(0)

  const setUpscaleProgress = useSetValueCallback(
    'upscaleDownloadProgress',
    () => upscaleProgressRef.current
  )
  const startUpscale = useSetValueCallback('isDownloadingUpscale', () => true)
  const finishUpscale = useSetValueCallback('isDownloadingUpscale', () => false)

  const setBgRemovalProgress = useSetValueCallback(
    'bgRemovalDownloadProgress',
    () => bgRemovalProgressRef.current
  )
  const startBgRemoval = useSetValueCallback('isDownloadingBgRemoval', () => true)
  const finishBgRemoval = useSetValueCallback('isDownloadingBgRemoval', () => false)

  const setFfmpegProgress = useSetValueCallback(
    'ffmpegDownloadProgress',
    () => ffmpegProgressRef.current
  )
  const startFfmpeg = useSetValueCallback('isDownloadingFfmpeg', () => true)
  const finishFfmpeg = useSetValueCallback('isDownloadingFfmpeg', () => false)
  const setFfmpegAvailable = useSetValueCallback('ffmpegAvailable', () => true)

  useEffect(() => {
    const unlisten1 = listen<DownloadProgress>('model-download-progress', (event) => {
      const { progress } = event.payload
      upscaleProgressRef.current = progress
      setUpscaleProgress()
      startUpscale()
      if (progress >= 100) {
        finishUpscale()
      }
    })

    const unlisten2 = listen<DownloadProgress>('bg-removal-model-download-progress', (event) => {
      const { progress } = event.payload
      bgRemovalProgressRef.current = progress
      setBgRemovalProgress()
      startBgRemoval()
      if (progress >= 100) {
        finishBgRemoval()
      }
    })

    const unlisten3 = listen<FfmpegDownloadProgress>('ffmpeg-download-progress', (event) => {
      const { progress } = event.payload
      ffmpegProgressRef.current = progress
      setFfmpegProgress()
      startFfmpeg()
      if (progress >= 100) {
        finishFfmpeg()
        setFfmpegAvailable()
      }
    })

    return () => {
      unlisten1.then((fn) => fn())
      unlisten2.then((fn) => fn())
      unlisten3.then((fn) => fn())
    }
  }, [
    setUpscaleProgress,
    startUpscale,
    finishUpscale,
    setBgRemovalProgress,
    startBgRemoval,
    finishBgRemoval,
    setFfmpegProgress,
    startFfmpeg,
    finishFfmpeg,
    setFfmpegAvailable,
  ])

  return null
}
