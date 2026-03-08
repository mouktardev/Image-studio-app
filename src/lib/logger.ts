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
  console.error = (message: unknown, ...args: unknown[]) => tauriError(fmt(message, ...args))
  console.warn = (message: unknown, ...args: unknown[]) => tauriWarn(fmt(message, ...args))
  console.info = (message: unknown, ...args: unknown[]) => tauriInfo(fmt(message, ...args))
  console.log = (message: unknown, ...args: unknown[]) => tauriDebug(fmt(message, ...args))
  console.debug = (message: unknown, ...args: unknown[]) => tauriTrace(fmt(message, ...args))
}

let idCounter = 0
const MAX_LOGS = 200

export async function attachGlobalLogListener(store: AppStore) {
  return attachLogger((record) => {
    const id = (++idCounter).toString()
    store.setRow('logs', id, {
      level: record.level,
      message: record.message,
      timestamp: Date.now(),
    })

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
