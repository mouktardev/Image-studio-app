import { Link, useLocation } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { ImageDown, SettingsIcon, TerminalIcon, Folder } from 'lucide-react'
import { useValue, useSetPartialValuesCallback } from '@/schema/tinybase-schema'
import packageJson from '../../package.json'

export function AppSidebar() {
  const location = useLocation()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const logsOpen = useValue('logsOpen')
  const logsUnread = useValue('logsUnread')

  const toggleLogsOpen = useSetPartialValuesCallback((_, store) => ({
    logsOpen: !store.getValue('logsOpen'),
    logsUnread: false,
  }))

  const isHomeActive = location.pathname === '/'
  const isOutputActive = location.pathname === '/output'
  const isSettingsActive = location.pathname === '/settings'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuButton
            size="sm"
            asChild
            tooltip={isCollapsed ? `Image Studio v${packageJson.version}` : undefined}
          >
            <div className="flex items-center gap-2 px-2 py-1">
              <img
                src="/app-icon.png"
                alt="Image Studio"
                className="h-6 w-6 shrink-0 rounded-md object-cover"
              />
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="text-sm leading-tight font-semibold">Image studio</span>
                <span className="text-muted-foreground text-[10px]">v{packageJson.version}</span>
              </div>
            </div>
          </SidebarMenuButton>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isHomeActive}
                  tooltip={isCollapsed ? 'Images' : undefined}
                >
                  <Link to="/">
                    <ImageDown className="h-4 w-4" />
                    <span>Images</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isOutputActive}
                  tooltip={isCollapsed ? 'Processed' : undefined}
                >
                  <Link to="/output">
                    <Folder className="h-4 w-4" />
                    <span>Processed</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isSettingsActive}
                  tooltip={isCollapsed ? 'General' : undefined}
                >
                  <Link to="/settings">
                    <SettingsIcon className="h-4 w-4" />
                    <span>General</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              onClick={toggleLogsOpen}
              isActive={logsOpen}
              tooltip={isCollapsed ? 'Toggle log panel' : undefined}
            >
              {logsUnread && !logsOpen && (
                <span className="bg-destructive absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full" />
              )}
              <TerminalIcon className="h-4 w-4 shrink-0" />
              <span>logs</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
