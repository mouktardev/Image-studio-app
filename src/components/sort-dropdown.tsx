import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ArrowUp, ArrowDown } from 'lucide-react'

interface SortDropdownProps {
  sortField: 'name' | 'size' | 'date'
  sortOrder: 'asc' | 'desc'
  onSortFieldChange: (field: 'name' | 'size' | 'date') => void
  onSortOrderChange: (order: 'asc' | 'desc') => void
}

export function SortDropdown({
  sortField,
  sortOrder,
  onSortFieldChange,
  onSortOrderChange,
}: SortDropdownProps) {
  const handleToggleOrder = () => {
    onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex items-center gap-1">
      <Select
        value={sortField}
        onValueChange={(value) => onSortFieldChange(value as 'name' | 'size' | 'date')}
      >
        <SelectTrigger className="h-8 w-30 text-sm">
          <SelectValue placeholder="Sort by..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Date</SelectItem>
          <SelectItem value="name">Name</SelectItem>
          <SelectItem value="size">Size</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleToggleOrder}
        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
      >
        {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  )
}
