import React, { useState, useEffect, useRef, useCallback } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getSetting } from '@/lib/tauri'
import { error as logError } from '@/lib/logger'
import { getVersion } from '@tauri-apps/api/app'
import { Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface UpdateCheckerProps {
  className?: string
}

const UpdateChecker: React.FC<UpdateCheckerProps> = ({ className = '' }) => {
  // Update checking state
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [showUpToDate, setShowUpToDate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')

  const upToDateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isManualCheckRef = useRef(false)
  const downloadedBytesRef = useRef(0)
  const contentLengthRef = useRef(0)

  // Load update check setting
  const [updateChecksEnabled, setUpdateChecksEnabled] = useState(true)

  // Load settings and app version on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get app version
        const version = await getVersion()
        setAppVersion(version)

        // Get update check setting
        const enabled = await getSetting('update_checks_enabled')
        setUpdateChecksEnabled(enabled !== 'false')
      } catch (err) {
        logError(`Failed to load update checker data: ${err}`)
        // Default to true if we can't load the setting
        setUpdateChecksEnabled(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current)
      }
    }
  }, [])

  // Check for updates when settings change
  useEffect(() => {
    if (isLoading) return

    if (!updateChecksEnabled) {
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current)
        upToDateTimeoutRef.current = null
      }
      setIsChecking(false)
      setUpdateAvailable(false)
      setShowUpToDate(false)
      return
    }

    checkForUpdates()
  }, [updateChecksEnabled, isLoading])

  // Check for updates function
  const checkForUpdates = useCallback(async () => {
    if (!updateChecksEnabled || isChecking) return

    try {
      setIsChecking(true)
      setError(null)
      const update = await check()

      if (update) {
        setUpdateAvailable(true)
        setShowUpToDate(false)
      } else {
        setUpdateAvailable(false)

        if (isManualCheckRef.current) {
          setShowUpToDate(true)
          if (upToDateTimeoutRef.current) {
            clearTimeout(upToDateTimeoutRef.current)
          }
          upToDateTimeoutRef.current = setTimeout(() => {
            setShowUpToDate(false)
          }, 3000)
        }
      }
    } catch (err) {
      logError(`Failed to check for updates: ${err}`)
      setError(err instanceof Error ? err.message : 'Failed to check for updates')
    } finally {
      setIsChecking(false)
      isManualCheckRef.current = false
    }
  }, [updateChecksEnabled, isChecking])

  // Handle manual update check
  const handleManualUpdateCheck = useCallback(() => {
    if (!updateChecksEnabled) return
    isManualCheckRef.current = true
    checkForUpdates()
  }, [updateChecksEnabled, checkForUpdates])

  // Install update function
  const installUpdate = useCallback(async () => {
    if (!updateChecksEnabled) return
    try {
      setIsInstalling(true)
      setError(null)
      setDownloadProgress(0)
      downloadedBytesRef.current = 0
      contentLengthRef.current = 0

      const update = await check()

      if (!update) {
        logError('No update available during install attempt')
        return
      }

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            downloadedBytesRef.current = 0
            contentLengthRef.current = event.data.contentLength ?? 0
            break
          case 'Progress':
            downloadedBytesRef.current += event.data.chunkLength
            if (contentLengthRef.current > 0) {
              const progress = Math.round(
                (downloadedBytesRef.current / contentLengthRef.current) * 100
              )
              setDownloadProgress(Math.min(progress, 100))
            }
            break
          case 'Finished':
            setDownloadProgress(100)
            break
        }
      })
      await relaunch()
    } catch (err) {
      logError(`Failed to install update: ${err}`)
      setError(err instanceof Error ? err.message : 'Failed to install update')
    } finally {
      setIsInstalling(false)
      setDownloadProgress(0)
      downloadedBytesRef.current = 0
      contentLengthRef.current = 0
    }
  }, [updateChecksEnabled])

  // Get status text
  const getStatusText = () => {
    if (isLoading) return 'Loading...'
    if (error) return 'Error'
    if (!updateChecksEnabled) return 'Disabled'
    if (isInstalling) {
      if (downloadProgress > 0 && downloadProgress < 100) return `Downloading ${downloadProgress}%`
      if (downloadProgress === 100) return 'Installing...'
      return 'Preparing...'
    }
    if (isChecking) return 'Checking...'
    if (showUpToDate) return 'Up to date'
    if (updateAvailable) return 'Update available'
    return 'Check for updates'
  }

  // Get icon based on status
  const getStatusIcon = () => {
    if (isLoading || isChecking) return <Loader2 className="h-3 w-3 animate-spin" />
    if (error) return <AlertCircle className="text-destructive h-3 w-3" />
    if (updateAvailable) return <Download className="text-primary h-3 w-3" />
    if (isInstalling) return <Loader2 className="h-3 w-3 animate-spin" />
    return <CheckCircle className="h-3 w-3 text-emerald-500" />
  }

  // Get tooltip text
  const getTooltipText = () => {
    if (isLoading) return `v${appVersion} - Loading...`
    if (error) return `v${appVersion} - ${error}`
    if (!updateChecksEnabled) return `v${appVersion} - Update checking disabled`
    if (updateAvailable) return `v${appVersion} - Click to update`
    if (showUpToDate) return `v${appVersion} - You have the latest version`
    return `v${appVersion} - Click to check for updates`
  }

  const isDisabled = isLoading || !updateChecksEnabled || isChecking || isInstalling
  const isClickable = !isDisabled && (updateAvailable || (!isChecking && !showUpToDate))

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {/* Version line - always visible */}
      <span className="text-muted-foreground/60 px-1 text-[10px]" title={getTooltipText()}>
        v{appVersion || '0.0.0'}
      </span>

      {/* Status line */}
      {isClickable ? (
        <button
          onClick={updateAvailable ? installUpdate : handleManualUpdateCheck}
          disabled={isDisabled}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-1 text-xs transition-colors disabled:opacity-50"
          title={getTooltipText()}
        >
          {getStatusIcon()}
          <span className="max-w-[80px] truncate">{getStatusText()}</span>
        </button>
      ) : (
        <div
          className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs"
          title={getTooltipText()}
        >
          {getStatusIcon()}
          <span className="max-w-[80px] truncate">{getStatusText()}</span>
        </div>
      )}

      {/* Progress bar */}
      {isInstalling && downloadProgress > 0 && downloadProgress < 100 && (
        <div className="w-full">
          <div className="bg-muted/50 h-1 overflow-hidden rounded">
            <div
              className="bg-primary h-1 rounded transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default UpdateChecker
