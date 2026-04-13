import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  type UpscaleSettings,
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
  Cpu,
  Zap,
  Scissors,
  Maximize2,
} from 'lucide-react'
import { toast } from '@/lib/notifications'
import { useTheme } from '@/components/theme-provider'
import { formatBytes } from '@/lib/utils'

const MODEL_SIZES: Record<string, number> = {
  'realesrgan-x2': 54 * 1024 * 1024, // Swin2SR-classical-sr-x2-64: ~54 MB
  'realesrgan-x4': 54 * 1024 * 1024, // swin2SR-realworld-sr-x4: ~54 MB
}

const BG_REMOVAL_MODEL_SIZE = 176 * 1024 * 1024 // BRIA RMBG-1.4 ONNX: ~176 MB

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const [outputPath, setOutputPath] = useState<string>('')
  const [dbPath, setDbPath] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isChangingFolder, setIsChangingFolder] = useState(false)
  const [updateChecksEnabled, setUpdateChecksEnabled] = useState(true)

  // AI Image Processing - Upscale
  const [upscaleSettings, setUpscaleSettings] = useState<UpscaleSettings | null>(null)
  const [modelStatus, setModelStatus] = useState<{
    name: string
    downloaded: boolean
    path: string
    size: number | null
  } | null>(null)
  const [isDownloadingUpscale, setIsDownloadingUpscale] = useState(false)

  // AI Image Processing - Background Removal
  const [bgRemovalModelStatus, setBgRemovalModelStatus] = useState<{
    name: string
    downloaded: boolean
    path: string
    size: number | null
  } | null>(null)
  const [isDownloadingBgRemoval, setIsDownloadingBgRemoval] = useState(false)

  useEffect(() => {
    loadSettings()
    loadUpdateCheckSetting()
    loadUpscaleSettings()
    loadBgRemovalModelStatus()
  }, [])

  async function loadUpscaleSettings() {
    try {
      const settings = await getUpscaleSettings()
      setUpscaleSettings(settings)
      const status = await getModelStatus(settings.model)
      setModelStatus(status)
    } catch (err) {
      logError(`Failed to load upscale settings: ${err}`)
    }
  }

  async function loadBgRemovalModelStatus() {
    try {
      const status = await getBgRemovalModelStatus()
      setBgRemovalModelStatus(status)
    } catch (err) {
      logError(`Failed to load background removal model status: ${err}`)
    }
  }

  async function loadUpdateCheckSetting() {
    try {
      const enabled = await getSetting('update_checks_enabled')
      setUpdateChecksEnabled(enabled !== 'false')
    } catch (err) {
      logError(`Failed to load update check setting: ${err}`)
    }
  }

  async function loadSettings() {
    setIsLoading(true)
    try {
      const exists = await dbExists()
      setIsInitialized(exists)

      if (exists) {
        const path = await getSetting('output')
        if (path) {
          setOutputPath(path)
        }
        const db = await getDbPath()
        if (db) {
          setDbPath(db)
        }
      }
    } catch (err) {
      logError(`Failed to load settings: ${err}`)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleInitDatabase() {
    setIsInitializing(true)
    try {
      await initDatabase()
      setIsInitialized(true)
      await loadSettings()
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    )
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
                        // Invalidate router cache to refresh all route loaders
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
            <CardDescription>Configure where processed images will be saved</CardDescription>
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
            <CardDescription>
              Configure AI-powered image enhancement models and device preferences
            </CardDescription>
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
                      const gpu = upscaleSettings?.gpu_enabled || false
                      try {
                        await saveUpscaleSettings(model, gpu)
                        setUpscaleSettings({ ...upscaleSettings!, model, gpu_enabled: gpu })
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
                  <Label className="text-sm">Processing Device</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={!upscaleSettings?.gpu_enabled ? 'default' : 'outline'}
                      size="sm"
                      onClick={async () => {
                        const model = upscaleSettings?.model || 'realesrgan-x4'
                        try {
                          await saveUpscaleSettings(model, false)
                          setUpscaleSettings({ ...upscaleSettings!, gpu_enabled: false })
                        } catch (err) {
                          logError(`Failed to save GPU setting: ${err}`)
                        }
                      }}
                    >
                      <Cpu className="mr-2 h-4 w-4" />
                      CPU
                    </Button>
                    <Button
                      variant={upscaleSettings?.gpu_enabled ? 'default' : 'outline'}
                      size="sm"
                      onClick={async () => {
                        const model = upscaleSettings?.model || 'realesrgan-x4'
                        try {
                          await saveUpscaleSettings(model, true)
                          setUpscaleSettings({ ...upscaleSettings!, gpu_enabled: true })
                        } catch (err) {
                          logError(`Failed to save GPU setting: ${err}`)
                        }
                      }}
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      GPU
                    </Button>
                  </div>
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
      </div>
    </section>
  )
}
