'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  GitFork,
  Brain,
  ShieldAlert,
  Wrench,
  MessageSquare,
  PlayCircle,
  CheckCircle2,
  Sparkles,
  Server,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface GraphExecutionState {
  activeNodeId: string | null;
  activeTool?: string;
  activeToolArgs?: any;
  intent?: string;
  decisionWhy?: string;
  visitedNodeIds: string[];
  isLlmActive: boolean;
  isJevActive: boolean;
  statusMessage?: string;
}

export interface CanvasNode {
  id: string;
  name: string;
  sub: string;
  type: 'start' | 'router' | 'safety' | 'tool' | 'synth' | 'end' | 'llm_service' | 'jev_service';
  x: number;
  y: number;
  w: number;
  h: number;
  description: string;
  isExternal?: boolean;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
  color: string;
  dashed?: boolean;
  isExternalBus?: boolean;
}

interface LangGraphCanvasProps {
  executionState?: GraphExecutionState;
  activeNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
  compact?: boolean;
}

const VIRTUAL_WIDTH = 580;
const VIRTUAL_HEIGHT = 580;

const nodeDetails: Record<string, { desc: string }> = {
  __start__: {
    desc: '사용자의 자연어 메시지를 주입받아 LangGraph InfraAgentState 세션을 초기화합니다.',
  },
  jev_service: {
    desc: '⚡ JEV 인프라 컨트롤러가 요청을 최초 수신하여 팀 권한(개발팀/인프라팀)과 거버넌스 정책을 바인딩합니다.',
  },
  router: {
    desc: '⚡ JEV 라우터가 사용자 발화를 분석하여 실행할 Proxmox MCP 도구 및 사양 파라미터를 정확하게 결정합니다.',
  },
  safety_check: {
    desc: '⚡ JEV 보안 거버넌스 정책 검증. VM 삭제/강제종료 등 파괴적 고위험 작업 감지 시 HITL 승인 토큰을 발급합니다.',
  },
  tool_executor: {
    desc: '⚡ JEV 컨트롤러 API를 통해 Proxmox VE 8.2 클러스터 명령 및 자원 티켓을 원격 실행합니다.',
  },
  synthesizer: {
    desc: '🤖 Cloud LLM API(OpenAI gpt-4o-mini)와 통신하여 JEV의 Proxmox 도구 실행 결과 데이터를 친절한 한국어 마크다운 대화형 답변으로 최종 합성합니다.',
  },
  __end__: {
    desc: 'SSE 스트리밍 전송을 정상 종료하고 세션 상태 및 감사 로그를 최종 커밋합니다.',
  },
};

const fixedNodes: CanvasNode[] = [
  {
    id: '__start__',
    name: 'START',
    sub: '사용자 발화 수신',
    type: 'start',
    x: 185,
    y: 16,
    w: 210,
    h: 36,
    description: nodeDetails.__start__.desc,
  },
  {
    id: 'jev_service',
    name: '⚡ JEV Controller',
    sub: '거버넌스 인입 & 권한 검증',
    type: 'jev_service',
    x: 175,
    y: 76,
    w: 230,
    h: 54,
    description: nodeDetails.jev_service.desc,
  },
  {
    id: 'router',
    name: '⚡ JEV Router',
    sub: '의도 분석 & 도구 결정',
    type: 'router',
    x: 175,
    y: 154,
    w: 230,
    h: 54,
    description: nodeDetails.router.desc,
  },
  {
    id: 'safety_check',
    name: '⚡ JEV Safety Gate',
    sub: '파괴적 고위험 검증 (HITL)',
    type: 'safety',
    x: 175,
    y: 232,
    w: 230,
    h: 54,
    description: nodeDetails.safety_check.desc,
  },
  {
    id: 'tool_executor',
    name: '⚡ JEV Tool Executor',
    sub: 'Proxmox MCP API 실행',
    type: 'tool',
    x: 175,
    y: 310,
    w: 230,
    h: 54,
    description: nodeDetails.tool_executor.desc,
  },
  {
    id: 'synthesizer',
    name: '🤖 LLM 응답 생성',
    sub: 'OpenAI (gpt-4o-mini)',
    type: 'synth',
    x: 170,
    y: 388,
    w: 240,
    h: 62,
    description: nodeDetails.synthesizer.desc,
  },
  {
    id: '__end__',
    name: 'END',
    sub: '스트리밍 완료 & 감사 커밋',
    type: 'end',
    x: 185,
    y: 486,
    w: 210,
    h: 36,
    description: nodeDetails.__end__.desc,
  },
];

const fixedEdges: CanvasEdge[] = [
  {
    id: 'e-start-jev',
    from: '__start__',
    to: 'jev_service',
    label: '1. 요청 접수',
    color: '#10b981',
  },
  {
    id: 'e-jev-router',
    from: 'jev_service',
    to: 'router',
    label: '2. 툴 콜링 위임',
    color: '#38bdf8',
  },
  {
    id: 'e-router-safety',
    from: 'router',
    to: 'safety_check',
    label: '도구 호출 (toolToCall)',
    condition: 'toolToCall != null',
    color: '#f59e0b',
  },
  {
    id: 'e-router-synth-bypass',
    from: 'router',
    to: 'synthesizer',
    label: '일반 질의 우회 (Bypass)',
    condition: 'toolToCall == null',
    color: '#38bdf8',
    dashed: true,
  },
  {
    id: 'e-safety-tool',
    from: 'safety_check',
    to: 'tool_executor',
    label: '가드레일 통과 (Safe)',
    condition: '!confirmationNeeded',
    color: '#a855f7',
  },
  {
    id: 'e-safety-synth-interrupted',
    from: 'safety_check',
    to: 'synthesizer',
    label: '고위험 차단 (HITL 대기)',
    condition: 'confirmationNeeded',
    color: '#f43f5e',
    dashed: true,
  },
  {
    id: 'e-tool-synth',
    from: 'tool_executor',
    to: 'synthesizer',
    label: '실행 결과 반환',
    color: '#10b981',
  },
  {
    id: 'e-synth-end',
    from: 'synthesizer',
    to: '__end__',
    color: '#818cf8',
  },
];

export function LangGraphCanvas({
  executionState,
  activeNodeId,
  onSelectNode,
  className = '',
  compact = false,
}: LangGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('router');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const effectiveActiveId = executionState?.activeNodeId || activeNodeId || null;
  const activeNodeIdRef = useRef<string | null>(effectiveActiveId);
  const previousNodeIdRef = useRef<string | null>(null);
  const executionStateRef = useRef<GraphExecutionState | undefined>(executionState);
  const selectedNodeIdRef = useRef<string>(selectedNodeId);
  const hoveredNodeIdRef = useRef<string | null>(null);

  // Active Traversal State (Energy Orb gliding along active edge)
  const traversalRef = useRef<{
    activeEdgeId: string | null;
    progress: number;
    startTime: number;
    duration: number;
  }>({
    activeEdgeId: null,
    progress: 1,
    startTime: 0,
    duration: 500,
  });

  const transformRef = useRef<{ scale: number; offsetX: number; offsetY: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  // Trigger active edge transition when activeNodeId changes
  useEffect(() => {
    const prev = previousNodeIdRef.current;
    const curr = effectiveActiveId;

    if (curr && curr !== prev) {
      let targetEdgeId: string | null = null;

      if (curr === 'jev_service') {
        targetEdgeId = 'e-start-jev';
      } else if (curr === 'router') {
        targetEdgeId = prev === 'jev_service' ? 'e-jev-router' : 'e-start-router';
      } else if (curr === 'safety_check') {
        targetEdgeId = 'e-router-safety';
      } else if (curr === 'tool_executor') {
        targetEdgeId = 'e-safety-tool';
      } else if (curr === 'synthesizer') {
        // Did we come from tool_executor, safety_check (HITL interrupted), or router bypass?
        if (prev === 'safety_check' || executionState?.statusMessage?.includes('고위험') || executionState?.statusMessage?.includes('차단')) {
          targetEdgeId = 'e-safety-synth-interrupted';
        } else if (executionState?.activeTool || prev === 'tool_executor' || executionState?.visitedNodeIds?.includes('tool_executor')) {
          targetEdgeId = 'e-tool-synth';
        } else {
          targetEdgeId = 'e-router-synth-bypass';
        }
      } else if (curr === '__end__') {
        targetEdgeId = 'e-synth-end';
      }

      if (targetEdgeId) {
        traversalRef.current = {
          activeEdgeId: targetEdgeId,
          progress: 0,
          startTime: performance.now(),
          duration: 600, // 600ms smooth gliding traversal
        };
      }
    }

    previousNodeIdRef.current = curr;
    activeNodeIdRef.current = curr;
  }, [effectiveActiveId, executionState?.activeTool]);

  useEffect(() => {
    executionStateRef.current = executionState;
  }, [executionState]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  // Helper: Bezier evaluation
  const getBezierPoint = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number,
  ) => {
    const mt = 1 - t;
    return {
      x:
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x,
      y:
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y,
    };
  };

  // Helper: Edge path calculation in virtual space
  const getEdgePoints = useCallback((edge: CanvasEdge) => {
    const fromNode = fixedNodes.find((n) => n.id === edge.from);
    const toNode = fixedNodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return null;

    if (edge.id === 'e-start-jev') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 8 }, p2: { x: p3.x, y: p3.y - 8 }, p3 };
    }

    if (edge.id === 'e-jev-router') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 8 }, p2: { x: p3.x, y: p3.y - 8 }, p3 };
    }

    if (edge.id === 'e-start-router') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 10 }, p2: { x: p3.x, y: p3.y - 10 }, p3 };
    }

    if (edge.id === 'e-router-safety') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 10 }, p2: { x: p3.x, y: p3.y - 10 }, p3 };
    }

    if (edge.id === 'e-router-synth-bypass') {
      // Right bypass curve around safety and tool nodes
      const p0 = { x: fromNode.x + fromNode.w, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x + toNode.w, y: toNode.y + 20 };
      const bypassX = 465;
      return { p0, p1: { x: bypassX, y: p0.y + 25 }, p2: { x: bypassX, y: p3.y - 25 }, p3 };
    }

    if (edge.id === 'e-safety-tool') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 10 }, p2: { x: p3.x, y: p3.y - 10 }, p3 };
    }

    if (edge.id === 'e-safety-synth-interrupted') {
      // Left bypass curve around tool executor when HITL interrupts directly to synthesizer
      const p0 = { x: fromNode.x, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x, y: toNode.y + 20 };
      const bypassX = 115;
      return { p0, p1: { x: bypassX, y: p0.y + 25 }, p2: { x: bypassX, y: p3.y - 25 }, p3 };
    }

    if (edge.id === 'e-tool-synth') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 10 }, p2: { x: p3.x, y: p3.y - 10 }, p3 };
    }

    if (edge.id === 'e-synth-end') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 10 }, p2: { x: p3.x, y: p3.y - 10 }, p3 };
    }

    return null;
  }, []);

  // Helper: Draw rounded rectangle
  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // Continuous Canvas Animation Loop with ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let dpr = window.devicePixelRatio || 1;

    const updateSize = () => {
      const cw = container.clientWidth || 450;
      const ch = container.clientHeight || 500;

      dpr = window.devicePixelRatio || 1;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;

      const padding = 12;
      const availW = cw - padding * 2;
      const availH = ch - padding * 2;
      const scale = Math.min(availW / VIRTUAL_WIDTH, availH / VIRTUAL_HEIGHT, 1.2);
      const offsetX = (cw - VIRTUAL_WIDTH * scale) / 2;
      const offsetY = (ch - VIRTUAL_HEIGHT * scale) / 2;

      transformRef.current = { scale, offsetX, offsetY };
    };

    updateSize();

    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(container);

    const render = (time: number) => {
      const cw = container.clientWidth || 450;
      const ch = container.clientHeight || 500;
      const { scale, offsetX, offsetY } = transformRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep dark cyber background
      ctx.fillStyle = '#040711';
      ctx.fillRect(0, 0, cw, ch);

      // Subtle cyber grid dots
      ctx.fillStyle = 'rgba(51, 65, 85, 0.2)';
      const step = 22;
      for (let x = 11; x < cw; x += step) {
        for (let y = 11; y < ch; y += step) {
          ctx.fillRect(x, y, 1, 1);
        }
      }

      // Transform into virtual coordinate space
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      const activeNode = activeNodeIdRef.current;
      const exec = executionStateRef.current;
      const selectedNode = selectedNodeIdRef.current;
      const hoveredNode = hoveredNodeIdRef.current;
      const isExecuting = !!activeNode;

      const visitedSet = new Set(exec?.visitedNodeIds || []);
      if (activeNode) visitedSet.add(activeNode);

      // Update Active Traversal Progress
      const traversal = traversalRef.current;
      if (traversal.activeEdgeId && traversal.progress < 1) {
        const elapsed = time - traversal.startTime;
        traversal.progress = Math.min(elapsed / traversal.duration, 1);
      }

      // 1. Draw Edges
      fixedEdges.forEach((edge) => {
        const pts = getEdgePoints(edge);
        if (!pts) return;

        const isTraversingNow = traversal.activeEdgeId === edge.id;

        // Has this edge ACTUALLY been traversed in this specific execution path?
        let isVisitedEdge = visitedSet.has(edge.from) && visitedSet.has(edge.to);
        if (edge.id === 'e-router-synth-bypass') {
          // Only true if router bypassed safety gate directly to synthesizer
          isVisitedEdge = isVisitedEdge && !visitedSet.has('safety_check') && !visitedSet.has('tool_executor');
        } else if (edge.id === 'e-router-safety') {
          isVisitedEdge = visitedSet.has('safety_check');
        } else if (edge.id === 'e-safety-tool') {
          // Guardrail passed to tool execution
          isVisitedEdge = visitedSet.has('safety_check') && visitedSet.has('tool_executor');
        } else if (edge.id === 'e-safety-synth-interrupted') {
          // ONLY true if safety check interrupted to synthesizer for HITL approval (tool_executor was NOT visited)
          isVisitedEdge = visitedSet.has('safety_check') && visitedSet.has('synthesizer') && !visitedSet.has('tool_executor');
        } else if (edge.id === 'e-tool-synth') {
          isVisitedEdge = visitedSet.has('tool_executor') && visitedSet.has('synthesizer');
        }

        ctx.save();
        if (edge.dashed) {
          ctx.setLineDash([4, 4]);
        }

        if (isTraversingNow) {
          ctx.shadowColor = edge.color;
          ctx.shadowBlur = 18;
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = edge.color;
        } else if (isVisitedEdge) {
          ctx.shadowColor = edge.color;
          ctx.shadowBlur = 8;
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = edge.color;
        } else {
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)';
        }

        ctx.beginPath();
        ctx.moveTo(pts.p0.x, pts.p0.y);
        ctx.bezierCurveTo(pts.p1.x, pts.p1.y, pts.p2.x, pts.p2.y, pts.p3.x, pts.p3.y);
        ctx.stroke();
        ctx.restore();

        // Edge label (highlight ONLY if traversing now or actually visited)
        if (edge.label) {
          const mid = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, 0.5);
          ctx.save();
          ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textMetrics = ctx.measureText(edge.label);
          const bw = textMetrics.width + 10;
          const bh = 15;

          const isHighlighted = isTraversingNow || isVisitedEdge;
          ctx.fillStyle = isHighlighted ? 'rgba(15, 23, 42, 0.96)' : 'rgba(10, 15, 26, 0.85)';
          ctx.strokeStyle = isHighlighted ? edge.color : 'rgba(51, 65, 85, 0.4)';
          ctx.lineWidth = isHighlighted ? 1.5 : 1;
          drawRoundedRect(ctx, mid.x - bw / 2, mid.y - bh / 2, bw, bh, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isHighlighted ? edge.color : '#64748b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edge.label, mid.x, mid.y);
          ctx.restore();
        }
      });

      // 2. Draw Active Traversal Energy Orb (ONLY when active chat traversal happens!)
      if (traversal.activeEdgeId && traversal.progress < 1) {
        const edge = fixedEdges.find((e) => e.id === traversal.activeEdgeId);
        if (edge) {
          const pts = getEdgePoints(edge);
          if (pts) {
            const pt = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, traversal.progress);

            // Draw comet trail (past 3 points)
            for (let i = 1; i <= 3; i++) {
              const tailProgress = Math.max(traversal.progress - i * 0.05, 0);
              const tailPt = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, tailProgress);
              ctx.save();
              ctx.beginPath();
              ctx.arc(tailPt.x, tailPt.y, 3 - i * 0.7, 0, Math.PI * 2);
              ctx.fillStyle = edge.color;
              ctx.globalAlpha = 0.6 - i * 0.18;
              ctx.fill();
              ctx.restore();
            }

            // Main glowing energy orb
            ctx.save();
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = edge.color;
            ctx.shadowBlur = 18;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
            ctx.strokeStyle = edge.color;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 3. Draw Nodes (Core 1-Column Pipeline)
      fixedNodes.forEach((node) => {
        const isActive = activeNode === node.id;
        const isVisited = visitedSet.has(node.id);
        const isSelected = selectedNode === node.id;
        const isHovered = hoveredNode === node.id;

        const isExternalActive =
          (node.id === 'synthesizer' && !!exec?.isLlmActive) ||
          (node.id === 'jev_service' && !!exec?.isJevActive);

        let accentColor = '#3b82f6';
        let bgGradient = ['#0f172a', '#1e293b'];

        if (node.type === 'start') {
          accentColor = '#10b981';
          bgGradient = ['#022c22', '#064e3b'];
        } else if (node.type === 'router') {
          accentColor = '#38bdf8';
          bgGradient = ['#0c4a6e', '#0369a1'];
        } else if (node.type === 'safety') {
          accentColor = '#f59e0b';
          bgGradient = ['#451a03', '#78350f'];
        } else if (node.type === 'tool') {
          accentColor = '#c084fc';
          bgGradient = ['#3b0764', '#581c87'];
        } else if (node.type === 'synth') {
          accentColor = '#34d399';
          bgGradient = ['#064e3b', '#047857'];
        } else if (node.type === 'end') {
          accentColor = '#818cf8';
          bgGradient = ['#1e1b4b', '#312e81'];
        } else if (node.type === 'llm_service') {
          accentColor = '#38bdf8';
          bgGradient = ['#082f49', '#0369a1'];
        } else if (node.type === 'jev_service') {
          accentColor = '#10b981';
          bgGradient = ['#022c22', '#047857'];
        }

        ctx.save();

        // Active pulsing halo
        if (isActive || isExternalActive) {
          const pulse = (Math.sin(time / 160) + 1) / 2;
          ctx.save();
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 18 + pulse * 14;
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 2.4;
          drawRoundedRect(
            ctx,
            node.x - 2 - pulse * 1.5,
            node.y - 2 - pulse * 1.5,
            node.w + 4 + pulse * 3,
            node.h + 4 + pulse * 3,
            node.isExternal ? 12 : 10,
          );
          ctx.stroke();
          ctx.restore();
        }

        // Selected / Hovered indicator
        if (isSelected) {
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 8;
        }

        // Background Gradient
        const grad = ctx.createLinearGradient(node.x, node.y, node.x + node.w, node.y + node.h);
        if (isActive || isExternalActive) {
          grad.addColorStop(0, bgGradient[0]);
          grad.addColorStop(1, bgGradient[1]);
        } else if (node.isExternal) {
          grad.addColorStop(0, 'rgba(10, 15, 30, 0.95)');
          grad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
        } else if (isVisited) {
          grad.addColorStop(0, 'rgba(15, 23, 42, 0.98)');
          grad.addColorStop(1, 'rgba(25, 35, 55, 0.9)');
        } else {
          grad.addColorStop(0, 'rgba(15, 23, 42, 0.94)');
          grad.addColorStop(1, 'rgba(30, 41, 59, 0.85)');
        }

        ctx.fillStyle = grad;
        ctx.strokeStyle = isActive || isExternalActive
          ? accentColor
          : isSelected
          ? '#e2e8f0'
          : isVisited
          ? `${accentColor}bb`
          : isHovered
          ? accentColor
          : node.isExternal
          ? 'rgba(56, 189, 248, 0.35)'
          : 'rgba(51, 65, 85, 0.85)';
        ctx.lineWidth = isActive || isExternalActive || isSelected ? 2 : 1.2;

        drawRoundedRect(ctx, node.x, node.y, node.w, node.h, node.isExternal ? 10 : 8);
        ctx.fill();
        ctx.stroke();

        // Left accent status indicator
        ctx.save();
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        const dotX = node.x + 13;
        const dotY = node.y + (node.h <= 40 ? node.h / 2 : 18);
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fill();

        if (isActive || isExternalActive) {
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 8;
          ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        // Node Title
        ctx.save();
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const titleY = node.h <= 40 ? node.y + 8 : node.y + 10;
        ctx.fillText(node.name, node.x + 24, titleY);

        // Node Subtitle / Role
        ctx.font = '9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = isActive || isExternalActive ? '#e2e8f0' : '#94a3b8';
        const subY = node.h <= 40 ? node.y + 21 : node.y + 26;
        ctx.fillText(node.sub, node.x + 24, subY);

        // Tool Executor Special: If a tool is active, display tool name!
        if (node.id === 'tool_executor' && exec?.activeTool) {
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = '#f0abfc';
          let toolLabel = `⚡ ${exec.activeTool}()`;
          if (exec.activeTool === 'create_resource_request') {
            toolLabel = '⚡ create_req() [승인요청 접수]';
          } else if (exec.activeTool === 'review_resource_request') {
            toolLabel = '⚡ review_req() [완전 승인]';
          }
          ctx.fillText(toolLabel, node.x + 24, node.y + 39);
        } else if (node.id === 'router' && exec?.intent && exec.intent !== 'llm_not_connected') {
          ctx.font = 'bold 8.5px monospace';
          ctx.fillStyle = '#7dd3fc';
          ctx.fillText(`intent: ${exec.intent}`, node.x + 24, node.y + 39);
        } else if (node.id === 'synthesizer' && (isActive || isVisited || exec?.isLlmActive)) {
          ctx.font = 'bold 8.5px monospace';
          ctx.fillStyle = '#6ee7b7';
          ctx.fillText(isActive || exec?.isLlmActive ? '⚡ 한국어 답변 합성 중' : '✓ 응답 합성 완료', node.x + 24, node.y + 39);
        } else if (node.id === 'jev_service' && (isActive || isVisited || exec?.isJevActive)) {
          ctx.font = 'bold 8.5px monospace';
          ctx.fillStyle = '#34d399';
          ctx.fillText(isActive || exec?.isJevActive ? '⚡ 거버넌스 정책 검증 중' : '✓ 거버넌스 승인 완료', node.x + 24, node.y + 39);
        }

        // Visited Checkmark Badge
        if (isVisited && !isActive) {
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = '#34d399';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('✓ DONE', node.x + node.w - 8, node.y + 8);
        }

        // Active Badge
        if (isActive || isExternalActive) {
          ctx.font = 'bold 8.5px monospace';
          ctx.fillStyle = accentColor;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('ACTIVE', node.x + node.w - 8, node.y + 8);
        }

        ctx.restore();
        ctx.restore();
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [getEdgePoints]);

  // Handle Mouse Events using inverse virtual transform
  const getVirtualCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const { scale, offsetX, offsetY } = transformRef.current;
    const vx = (clientX - offsetX) / scale;
    const vy = (clientY - offsetY) / scale;

    return { vx, vy };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getVirtualCoords(e);
    if (!coords) return;

    const found = fixedNodes.find(
      (n) =>
        coords.vx >= n.x &&
        coords.vx <= n.x + n.w &&
        coords.vy >= n.y &&
        coords.vy <= n.y + n.h,
    );

    if (found) {
      hoveredNodeIdRef.current = found.id;
      setHoveredNodeId(found.id);
      if (canvasRef.current) canvasRef.current.style.cursor = 'pointer';
    } else {
      hoveredNodeIdRef.current = null;
      setHoveredNodeId(null);
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getVirtualCoords(e);
    if (!coords) return;

    const found = fixedNodes.find(
      (n) =>
        coords.vx >= n.x &&
        coords.vx <= n.x + n.w &&
        coords.vy >= n.y &&
        coords.vy <= n.y + n.h,
    );

    if (found) {
      setSelectedNodeId(found.id);
      if (onSelectNode) onSelectNode(found.id);
    }
  };

  const selectedNode = fixedNodes.find((n) => n.id === selectedNodeId) || fixedNodes[1];

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full w-full bg-[#040711] relative select-none overflow-hidden ${className}`}
    >
      {/* Top Floating Status Indicator */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-800 px-2.5 py-1 rounded-md text-xs shadow-md">
          <GitFork className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold text-slate-200">LangGraph 상태 머신</span>
          {effectiveActiveId ? (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 font-mono text-emerald-300 border-emerald-500/50 bg-emerald-950/50 animate-pulse flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>탐색 중: {effectiveActiveId}</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-slate-400 border-slate-700 bg-slate-800/40">
              대기 (Standby)
            </Badge>
          )}
        </div>

        {/* Live Active Tool Pill */}
        {executionState?.activeTool && (
          <div className="flex items-center gap-1.5 bg-purple-950/80 backdrop-blur border border-purple-800/80 px-2.5 py-1 rounded-md text-[11px] font-mono text-purple-300 animate-pulse shadow-md">
            <Wrench className="w-3 h-3 text-purple-400" />
            <span>호출: {executionState.activeTool}()</span>
          </div>
        )}
      </div>

      {/* Canvas Element filling 100% of available space */}
      <div className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          className="block w-full h-full"
        />
      </div>

      {/* Live Status Message & Traversal Trail Banner */}
      <div className="px-3 py-1.5 border-t border-slate-800/80 bg-slate-900/70 text-[11px] flex items-center justify-between text-slate-300 shrink-0 font-mono">
        <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
          {effectiveActiveId ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
          )}
          <span className="text-slate-400 shrink-0 font-semibold">
            {effectiveActiveId ? '실시간 탐색:' : '탐색 대기:'}
          </span>
          <span className="text-blue-200 font-sans truncate">
            {executionState?.statusMessage || '채팅 메시지를 전송하면 LangGraph 상태 머신이 노드를 탐색합니다.'}
          </span>
        </div>

        {/* Traversal Summary Trail */}
        {executionState?.visitedNodeIds && executionState.visitedNodeIds.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-mono shrink-0 pl-2">
            <span>트레일:</span>
            {executionState.visitedNodeIds.map((nid, idx) => (
              <span key={nid} className="flex items-center gap-0.5">
                <span className="text-emerald-400">{nid}</span>
                {idx < executionState.visitedNodeIds.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-slate-600" />}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Selected Node Details Drawer */}
      {!compact && selectedNode && (
        <div className="p-3 border-t border-slate-800/90 bg-slate-950/95 shrink-0 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="font-bold text-slate-100">{selectedNode.name}</span>
              <span className="text-[10px] font-mono text-slate-500">ID: {selectedNode.id}</span>
            </div>
            {effectiveActiveId === selectedNode.id && (
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/40 animate-pulse">
                현재 활성화 노드
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {selectedNode.description}
          </p>
        </div>
      )}
    </div>
  );
}
