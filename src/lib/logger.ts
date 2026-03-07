import {
  error as tauriError,
  warn as tauriWarn,
  info as tauriInfo,
  debug as tauriDebug,
  trace as tauriTrace,
  attachLogger,
} from '@tauri-apps/plugin-log'

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

export {
  tauriError as error,
  tauriWarn as warn,
  tauriInfo as info,
  tauriDebug as debug,
  tauriTrace as trace,
  attachLogger,
}
