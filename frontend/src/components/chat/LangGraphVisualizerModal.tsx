'use client';

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { LangGraphVisualizerContent } from './LangGraphVisualizerContent';

interface LangGraphVisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNodeId?: string | null;
}

export function LangGraphVisualizerModal({
  isOpen,
  onClose,
  activeNodeId,
}: LangGraphVisualizerModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[88vh] flex flex-col p-0 gap-0 border-slate-800 bg-slate-950/95 overflow-hidden">
        <LangGraphVisualizerContent activeNodeId={activeNodeId} />
      </DialogContent>
    </Dialog>
  );
}
