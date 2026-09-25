import type { Metadata } from 'next';
import './globals.css';
import { RoleProvider } from '@/lib/role-context';
import { ThemeProvider } from '@/lib/theme-context';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Proxmox MCP & LangGraph AI Control Center',
  description: 'Autonomous AI Infrastructure Management with Proxmox MCP and LangGraph',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen flex bg-slate-50 dark:bg-[#070b13] text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <ThemeProvider>
          <RoleProvider>
            <AppShell>
              {children}
            </AppShell>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
