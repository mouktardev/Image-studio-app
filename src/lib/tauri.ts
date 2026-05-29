import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { revealItemInDir, openPath } from '@tauri-apps/plugin-opener'

export interface UpscaledVersion {
  scale: number
  filepath: string
  size: number | null
  model: string | null
}

export interface ConvertedImage {
  filepath: string
  size: number | null
  format: string
}

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
  upscaled_versions?: UpscaledVersion[] // JSON parsed from backend
  bg_removed_filepath?: string | null
  bg_removed_size?: number | null
  converted_images: ConvertedImage[]
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

export async function getAllImages(params?: ImageQueryParams): Promise<Image[]> {
  return invoke<Image[]>('get_all_images', { params })
}

export async function getAllCompressedImages(): Promise<Image[]> {
  return invoke<Image[]>('get_all_compressed_images')
}

export async function addImage(data: AddImageData): Promise<Image> {
  return invoke<Image>('add_image', { data })
}

export async function deleteImage(id: number): Promise<void> {
  return invoke<void>('delete_image', { id })
}

export async function syncDatabase(): Promise<number> {
  return invoke<number>('sync_database')
}

export async function checkDbHealth(): Promise<number> {
  return invoke<number>('check_db_health')
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

export interface UpscaleSettings {
  model: string
  models_dir: string
}

export interface ModelStatus {
  name: string
  downloaded: boolean
  path: string
  size: number | null
}

export async function getUpscaleSettings(): Promise<UpscaleSettings> {
  return invoke<UpscaleSettings>('get_upscale_settings')
}

export async function setUpscaleSettings(model: string): Promise<void> {
  return invoke<void>('set_upscale_settings', { model })
}

export async function getModelStatus(model: string): Promise<ModelStatus> {
  return invoke<ModelStatus>('get_model_status', { model })
}

export async function downloadModel(model: string): Promise<string> {
  return invoke<string>('download_model', { model })
}

export async function upscaleImagesByIds(
  ids: number[],
  scale: number,
  model: string
): Promise<number> {
  return invoke<number>('upscale_images_by_ids', { ids, scale, model })
}

export async function getAllUpscaledImages(): Promise<Image[]> {
  return invoke<Image[]>('get_all_upscaled_images')
}

// Background Removal API
export interface BgRemovalModelStatus {
  name: string
  downloaded: boolean
  path: string
  size: number | null
}

export async function getBgRemovalModelStatus(): Promise<BgRemovalModelStatus> {
  return invoke<BgRemovalModelStatus>('get_bg_removal_model_status')
}

export async function downloadBgRemovalModel(): Promise<string> {
  return invoke<string>('download_bg_removal_model')
}

export async function removeBackgroundByIds(ids: number[]): Promise<number> {
  return invoke<number>('remove_background_by_ids', { ids })
}

export async function getAllBgRemovedImages(): Promise<Image[]> {
  return invoke<Image[]>('get_all_bg_removed_images')
}

// Video Processing API
export interface ConvertedVideo {
  filepath: string
  size: number | null
  format: string
}

export interface Video {
  id: number
  filename: string
  filepath: string
  mimetype: string | null
  size: number | null
  width: number | null
  height: number | null
  duration: number | null
  fps: number | null
  thumbnail_path?: string | null
  bg_removed_filepath?: string | null
  bg_removed_size?: number | null
  bg_removed_model?: string | null
  compressed_filepath?: string | null
  compressed_size?: number | null
  converted_videos: ConvertedVideo[]
}

export interface FfmpegStatus {
  available: boolean
  path: string
  size: number | null
  source: string
}

export interface VideoBgRemovalProgress {
  id: number
  progress: number
  message: string
  eta_seconds: number | null
}

export async function selectVideoFiles(): Promise<string[] | null> {
  const selected = await open({
    multiple: true,
    title: 'Select Videos',
    filters: [
      {
        name: 'Videos',
        extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp'],
      },
    ],
  })
  if (!selected) return null
  return Array.isArray(selected) ? selected : [selected]
}

export interface VideoImportResult {
  imported: number
  duplicates: number
  failed: number
}

export async function importVideos(paths: string[]): Promise<VideoImportResult> {
  return invoke<VideoImportResult>('import_videos', { paths })
}

export async function getAllVideos(params?: VideoQueryParams): Promise<Video[]> {
  return invoke<Video[]>('get_all_videos', { params: params ?? null })
}

export async function generateVideoThumbnails(): Promise<number> {
  return invoke<number>('generate_video_thumbnails')
}

export async function deleteVideosByIds(ids: number[]): Promise<void> {
  return invoke<void>('delete_videos_by_ids', { ids })
}

export interface VideoBgRemovalResult {
  processed: number
  failed: number
  cancelled: number
}

export async function removeVideoBg(ids: number[]): Promise<VideoBgRemovalResult> {
  return invoke<VideoBgRemovalResult>('remove_video_bg', { ids })
}

export async function getAllBgRemovedVideos(): Promise<Video[]> {
  return invoke<Video[]>('get_all_bg_removed_videos')
}

export async function checkFfmpegStatus(): Promise<FfmpegStatus> {
  return invoke<FfmpegStatus>('check_ffmpeg_status')
}

export async function downloadFfmpeg(): Promise<string> {
  return invoke<string>('download_ffmpeg')
}

export async function cancelVideoBgRemoval(ids: number[]): Promise<void> {
  return invoke<void>('cancel_video_bg_removal', { ids })
}

export async function getAllCompressedVideos(): Promise<Video[]> {
  return invoke<Video[]>('get_all_compressed_videos')
}

export interface CompressionPreset {
  name: string
  crf: number
  preset: string
}

export async function getCompressionPresets(): Promise<CompressionPreset[]> {
  return invoke<CompressionPreset[]>('get_compression_presets')
}

export async function compressVideosByIds(
  ids: number[],
  quality: number,
  preset: string
): Promise<number> {
  return invoke<number>('compress_videos_by_ids', { ids, quality, preset })
}

// Convert Format API
export type ImageFormat = 'jpg' | 'png' | 'webp'
export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'gif'

export async function convertImagesByIds(ids: number[], format: ImageFormat): Promise<number> {
  return invoke<number>('convert_images_by_ids', { ids, format })
}

export async function convertVideosByIds(ids: number[], format: VideoFormat): Promise<number> {
  return invoke<number>('convert_videos_by_ids', { ids, format })
}

export async function getAllConvertedImages(): Promise<Image[]> {
  return invoke<Image[]>('get_all_converted_images')
}

export async function getAllConvertedVideos(): Promise<Video[]> {
  return invoke<Video[]>('get_all_converted_videos')
}

// Filters API
export interface FilterState {
  page: string
  search_query: string
  sort_field: 'name' | 'size' | 'date'
  sort_order: 'asc' | 'desc'
  output_type: 'all' | 'compressed' | 'upscaled' | 'bg_removed' | 'video_compressed' | 'converted_images' | 'converted_videos'
}

export interface UpdateFilterRequest {
  page: string
  search_query?: string
  sort_field?: 'name' | 'size' | 'date'
  sort_order?: 'asc' | 'desc'
  output_type?: 'all' | 'compressed' | 'upscaled' | 'bg_removed' | 'video_compressed' | 'converted_images' | 'converted_videos'
}

export interface ImageQueryParams {
  search?: string
  sort_field: 'name' | 'size' | 'date'
  sort_order: 'asc' | 'desc'
}

export interface VideoQueryParams {
  search?: string
  sort_field: 'name' | 'size' | 'date'
  sort_order: 'asc' | 'desc'
}

export async function getFilters(page: string): Promise<FilterState> {
  return invoke<FilterState>('get_filters', { page })
}

export async function updateFilters(request: UpdateFilterRequest): Promise<void> {
  return invoke<void>('update_filters', { request })
}

export async function resetFilters(page: string): Promise<FilterState> {
  return invoke<FilterState>('reset_filters', { page })
}
