import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { revealItemInDir, openPath } from '@tauri-apps/plugin-opener'

export interface Image {
  id: number
  filename: string
  filepath: string
  mimetype: string | null
  size: number | null
  width: number | null
  height: number | null
  compressed_filepath?: string | null
  compressed_size?: number | null
}

export interface AddImageData {
  filename: string
  filepath: string
  mimetype: string | null
  size: number | null
  width: number | null
  height: number | null
}

export interface ImageMetadata {
  width: number
  height: number
  size: number
  mimetype: string
}

export async function initDatabase(): Promise<string> {
  return invoke<string>('init_database')
}

export async function dbExists(): Promise<boolean> {
  return invoke<boolean>('db_exists')
}

export async function getDbPath(): Promise<string> {
  return invoke<string>('get_db_path_cmd')
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>('get_setting', { key })
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>('set_setting', { key, value })
}

export async function revealInExplorer(path: string): Promise<void> {
  return revealItemInDir(path)
}

export async function openFile(path: string): Promise<void> {
  return openPath(path)
}

export async function selectFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Output Folder',
  })
  return selected as string | null
}

export async function selectFiles(): Promise<string[] | null> {
  const selected = await open({
    multiple: true,
    title: 'Select Images',
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
      },
    ],
  })
  if (!selected) return null
  return Array.isArray(selected) ? selected : [selected]
}

export async function getAllImages(): Promise<Image[]> {
  return invoke<Image[]>('get_all_images')
}

export async function addImage(data: AddImageData): Promise<Image> {
  return invoke<Image>('add_image', { data })
}

export async function deleteImage(id: number): Promise<void> {
  return invoke<void>('delete_image', { id })
}

export async function deleteImagesByIds(ids: number[]): Promise<void> {
  return invoke<void>('delete_images_by_ids', { ids })
}

export async function getImageMetadata(filepath: string): Promise<ImageMetadata> {
  return invoke<ImageMetadata>('get_image_metadata', { filepath })
}

export interface ImportResult {
  imported: number
  duplicates: number
  failed: number
}

export async function importImagesBulk(filepaths: string[]): Promise<ImportResult> {
  return invoke<ImportResult>('import_images_bulk', { filepaths })
}

export async function compressImagesByIds(ids: number[], quality: number): Promise<number> {
  return invoke<number>('compress_images_by_ids', { ids, quality })
}
