import React, { useState, useEffect, useRef, useCallback } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getSetting } from '@/lib/tauri'
import { error as logError } from '@/lib/logger'

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

  const upToDateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isManualCheckRef = useRef(false)
  const downloadedBytesRef = useRef(0)
  const contentLengthRef = useRef(0)

  // Load update check setting
  const [updateChecksEnabled, setUpdateChecksEnabled] = useState(true)

  // Load settings on mount
  useEffect(() => {
    const loadUpdateCheckSetting = async () => {
      try {
        const enabled = await getSetting('update_checks_enabled')
        // If setting is null (not set), default to true
        // If setting is 'true', enable; otherwise disable
        setUpdateChecksEnabled(enabled !== 'false')
      } catch (err) {
        logError(`Failed to load update check setting: ${err}`)
        // Default to true if we can't load the setting
        setUpdateChecksEnabled(true)
      } finally {
        setIsLoading(false)
      }
    }

    loadUpdateCheckSetting()
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
    // Don't check if still loading settings
    if (isLoading) return

    // Don't check if updates are disabled
    if (!updateChecksEnabled) {
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
          // Cleanup existing timeout
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
            // Calculate progress only if we have content length
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
  const getUpdateStatusText = () => {
    // Loading state
    if (isLoading) {
      return 'Loading...'
    }

    // Error state
    if (error) {
      return 'Update error'
    }

    // Disabled state
    if (!updateChecksEnabled) {
      return 'Update checking disabled'
    }

    // Installing state
    if (isInstalling) {
      if (downloadProgress > 0 && downloadProgress < 100) {
        return `Downloading... ${downloadProgress}%`
      }
      if (downloadProgress === 100) {
        return 'Installing...'
      }
      return 'Preparing...'
    }

    // Checking state
    if (isChecking) return 'Checking for updates...'

    // Up to date (temporary)
    if (showUpToDate) return 'Up to date'

    // Update available
    if (updateAvailable) return 'Update available'

    // Default - click to check
    return 'Check for updates'
  }

  // Determine if component should be clickable
  const getClickable = () => {
    // Not clickable if loading, disabled, checking, or installing
    if (isLoading || !updateChecksEnabled || isChecking || isInstalling) {
      return false
    }

    // Clickable if update is available or if manual check is desired
    return updateAvailable || !showUpToDate
  }

  const isClickable = getClickable()
  const isDisabled = isLoading || !updateChecksEnabled || isChecking || isInstalling

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {isClickable ? (
        <button
          onClick={updateAvailable ? installUpdate : handleManualUpdateCheck}
          disabled={isDisabled}
          className="text-text/60 hover:text-text/80 text-xs tabular-nums transition-colors disabled:opacity-50"
          title={
            error ?? (updateAvailable ? 'Click to install update' : 'Click to check for updates')
          }
        >
          {getUpdateStatusText()}
        </button>
      ) : (
        <span
          className="text-text/60 text-xs tabular-nums"
          role="status"
          aria-live="polite"
          title={error ?? undefined}
        >
          {getUpdateStatusText()}
        </span>
      )}

      {/* Show error indicator */}
      {error && (
        <span className="text-destructive text-xs" title={error}>
          !
        </span>
      )}

      {/* Show progress bar during download */}
      {isInstalling && downloadProgress > 0 && downloadProgress < 100 && (
        <div
          className="min-w-0 flex-1"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={downloadProgress}
        >
          <div className="bg-muted/50 h-1.5 rounded">
            <div
              className="bg-primary/80 h-1.5 rounded transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default UpdateChecker
