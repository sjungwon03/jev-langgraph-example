'use client';

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { LangGraphVisualizerContent } from './LangGraphVisualizerContent';
import { GraphExecutionState } from './LangGraphCanvas';

interface LangGraphVisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  executionState?: GraphExecutionState;
  activeNodeId?: string | null;
}

export function LangGraphVisualizerModal({
  isOpen,
  onClose,
  executionState,
  activeNodeId,
}: LangGraphVisualizerModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[88vh] flex flex-col p-0 gap-0 border-slate-800 bg-slate-950/95 overflow-hidden">
        <LangGraphVisualizerContent
          executionState={executionState}
          activeNodeId={activeNodeId}
        />
      </DialogContent>
    </Dialog>
  );
}
