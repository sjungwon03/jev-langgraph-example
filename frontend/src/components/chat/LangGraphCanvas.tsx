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
  Cpu,
  Check,
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
  color?: string;
  dashed?: boolean;
  isExternalBus?: boolean;
}

interface Particle {
  edgeId: string;
  t: number;
  speed: number;
  size: number;
  color: string;
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
  router: {
    desc: '외부 LLM 서비스를 호출하여 발화 의도를 심층 분류하고 필요한 Proxmox 도구 및 인수를 추론합니다.',
  },
  safety_check: {
    desc: 'JEV 보안 정책 엔진 연동. VM 삭제/강제종료 등 파괴적 고위험 작업 감지 시 HITL 승인 토큰을 발급합니다.',
  },
  tool_executor: {
    desc: 'JEV Controller API를 통해 Proxmox VE 8.2 클러스터 명령 및 자원 티켓을 원격 실행합니다.',
  },
  synthesizer: {
    desc: '도구 실행 결과를 외부 LLM과 종합하여 최종 한국어 마크다운 대화형 답변을 생성합니다.',
  },
  __end__: {
    desc: 'SSE 스트리밍 전송을 정상 종료하고 세션 상태 및 감사 로그를 최종 커밋합니다.',
  },
  llm_service: {
    desc: '외부 대형 언어 모델 서비스(OpenAI gpt-4o-mini / vLLM). 의도 추론(Router) 및 답변 합성(Synthesizer)을 수행합니다.',
  },
  jev_service: {
    desc: 'JEV Controller & Base Auth 프레임워크. Proxmox VE 8.2 가상화 인프라와 안전하게 통신합니다.',
  },
};

const fixedNodes: CanvasNode[] = [
  // 1. LangGraph Core State Machine Nodes (Center Spine)
  {
    id: '__start__',
    name: 'START',
    sub: '상태 초기화',
    type: 'start',
    x: 225,
    y: 18,
    w: 130,
    h: 36,
    description: nodeDetails.__start__.desc,
  },
  {
    id: 'router',
    name: 'Router Node',
    sub: 'LLM 의도 분류 & 도구 결정',
    type: 'router',
    x: 200,
    y: 86,
    w: 180,
    h: 56,
    description: nodeDetails.router.desc,
  },
  {
    id: 'safety_check',
    name: 'Safety Gate',
    sub: '파괴적 고위험 검증 (HITL)',
    type: 'safety',
    x: 160,
    y: 192,
    w: 160,
    h: 54,
    description: nodeDetails.safety_check.desc,
  },
  {
    id: 'tool_executor',
    name: 'Tool Executor',
    sub: 'Proxmox MCP API 실행',
    type: 'tool',
    x: 160,
    y: 298,
    w: 160,
    h: 54,
    description: nodeDetails.tool_executor.desc,
  },
  {
    id: 'synthesizer',
    name: 'Synthesizer',
    sub: '결과 종합 & 응답 생성',
    type: 'synth',
    x: 200,
    y: 405,
    w: 180,
    h: 56,
    description: nodeDetails.synthesizer.desc,
  },
  {
    id: '__end__',
    name: 'END',
    sub: '스트리밍 완료 & 감사 커밋',
    type: 'end',
    x: 225,
    y: 512,
    w: 130,
    h: 36,
    description: nodeDetails.__end__.desc,
  },

  // 2. Separate External Service Nodes (Sidecars)
  {
    id: 'llm_service',
    name: 'LLM Engine',
    sub: 'OpenAI / Claude',
    type: 'llm_service',
    x: 425,
    y: 82,
    w: 140,
    h: 64,
    description: nodeDetails.llm_service.desc,
    isExternal: true,
  },
  {
    id: 'jev_service',
    name: 'JEV Controller',
    sub: 'Proxmox VE 8.2',
    type: 'jev_service',
    x: 15,
    y: 245,
    w: 125,
    h: 64,
    description: nodeDetails.jev_service.desc,
    isExternal: true,
  },
];

const fixedEdges: CanvasEdge[] = [
  // Core Transitions
  {
    id: 'e-start-router',
    from: '__start__',
    to: 'router',
    color: '#10b981',
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
    label: '안전 승인',
    condition: '!confirmationNeeded',
    color: '#a855f7',
  },
  {
    id: 'e-safety-synth-interrupted',
    from: 'safety_check',
    to: 'synthesizer',
    label: '승인 요청 대기',
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

  // External Service Data Busses (Dashed Glowing Lines)
  {
    id: 'e-router-llm',
    from: 'router',
    to: 'llm_service',
    label: '추론 요청',
    color: '#38bdf8',
    dashed: true,
    isExternalBus: true,
  },
  {
    id: 'e-synth-llm',
    from: 'synthesizer',
    to: 'llm_service',
    label: '답변 합성',
    color: '#34d399',
    dashed: true,
    isExternalBus: true,
  },
  {
    id: 'e-jev-tool',
    from: 'tool_executor',
    to: 'jev_service',
    label: 'Proxmox 제어',
    color: '#c084fc',
    dashed: true,
    isExternalBus: true,
  },
  {
    id: 'e-jev-safety',
    from: 'safety_check',
    to: 'jev_service',
    label: '거버넌스 검증',
    color: '#f59e0b',
    dashed: true,
    isExternalBus: true,
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

  // References to preserve 60fps render loop without restarts
  const effectiveActiveId = executionState?.activeNodeId || activeNodeId || null;
  const activeNodeIdRef = useRef<string | null>(effectiveActiveId);
  const executionStateRef = useRef<GraphExecutionState | undefined>(executionState);
  const selectedNodeIdRef = useRef<string>(selectedNodeId);
  const hoveredNodeIdRef = useRef<string | null>(null);

  const transformRef = useRef<{ scale: number; offsetX: number; offsetY: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    activeNodeIdRef.current = effectiveActiveId;
  }, [effectiveActiveId]);

  useEffect(() => {
    executionStateRef.current = executionState;
  }, [executionState]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  // Particles state
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const pts: Particle[] = [];
    fixedEdges.forEach((edge) => {
      const count = edge.isExternalBus ? 2 : 3;
      for (let i = 0; i < count; i++) {
        pts.push({
          edgeId: edge.id,
          t: i / count,
          speed: 0.004 + Math.random() * 0.003,
          size: 2.5 + Math.random() * 1.5,
          color: edge.color || '#38bdf8',
        });
      }
    });
    particlesRef.current = pts;
  }, []);

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

    // 1. Core State Machine Flows
    if (edge.id === 'e-start-router') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 12 }, p2: { x: p3.x, y: p3.y - 12 }, p3 };
    }

    if (edge.id === 'e-router-safety') {
      const p0 = { x: fromNode.x + 40, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 22 }, p2: { x: p3.x, y: p3.y - 22 }, p3 };
    }

    if (edge.id === 'e-router-synth-bypass') {
      const p0 = { x: fromNode.x + fromNode.w - 15, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x + toNode.w - 15, y: toNode.y + 15 };
      const bypassX = 395;
      return { p0, p1: { x: bypassX, y: p0.y + 25 }, p2: { x: bypassX, y: p3.y - 35 }, p3 };
    }

    if (edge.id === 'e-safety-tool') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 16 }, p2: { x: p3.x, y: p3.y - 16 }, p3 };
    }

    if (edge.id === 'e-safety-synth-interrupted') {
      const p0 = { x: fromNode.x + fromNode.w - 5, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x + 35, y: toNode.y };
      return { p0, p1: { x: p0.x + 45, y: p0.y + 20 }, p2: { x: p3.x - 20, y: p3.y - 35 }, p3 };
    }

    if (edge.id === 'e-tool-synth') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + 50, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 22 }, p2: { x: p3.x, y: p3.y - 22 }, p3 };
    }

    if (edge.id === 'e-synth-end') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 16 }, p2: { x: p3.x, y: p3.y - 16 }, p3 };
    }

    // 2. External Service Data Busses
    if (edge.id === 'e-router-llm') {
      const p0 = { x: fromNode.x + fromNode.w, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x, y: toNode.y + toNode.h / 2 };
      return { p0, p1: { x: (p0.x + p3.x) / 2, y: p0.y }, p2: { x: (p0.x + p3.x) / 2, y: p3.y }, p3 };
    }

    if (edge.id === 'e-synth-llm') {
      const p0 = { x: fromNode.x + fromNode.w, y: fromNode.y + 20 };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y + toNode.h };
      return { p0, p1: { x: p3.x, y: p0.y }, p2: { x: p3.x, y: (p0.y + p3.y) / 2 }, p3 };
    }

    if (edge.id === 'e-jev-tool') {
      const p0 = { x: fromNode.x, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x + toNode.w, y: toNode.y + toNode.h / 2 };
      return { p0, p1: { x: (p0.x + p3.x) / 2, y: p0.y }, p2: { x: (p0.x + p3.x) / 2, y: p3.y }, p3 };
    }

    if (edge.id === 'e-jev-safety') {
      const p0 = { x: fromNode.x, y: fromNode.y + 20 };
      const p3 = { x: toNode.x + toNode.w, y: toNode.y + 20 };
      return { p0, p1: { x: (p0.x + p3.x) / 2, y: p0.y }, p2: { x: (p0.x + p3.x) / 2, y: p3.y }, p3 };
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
      ctx.fillStyle = 'rgba(51, 65, 85, 0.25)';
      const step = 20;
      for (let x = 10; x < cw; x += step) {
        for (let y = 10; y < ch; y += step) {
          ctx.fillRect(x, y, 1.2, 1.2);
        }
      }

      // Transform into virtual coordinate space
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      const activeNode = activeNodeIdRef.current;
      const exec = executionStateRef.current;
      const selectedNode = selectedNodeIdRef.current;
      const hoveredNode = hoveredNodeIdRef.current;

      const visitedSet = new Set(exec?.visitedNodeIds || []);
      if (activeNode) visitedSet.add(activeNode);

      // 1. Draw Edges
      fixedEdges.forEach((edge) => {
        const pts = getEdgePoints(edge);
        if (!pts) return;

        // Check if edge is on the active path
        const isFromActive = activeNode === edge.from;
        const isToActive = activeNode === edge.to;
        const isExternalActive =
          (edge.to === 'llm_service' && exec?.isLlmActive) ||
          (edge.to === 'jev_service' && exec?.isJevActive);

        const isEdgeActive = isFromActive || isToActive || isExternalActive;
        const isEdgeVisited = visitedSet.has(edge.from) && visitedSet.has(edge.to);

        ctx.save();
        if (edge.dashed) {
          ctx.setLineDash([4, 4]);
        }

        if (isEdgeActive) {
          ctx.shadowColor = edge.color || '#38bdf8';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 2.8;
          ctx.strokeStyle = edge.color || '#38bdf8';
        } else if (isEdgeVisited) {
          ctx.shadowBlur = 4;
          ctx.lineWidth = 2;
          ctx.strokeStyle = edge.color ? `${edge.color}aa` : 'rgba(56, 189, 248, 0.7)';
        } else {
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = edge.isExternalBus ? 'rgba(51, 65, 85, 0.3)' : 'rgba(71, 85, 105, 0.35)';
        }

        ctx.beginPath();
        ctx.moveTo(pts.p0.x, pts.p0.y);
        ctx.bezierCurveTo(pts.p1.x, pts.p1.y, pts.p2.x, pts.p2.y, pts.p3.x, pts.p3.y);
        ctx.stroke();
        ctx.restore();

        // Edge label (only show on active or visited or main path)
        if (edge.label) {
          const mid = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, 0.5);
          ctx.save();
          ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textMetrics = ctx.measureText(edge.label);
          const bw = textMetrics.width + 10;
          const bh = 15;

          ctx.fillStyle = isEdgeActive ? 'rgba(15, 23, 42, 0.96)' : 'rgba(10, 15, 26, 0.85)';
          ctx.strokeStyle = isEdgeActive ? (edge.color || '#38bdf8') : 'rgba(51, 65, 85, 0.6)';
          ctx.lineWidth = 1;
          drawRoundedRect(ctx, mid.x - bw / 2, mid.y - bh / 2, bw, bh, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isEdgeActive ? (edge.color || '#38bdf8') : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edge.label, mid.x, mid.y);
          ctx.restore();
        }
      });

      // 2. Draw Animated Edge Particles (Energy Packets)
      particlesRef.current.forEach((particle) => {
        const edge = fixedEdges.find((e) => e.id === particle.edgeId);
        if (!edge) return;
        const pts = getEdgePoints(edge);
        if (!pts) return;

        const isFromActive = activeNode === edge.from;
        const isToActive = activeNode === edge.to;
        const isExternalActive =
          (edge.to === 'llm_service' && exec?.isLlmActive) ||
          (edge.to === 'jev_service' && exec?.isJevActive);

        const isEdgeActive = isFromActive || isToActive || isExternalActive;
        const speedBoost = isEdgeActive ? 3.2 : 0.8;

        particle.t = (particle.t + particle.speed * speedBoost) % 1;
        const pt = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, particle.t);

        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isEdgeActive ? particle.size * 1.3 : particle.size * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = edge.color || '#38bdf8';
        ctx.shadowColor = edge.color || '#38bdf8';
        ctx.shadowBlur = isEdgeActive ? 14 : 4;
        ctx.fill();
        ctx.restore();
      });

      // 3. Draw Nodes (Core + External Sidecars)
      fixedNodes.forEach((node) => {
        const isActive = activeNode === node.id;
        const isVisited = visitedSet.has(node.id);
        const isSelected = selectedNode === node.id;
        const isHovered = hoveredNode === node.id;

        // Is external service active?
        const isExternalActive =
          (node.id === 'llm_service' && exec?.isLlmActive) ||
          (node.id === 'jev_service' && exec?.isJevActive);

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
          ctx.fillText(`⚡ ${exec.activeTool}()`, node.x + 24, node.y + 39);
        } else if (node.id === 'router' && exec?.intent && exec.intent !== 'llm_not_connected') {
          ctx.font = 'bold 8.5px monospace';
          ctx.fillStyle = '#7dd3fc';
          ctx.fillText(`intent: ${exec.intent}`, node.x + 24, node.y + 39);
        } else if (node.isExternal) {
          ctx.font = '8.5px monospace';
          ctx.fillStyle = isExternalActive ? accentColor : '#64748b';
          const label = node.id === 'llm_service' ? 'EXTERNAL LLM' : 'PROXMOX API';
          ctx.fillText(label, node.x + 24, node.y + 42);
        }

        // Visited Checkmark Badge
        if (isVisited && !isActive && !node.isExternal) {
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
          <span className="font-semibold text-slate-200">LangGraph State Machine</span>
          {effectiveActiveId ? (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 font-mono text-emerald-300 border-emerald-500/50 bg-emerald-950/50 animate-pulse flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>실행: {effectiveActiveId}</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-slate-400 border-slate-700 bg-slate-800/40">
              대기 (Idle)
            </Badge>
          )}
        </div>

        {/* Live Active Tool Pill */}
        {executionState?.activeTool && (
          <div className="flex items-center gap-1.5 bg-purple-950/80 backdrop-blur border border-purple-800/80 px-2.5 py-1 rounded-md text-[11px] font-mono text-purple-300 animate-pulse shadow-md">
            <Wrench className="w-3 h-3 text-purple-400" />
            <span>도구: {executionState.activeTool}()</span>
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

      {/* Live Status Message Banner */}
      {executionState?.statusMessage && (
        <div className="px-3 py-1.5 border-t border-slate-800/80 bg-slate-900/70 text-[11px] flex items-center gap-2 text-slate-300 shrink-0 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          <span className="text-slate-400">STATUS:</span>
          <span className="text-blue-200 font-sans">{executionState.statusMessage}</span>
        </div>
      )}

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
