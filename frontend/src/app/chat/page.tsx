'use client';

import { Header } from '@/components/layout/Header';
import { ChatConsole } from '@/components/chat/ChatConsole';

export default function ChatPage() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header />
      <ChatConsole />
    </div>
  );
}
