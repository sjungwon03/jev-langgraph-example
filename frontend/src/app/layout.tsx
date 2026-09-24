import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { RoleProvider } from '@/lib/role-context';

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
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
            {children}
          </div>
        </RoleProvider>
      </body>
    </html>
  );
}
