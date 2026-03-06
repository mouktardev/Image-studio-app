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
} from '@/components/ui/sidebar'
import { AppWindowIcon, ImageDown, SettingsIcon } from 'lucide-react'

export function AppSidebar() {
  const location = useLocation()
  const isHomeActive = location.pathname === '/'
  const isSettingsActive = location.pathname === '/settings'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuButton size="sm" asChild>
            <div className="flex items-center gap-2 px-2 py-1">
              <AppWindowIcon className="h-5 w-5 shrink-0" />
              <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">
                Image App
              </span>
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
                <SidebarMenuButton asChild isActive={isHomeActive}>
                  <Link to="/">
                    <ImageDown className="h-4 w-4" />
                    <span>Compression</span>
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
                <SidebarMenuButton asChild isActive={isSettingsActive}>
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
            <SidebarMenuButton size="sm" asChild>
              <div className="text-muted-foreground px-2 py-1 text-[0.60rem]">v0.1.0</div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
