import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value)

  // Sync input value when external value changes
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Debounced onChange
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== value) {
        onChange(inputValue)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [inputValue, value, onChange, debounceMs])

  const handleClear = useCallback(() => {
    setInputValue('')
    onChange('')
  }, [onChange])

  return (
    <div className="relative w-50">
      <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
      <Input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="h-8 pr-8 pl-8 text-sm"
      />
      {inputValue && (
        <button
          onClick={handleClear}
          className="hover:bg-muted absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5"
        >
          <X className="text-muted-foreground h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
