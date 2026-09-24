'use client';

import { Header } from '@/components/layout/Header';
import { LangGraphVisualizerContent } from '@/components/chat/LangGraphVisualizerContent';

export default function GraphPage() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <LangGraphVisualizerContent showHeader={true} />
      </div>
    </div>
  );
}
