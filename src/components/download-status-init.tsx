import { useEffect, useRef } from 'react'
import { useSetRowCallback, useSetValueCallback } from '@/schema/tinybase-schema'
import { getModelStatus, getBgRemovalModelStatus, checkFfmpegStatus } from '@/lib/tauri'

export function DownloadStatusInit() {
  const initModel = useSetRowCallback(
    'model_downloads',
    (info: { name: string; downloaded: boolean }) => info.name,
    (info: { name: string; downloaded: boolean }) => ({ downloaded: info.downloaded }),
    []
  )

  const ffmpegRef = useRef(false)
  const setInitFfmpeg = useSetValueCallback('ffmpegAvailable', () => ffmpegRef.current)

  useEffect(() => {
    ;(async () => {
      const [x2, x4, bg, ff] = await Promise.all([
        getModelStatus('realesrgan-x2'),
        getModelStatus('realesrgan-x4'),
        getBgRemovalModelStatus(),
        checkFfmpegStatus(),
      ])
      initModel({ name: 'realesrgan-x2', downloaded: x2.downloaded })
      initModel({ name: 'realesrgan-x4', downloaded: x4.downloaded })
      initModel({ name: 'bria-rmbg-1.4', downloaded: bg.downloaded })
      ffmpegRef.current = ff.available
      setInitFfmpeg()
    })()
  }, [])

  return null
}
