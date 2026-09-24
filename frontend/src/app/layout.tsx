import type { Metadata } from 'next';
import './globals.css';
import { RoleProvider } from '@/lib/role-context';
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
    <html lang="ko" className="dark">
      <body className="min-h-screen flex bg-[#070b13] text-slate-100">
        <RoleProvider>
          <AppShell>
            {children}
          </AppShell>
        </RoleProvider>
      </body>
    </html>
  );
}
