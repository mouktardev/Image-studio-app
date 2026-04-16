import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { error as logError } from '@/lib/logger'

export interface FilterState {
  page: string
  search_query: string
  sort_field: 'name' | 'size' | 'date'
  sort_order: 'asc' | 'desc'
  output_type: 'all' | 'compressed' | 'upscaled' | 'bg_removed'
}

export function useFilters(page: 'index' | 'output' | 'videos') {
  const [filters, setFilters] = useState<FilterState>({
    page,
    search_query: '',
    sort_field: 'date',
    sort_order: 'desc',
    output_type: 'all',
  })
  const [isLoading, setIsLoading] = useState(true)

  // Load filters from SQLite on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const data = await invoke<FilterState>('get_filters', { page })
        setFilters(data)
      } catch (err) {
        logError(`Failed to load filters: ${err}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadFilters()
  }, [page])

  // Update search query
  const setSearchQuery = useCallback(
    async (search_query: string) => {
      setFilters((prev) => ({ ...prev, search_query }))
      try {
        await invoke('update_filters', {
          request: { page, search_query },
        })
      } catch (err) {
        logError(`Failed to update search query: ${err}`)
      }
    },
    [page]
  )

  // Update sort field
  const setSortField = useCallback(
    async (sort_field: 'name' | 'size' | 'date') => {
      setFilters((prev) => ({ ...prev, sort_field }))
      try {
        await invoke('update_filters', {
          request: { page, sort_field },
        })
      } catch (err) {
        logError(`Failed to update sort field: ${err}`)
      }
    },
    [page]
  )

  // Update sort order
  const setSortOrder = useCallback(
    async (sort_order: 'asc' | 'desc') => {
      setFilters((prev) => ({ ...prev, sort_order }))
      try {
        await invoke('update_filters', {
          request: { page, sort_order },
        })
      } catch (err) {
        logError(`Failed to update sort order: ${err}`)
      }
    },
    [page]
  )

  // Update output type (output page only)
  const setOutputType = useCallback(
    async (output_type: 'all' | 'compressed' | 'upscaled' | 'bg_removed') => {
      setFilters((prev) => ({ ...prev, output_type }))
      try {
        await invoke('update_filters', {
          request: { page, output_type },
        })
      } catch (err) {
        logError(`Failed to update output type: ${err}`)
      }
    },
    [page]
  )

  // Reset all filters to defaults
  const resetFilters = useCallback(async () => {
    try {
      const data = await invoke<FilterState>('reset_filters', { page })
      setFilters(data)
    } catch (err) {
      logError(`Failed to reset filters: ${err}`)
    }
  }, [page])

  // Check if any filter is active (for showing reset button)
  const hasActiveFilters =
    filters.search_query !== '' ||
    filters.sort_field !== 'date' ||
    filters.sort_order !== 'desc' ||
    (page === 'output' && filters.output_type !== 'all')

  return {
    filters,
    isLoading,
    searchQuery: filters.search_query,
    sortField: filters.sort_field,
    sortOrder: filters.sort_order,
    outputType: filters.output_type,
    setSearchQuery,
    setSortField,
    setSortOrder,
    setOutputType,
    resetFilters,
    hasActiveFilters,
  }
}
