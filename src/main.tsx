import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
// Import the generated route tree
import { routeTree } from './routeTree.gen'
import '@/style.css'
import { ThemeProvider } from './components/theme-provider'
import {
  useCreateStore,
  Provider as TinyBaseProvider,
  tablesSchema,
  valuesSchema,
  useCreateQueries,
} from '@/schema/tinybase-schema'
import { createQueries, createStore } from 'tinybase/with-schemas'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setupLogger } from '@/lib/logger'

setupLogger()
// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
export function App() {
  const store = useCreateStore(() =>
    createStore()
      .setSchema(tablesSchema, valuesSchema)
      .setTable('clients', { 0: { name: 'David' } })
  )
  const queries = useCreateQueries(store, createQueries, [])
  return (
    <ThemeProvider defaultTheme="dark" storageKey="theme">
      <TooltipProvider>
        <TinyBaseProvider store={store} queries={queries}>
          <RouterProvider router={router} />
          <Toaster />
        </TinyBaseProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<App />)
}
