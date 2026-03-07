import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  initDatabase,
  dbExists,
  getSetting,
  setSetting,
  revealInExplorer,
  selectFolder,
  getDbPath,
} from '@/lib/tauri'
import { error as logError } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { FolderOpenIcon, FolderIcon, RefreshCw, EyeIcon } from 'lucide-react'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const [outputPath, setOutputPath] = useState<string>('')
  const [dbPath, setDbPath] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isChangingFolder, setIsChangingFolder] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

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
    <div className="container mx-auto max-w-2xl px-3 py-8">
      <h1 className="mb-6 text-3xl font-bold">Settings</h1>

      {/* Database Status */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Database Status</CardTitle>
              <CardDescription>Check if the database is initialized</CardDescription>
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
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">Database is ready to use.</p>
              {dbPath && (
                <Button variant="outline" size="sm" onClick={handleRevealDbFolder}>
                  <EyeIcon className="mr-2 h-4 w-4" />
                  Reveal Database Folder
                </Button>
              )}
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
    </div>
  )
}
