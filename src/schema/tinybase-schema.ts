import type { Store } from 'tinybase/store/with-schemas'
import * as UiReact from 'tinybase/ui-react/with-schemas'

export const tablesSchema = {
  clients: {
    name: { type: 'string' },
  },
  compressions: {
    progress: { type: 'number' },
    message: { type: 'string' },
  },
  logs: {
    level: { type: 'number' },
    message: { type: 'string' },
    timestamp: { type: 'number' },
  },
} as const

export const valuesSchema = {
  version: { type: 'string', default: '0.1.0' },
} as const

export type AppStore = Store<[typeof tablesSchema, typeof valuesSchema]>
const UiReactWithSchemas = UiReact as UiReact.WithSchemas<
  [typeof tablesSchema, typeof valuesSchema]
>

export const {
  Provider,
  useTablesState,
  useTableState,
  useRowState,
  useCellState,
  useParamValuesState,
  useValuesState,
  useParamValueState,
  useValueState,
  useCreateIndexes,
  useCreateRelationships,
  useCreatePersister,
  useCreateQueries,
  useCreateStore,
  CellProps,
  useTable,
  useTablesListener,
  useTableListener,
  useResultTable,
  useResultRow,
  RowView,
  RowProps,
  useAddRowCallback,
  useCell,
  useRow,
  useValues,
  useValue,
  useHasValue,
  useHasRow,
  useDelRowCallback,
  useRowIds,
  useSetPartialRowCallback,
  useRowListener,
  useSetPartialValuesCallback,
  useRelationships,
  RemoteRowView,
  useQueries,
  useResultCell,
  useResultSortedRowIds,
  useResultRowIds,
  useResultTableCellIds,
  useSetCellCallback,
  useSliceIds,
  useIndexes,
  IndexView,
  useSliceRowIds,
  SliceProps,
  SliceView,
  useStore,
  useSetTableCallback,
  useDelTableCallback,
  useLocalRowIds,
  CellView,
  ResultCellProps,
  ResultCellView,
  ResultRowView,
} = UiReactWithSchemas
