import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  initDatabase,
  dbExists,
  getSetting,
  setSetting,
  revealInExplorer,
  selectFolder,
  getDbPath,
  syncDatabase,
  getUpscaleSettings,
  setUpscaleSettings as saveUpscaleSettings,
  getModelStatus,
  downloadModel,
  getBgRemovalModelStatus,
  downloadBgRemovalModel,
  checkFfmpegStatus,
  downloadFfmpeg,
} from '@/lib/tauri'
import { error as logError } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FolderOpenIcon,
  FolderIcon,
  RefreshCw,
  EyeIcon,
  DatabaseZap,
  Sun,
  Moon,
  Monitor,
  Download,
  Scissors,
  Maximize2,
  Video,
} from 'lucide-react'
import { toast } from '@/lib/notifications'
import { useTheme } from '@/components/theme-provider'
import { formatBytes } from '@/lib/utils'

const MODEL_SIZES: Record<string, number> = {
  'realesrgan-x2': 54 * 1024 * 1024,
  'realesrgan-x4': 54 * 1024 * 1024,
}

const BG_REMOVAL_MODEL_SIZE = 176 * 1024 * 1024

export const Route = createFileRoute('/_app/settings')({
  loader: async () => {
    const [
      dbInitialized,
      outputPath,
      dbPathResult,
      upscaleSettings,
      modelStatus,
      bgRemovalStatus,
      ffmpegStatus,
      updateChecksEnabled,
    ] = await Promise.all([
      dbExists(),
      getSetting('output'),
      getDbPath(),
      getUpscaleSettings(),
      getModelStatus((await getUpscaleSettings()).model),
      getBgRemovalModelStatus(),
      checkFfmpegStatus(),
      getSetting('update_checks_enabled'),
    ])

    return {
      dbInitialized,
      outputPath,
      dbPath: dbPathResult,
      upscaleSettings,
      modelStatus,
      bgRemovalStatus,
      ffmpegStatus,
      updateChecksEnabled: updateChecksEnabled !== 'false',
    }
  },
  gcTime: 0,
  staleTime: 0,
  component: SettingsPage,
})

function SettingsPage() {
  const router = useRouter()
  const loaderData = Route.useLoaderData()
  const { theme, setTheme } = useTheme()

  const [isInitialized, setIsInitialized] = useState(loaderData.dbInitialized)
  const [outputPath, setOutputPath] = useState(loaderData.outputPath || '')
  const [dbPath, setDbPath] = useState(loaderData.dbPath || '')
  const [isInitializing, setIsInitializing] = useState(false)
  const [isChangingFolder, setIsChangingFolder] = useState(false)
  const [updateChecksEnabled, setUpdateChecksEnabled] = useState(loaderData.updateChecksEnabled)

  const [upscaleSettings, setUpscaleSettings] = useState(loaderData.upscaleSettings)
  const [modelStatus, setModelStatus] = useState(loaderData.modelStatus)
  const [isDownloadingUpscale, setIsDownloadingUpscale] = useState(false)

  const [bgRemovalModelStatus, setBgRemovalModelStatus] = useState(loaderData.bgRemovalStatus)
  const [isDownloadingBgRemoval, setIsDownloadingBgRemoval] = useState(false)

  const [ffmpegStatus, setFfmpegStatus] = useState(loaderData.ffmpegStatus)
  const [isDownloadingFfmpeg, setIsDownloadingFfmpeg] = useState(false)

  async function handleInitDatabase() {
    setIsInitializing(true)
    try {
      await initDatabase()
      setIsInitialized(true)
      const exists = await dbExists()
      if (exists) {
        const path = await getSetting('output')
        if (path) setOutputPath(path)
        const db = await getDbPath()
        if (db) setDbPath(db)
      }
    } catch (err) {
      logError(`Failed to initialize database: ${err}`)
    } finally {
      setIsInitializing(false)
    }
  }

  async function handleRevealFolder() {
    if (!outputPath) return
    try {
      await revealInExplorer(outputPath)
    } catch (err) {
      logError(`Failed to reveal folder: ${err}`)
    }
  }

  async function handleRevealDbFolder() {
    if (!dbPath) return
    try {
      await revealInExplorer(dbPath)
    } catch (err) {
      logError(`Failed to reveal database folder: ${err}`)
    }
  }

  async function handleChangeFolder() {
    setIsChangingFolder(true)
    try {
      const selected = await selectFolder()
      if (selected) {
        await setSetting('output', selected)
        setOutputPath(selected)
      }
    } catch (err) {
      logError(`Failed to change folder: ${err}`)
    } finally {
      setIsChangingFolder(false)
    }
  }

  return (
    <section className="customScrollStyle relative h-full max-h-[calc(100vh-67px)]">
      <div className="mx-auto max-w-2xl px-3 py-8">
        <h1 className="mb-6 text-3xl font-bold">Settings</h1>

        {/* Database Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Database Status</CardTitle>
                <CardDescription>
                  Manage your SQLite database and check for orphaned files
                </CardDescription>
              </div>
              {isInitialized !== null && (
                <Badge variant={isInitialized ? 'default' : 'destructive'}>
                  {isInitialized ? 'Initialized' : 'Not Initialized'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!isInitialized && (
              <Button onClick={handleInitDatabase} disabled={isInitializing}>
                {isInitializing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  'Initialize Database'
                )}
              </Button>
            )}
            {isInitialized && (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">Database is ready to use.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleRevealDbFolder}>
                    <EyeIcon className="mr-2 h-4 w-4" />
                    Reveal Database Folder
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const deletedCount = await syncDatabase()
                        if (deletedCount > 0) {
                          toast(`Cleaned up ${deletedCount} orphaned records.`, 'success')
                        } else {
                          toast('Database is perfectly in sync with filesystem.', 'info')
                        }
                        await router.invalidate()
                      } catch (err) {
                        logError(`Failed to sync database: ${err}`)
                        toast('Failed to sync database', 'error')
                      }
                    }}
                  >
                    <DatabaseZap className="mr-2 h-4 w-4" />
                    Sync / Clean DB
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* Output Folder */}
        <Card>
          <CardHeader>
            <CardTitle>Output Folder</CardTitle>
            <CardDescription>
              Configure where processed images and videos will be saved
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <FolderIcon className="text-muted-foreground h-5 w-5" />
              <code className="bg-muted relative flex-1 overflow-x-auto rounded px-[0.3rem] py-[0.2rem] font-mono text-sm">
                {outputPath || 'No folder selected'}
              </code>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRevealFolder} disabled={!outputPath}>
                <EyeIcon className="mr-2 h-4 w-4" />
                Reveal in Explorer
              </Button>
              <Button
                variant="outline"
                onClick={handleChangeFolder}
                disabled={isChangingFolder || !isInitialized}
              >
                <FolderOpenIcon className="mr-2 h-4 w-4" />
                {isChangingFolder ? 'Changing...' : 'Change Folder'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* Update Settings */}
        <Card className="my-4">
          <CardHeader>
            <CardTitle>Updates</CardTitle>
            <CardDescription>Configure application update behavior</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Checkbox
                id="update-checks"
                checked={updateChecksEnabled}
                onCheckedChange={(checked) => {
                  const value = Boolean(checked)
                  setUpdateChecksEnabled(value)
                  setSetting('update_checks_enabled', value ? 'true' : 'false').catch((err) => {
                    logError(`Failed to save update check setting: ${err}`)
                  })
                }}
              />
              <label
                htmlFor="update-checks"
                className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Enable automatic update checks
              </label>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              When enabled, the app will periodically check for updates
            </p>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* Theme */}
        <Card className="my-4">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how the application looks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
              >
                <Sun className="mr-2 h-4 w-4" />
                Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
              >
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('system')}
              >
                <Monitor className="mr-2 h-4 w-4" />
                System
              </Button>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* AI Image Processing */}
        <Card className="my-4">
          <CardHeader>
            <CardTitle>AI Image Processing</CardTitle>
            <CardDescription>Configure AI-powered image enhancement models</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Upscale Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Maximize2 className="text-muted-foreground h-5 w-5" />
                <h3 className="font-semibold">Upscale</h3>
                <span className="text-muted-foreground text-xs">
                  Increase image resolution using AI super-resolution
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Model</Label>
                  <Select
                    value={upscaleSettings?.model || 'realesrgan-x4'}
                    onValueChange={async (model) => {
                      try {
                        await saveUpscaleSettings(model)
                        setUpscaleSettings({ ...upscaleSettings!, model })
                        const status = await getModelStatus(model)
                        setModelStatus(status)
                      } catch (err) {
                        logError(`Failed to save upscale model: ${err}`)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realesrgan-x2">
                        <span>Swin2SR Classical x2</span>
                        <span className="text-muted-foreground ml-2 text-xs">(~54 MB)</span>
                      </SelectItem>
                      <SelectItem value="realesrgan-x4">
                        <span>Swin2SR Real-world x4</span>
                        <span className="text-muted-foreground ml-2 text-xs">(~54 MB)</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Model Status</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant={modelStatus?.downloaded ? 'default' : 'secondary'}>
                      {modelStatus?.downloaded ? 'Downloaded' : 'Not Downloaded'}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {modelStatus?.downloaded && modelStatus?.size
                        ? formatBytes(modelStatus.size)
                        : formatBytes(MODEL_SIZES[upscaleSettings?.model || 'realesrgan-x4'] || 0)}
                    </span>
                    {modelStatus?.downloaded && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (modelStatus?.path) {
                            revealInExplorer(modelStatus.path).catch((err) =>
                              logError(`Failed to reveal model: ${err}`)
                            )
                          }
                        }}
                      >
                        <EyeIcon className="mr-2 h-4 w-4" />
                        Reveal
                      </Button>
                    )}
                    {!modelStatus?.downloaded && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloadingUpscale}
                        onClick={async () => {
                          setIsDownloadingUpscale(true)
                          try {
                            const model = upscaleSettings?.model || 'realesrgan-x4'
                            await downloadModel(model)
                            const status = await getModelStatus(model)
                            setModelStatus(status)
                            toast('Model downloaded successfully', 'success')
                          } catch (err) {
                            logError(`Failed to download model: ${err}`)
                            toast('Failed to download model', 'error')
                          } finally {
                            setIsDownloadingUpscale(false)
                          }
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {isDownloadingUpscale ? 'Downloading...' : 'Download'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Background Removal Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Scissors className="text-muted-foreground h-5 w-5" />
                <h3 className="font-semibold">Background Removal</h3>
                <span className="text-muted-foreground text-xs">
                  AI-powered background removal (processed on CPU)
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Model</Label>
                  <Select value="bria-rmbg-1.4">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bria-rmbg-1.4">
                        <span>BRIA RMBG-1.4</span>
                        <span className="text-muted-foreground ml-2 text-xs">(~176 MB)</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Model Status</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant={bgRemovalModelStatus?.downloaded ? 'default' : 'secondary'}>
                      {bgRemovalModelStatus?.downloaded ? 'Downloaded' : 'Not Downloaded'}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {bgRemovalModelStatus?.downloaded && bgRemovalModelStatus?.size
                        ? formatBytes(bgRemovalModelStatus.size)
                        : formatBytes(BG_REMOVAL_MODEL_SIZE)}
                    </span>
                    {bgRemovalModelStatus?.downloaded && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (bgRemovalModelStatus?.path) {
                            revealInExplorer(bgRemovalModelStatus.path).catch((err) =>
                              logError(`Failed to reveal model: ${err}`)
                            )
                          }
                        }}
                      >
                        <EyeIcon className="mr-2 h-4 w-4" />
                        Reveal
                      </Button>
                    )}
                    {!bgRemovalModelStatus?.downloaded && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloadingBgRemoval}
                        onClick={async () => {
                          setIsDownloadingBgRemoval(true)
                          try {
                            await downloadBgRemovalModel()
                            const status = await getBgRemovalModelStatus()
                            setBgRemovalModelStatus(status)
                            toast('Model downloaded successfully', 'success')
                          } catch (err) {
                            logError(`Failed to download model: ${err}`)
                            toast('Failed to download model', 'error')
                          } finally {
                            setIsDownloadingBgRemoval(false)
                          }
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {isDownloadingBgRemoval ? 'Downloading...' : 'Download'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* Video Processing Section */}
        <Card className="my-4">
          <CardHeader>
            <CardTitle>Video Processing</CardTitle>
            <CardDescription>Configure video processing tools for compression</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Video className="text-muted-foreground h-5 w-5" />
                <h3 className="font-semibold">FFmpeg</h3>
                <span className="text-muted-foreground text-xs">
                  Download FFmpeg for video compression and format conversion
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">FFmpeg Status</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant={ffmpegStatus?.available ? 'default' : 'secondary'}>
                      {ffmpegStatus?.available ? 'Downloaded' : 'Not Downloaded'}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {ffmpegStatus?.available && ffmpegStatus?.size
                        ? formatBytes(ffmpegStatus.size)
                        : '~80 MB download'}
                    </span>
                    {ffmpegStatus?.available && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (ffmpegStatus?.path) {
                            revealInExplorer(ffmpegStatus.path).catch((err) =>
                              logError(`Failed to reveal FFmpeg: ${err}`)
                            )
                          }
                        }}
                      >
                        <EyeIcon className="mr-2 h-4 w-4" />
                        Reveal
                      </Button>
                    )}
                    {!ffmpegStatus?.available && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloadingFfmpeg}
                        onClick={async () => {
                          setIsDownloadingFfmpeg(true)
                          try {
                            await downloadFfmpeg()
                            const status = await checkFfmpegStatus()
                            setFfmpegStatus(status)
                            toast('FFmpeg downloaded successfully', 'success')
                          } catch (err) {
                            logError(`Failed to download FFmpeg: ${err}`)
                            toast('Failed to download FFmpeg', 'error')
                          } finally {
                            setIsDownloadingFfmpeg(false)
                          }
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {isDownloadingFfmpeg ? 'Downloading...' : 'Download'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
