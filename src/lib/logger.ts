import {
  error as tauriError,
  warn as tauriWarn,
  info as tauriInfo,
  debug as tauriDebug,
  trace as tauriTrace,
  attachLogger,
} from '@tauri-apps/plugin-log'
import type { AppStore } from '@/schema/tinybase-schema'

function fmt(message: unknown, ...args: unknown[]): string {
  const parts = [typeof message === 'string' ? message : JSON.stringify(message)]
  for (const arg of args) {
    parts.push(typeof arg === 'string' ? arg : JSON.stringify(arg))
  }
  return parts.join(' ')
}

/** Call once at app startup to forward console.* to tauri-plugin-log */
export function setupLogger() {
  const originalLog = console.log
  const originalDebug = console.debug
  const originalInfo = console.info
  const originalWarn = console.warn
  const originalError = console.error

  console.error = (message: unknown, ...args: unknown[]) => {
    tauriError(fmt(message, ...args))
    originalError(message, ...args)
  }
  console.warn = (message: unknown, ...args: unknown[]) => {
    tauriWarn(fmt(message, ...args))
    originalWarn(message, ...args)
  }
  console.info = (message: unknown, ...args: unknown[]) => {
    tauriInfo(fmt(message, ...args))
    originalInfo(message, ...args)
  }
  console.log = (message: unknown, ...args: unknown[]) => {
    tauriDebug(fmt(message, ...args))
    originalLog(message, ...args)
  }
  console.debug = (message: unknown, ...args: unknown[]) => {
    tauriTrace(fmt(message, ...args))
    originalDebug(message, ...args)
  }
}

let idCounter = 0
const MAX_LOGS = 200

function isFileNotFoundError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('os error 2') ||
    lower.includes('the system cannot find the file specified') ||
    lower.includes('no such file or directory') ||
    lower.includes('file not found') ||
    lower.includes('file does not exist') ||
    lower.includes('path does not exist') ||
    lower.includes('could not find')
  )
}

export async function attachGlobalLogListener(store: AppStore) {
  return attachLogger((record) => {
    const id = (++idCounter).toString()
    store.setRow('logs', id, {
      level: record.level,
      message: record.message,
      timestamp: Date.now(),
    })

    if (!store.getValue('logsOpen')) {
      store.setValue('logsUnread', true)
    }

    // Check if this is a file not found error - mark DB as needing sync
    // Note: We ignore [tauri::protocol::asset] errors as these are expected
    // when viewing pages with stale data. DB health is checked proactively
    // via checkDbHealth() on navigation instead.
    if (
      record.level >= 4 &&
      isFileNotFoundError(record.message) &&
      !record.message.includes('[tauri::protocol::asset]')
    ) {
      store.setValue('dbNeedsSync', true)
    }

    // Keep memory bounded
    const logIds = store.getRowIds('logs')
    if (logIds.length > MAX_LOGS) {
      store.delRow('logs', logIds[0])
    }
  })
}

export {
  tauriError as error,
  tauriWarn as warn,
  tauriInfo as info,
  tauriDebug as debug,
  tauriTrace as trace,
  attachLogger,
}
