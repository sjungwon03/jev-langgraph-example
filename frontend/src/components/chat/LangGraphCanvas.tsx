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
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface CanvasNode {
  id: string;
  name: string;
  sub: string;
  type: 'start' | 'router' | 'safety' | 'tool' | 'synth' | 'end';
  x: number;
  y: number;
  w: number;
  h: number;
  description: string;
  stateUpdates: string[];
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
  color?: string;
  dashed?: boolean;
}

interface Particle {
  edgeId: string;
  t: number;
  speed: number;
  size: number;
  color: string;
}

interface LangGraphCanvasProps {
  activeNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
  compact?: boolean;
}

const VIRTUAL_WIDTH = 460;
const VIRTUAL_HEIGHT = 560;

const nodeDetails: Record<string, { desc: string; state: string[] }> = {
  __start__: {
    desc: '사용자의 자연어 메시지를 입력받아 InfraAgentState 세션을 초기화합니다.',
    state: ['messages: concat(user_query)'],
  },
  router: {
    desc: 'LLM(ChatGPT/Claude)을 통해 질의 의도를 분석하고 Proxmox MCP 도구 호출 여부 및 파라미터를 결정합니다.',
    state: ['intent: string', 'toolToCall: ToolCall | null', 'thought: string'],
  },
  safety_check: {
    desc: '인프라 거버넌스 안전 검증. VM 삭제/강제종료 등 파괴적 고위험 작업 감지 시 HITL 승인 토큰을 발급하여 인터럽트합니다.',
    state: ['confirmationNeeded: Confirmation | null', 'safetyEvaluation: string'],
  },
  tool_executor: {
    desc: 'Proxmox MCP API 또는 자원 신청 티켓 관리 시스템과 직접 통신하여 인프라 작업을 실행합니다.',
    state: ['toolResult: any', 'latencyMs: number'],
  },
  synthesizer: {
    desc: '도구 실행 결과 및 인프라 상태를 정돈하여 최종 사용자용 마크다운 대화형 답변을 생성합니다.',
    state: ['finalResponse: string (SSE Stream)'],
  },
  __end__: {
    desc: 'SSE 스트리밍 전송을 완료하고 의사결정 추적 로그 및 감사 로그를 최종 커밋합니다.',
    state: ['status: COMPLETED', 'audit_logged: true'],
  },
};

const fixedNodes: CanvasNode[] = [
  {
    id: '__start__',
    name: 'START',
    sub: '상태 초기화',
    type: 'start',
    x: 165,
    y: 16,
    w: 130,
    h: 38,
    description: nodeDetails.__start__.desc,
    stateUpdates: nodeDetails.__start__.state,
  },
  {
    id: 'router',
    name: 'Router Node',
    sub: 'LLM 의도 분류 & 도구 결정',
    type: 'router',
    x: 140,
    y: 86,
    w: 180,
    h: 56,
    description: nodeDetails.router.desc,
    stateUpdates: nodeDetails.router.state,
  },
  {
    id: 'safety_check',
    name: 'Safety Gate',
    sub: '파괴적 고위험 검증 (HITL)',
    type: 'safety',
    x: 18,
    y: 190,
    w: 164,
    h: 56,
    description: nodeDetails.safety_check.desc,
    stateUpdates: nodeDetails.safety_check.state,
  },
  {
    id: 'tool_executor',
    name: 'Tool Executor',
    sub: 'Proxmox MCP API 실행',
    type: 'tool',
    x: 18,
    y: 295,
    w: 164,
    h: 56,
    description: nodeDetails.tool_executor.desc,
    stateUpdates: nodeDetails.tool_executor.state,
  },
  {
    id: 'synthesizer',
    name: 'Synthesizer',
    sub: '결과 종합 & 응답 생성',
    type: 'synth',
    x: 140,
    y: 400,
    w: 180,
    h: 56,
    description: nodeDetails.synthesizer.desc,
    stateUpdates: nodeDetails.synthesizer.state,
  },
  {
    id: '__end__',
    name: 'END',
    sub: '스트리밍 완료 & 감사 기록',
    type: 'end',
    x: 165,
    y: 504,
    w: 130,
    h: 38,
    description: nodeDetails.__end__.desc,
    stateUpdates: nodeDetails.__end__.state,
  },
];

const fixedEdges: CanvasEdge[] = [
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
];

export function LangGraphCanvas({
  activeNodeId,
  onSelectNode,
  className = '',
  compact = false,
}: LangGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('router');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // References for render loop so state changes don't restart requestAnimationFrame
  const activeNodeIdRef = useRef<string | null>(activeNodeId || null);
  const selectedNodeIdRef = useRef<string>(selectedNodeId);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const transformRef = useRef<{ scale: number; offsetX: number; offsetY: number }>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => {
    activeNodeIdRef.current = activeNodeId || null;
  }, [activeNodeId]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  // Particles state
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const pts: Particle[] = [];
    fixedEdges.forEach((edge) => {
      const count = 3;
      for (let i = 0; i < count; i++) {
        pts.push({
          edgeId: edge.id,
          t: i / count,
          speed: 0.005 + Math.random() * 0.003,
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

    if (edge.id === 'e-start-router') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 12 }, p2: { x: p3.x, y: p3.y - 12 }, p3 };
    }

    if (edge.id === 'e-router-safety') {
      const p0 = { x: fromNode.x + 35, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 25 }, p2: { x: p3.x, y: p3.y - 25 }, p3 };
    }

    if (edge.id === 'e-router-synth-bypass') {
      const p0 = { x: fromNode.x + fromNode.w - 15, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x + toNode.w - 15, y: toNode.y + 15 };
      const bypassX = 425;
      return { p0, p1: { x: bypassX, y: p0.y + 30 }, p2: { x: bypassX, y: p3.y - 40 }, p3 };
    }

    if (edge.id === 'e-safety-tool') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 18 }, p2: { x: p3.x, y: p3.y - 18 }, p3 };
    }

    if (edge.id === 'e-safety-synth-interrupted') {
      const p0 = { x: fromNode.x + fromNode.w - 5, y: fromNode.y + fromNode.h / 2 };
      const p3 = { x: toNode.x + 35, y: toNode.y };
      return { p0, p1: { x: p0.x + 60, y: p0.y + 20 }, p2: { x: p3.x - 20, y: p3.y - 40 }, p3 };
    }

    if (edge.id === 'e-tool-synth') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + 50, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 25 }, p2: { x: p3.x, y: p3.y - 25 }, p3 };
    }

    if (edge.id === 'e-synth-end') {
      const p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      const p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      return { p0, p1: { x: p0.x, y: p0.y + 16 }, p2: { x: p3.x, y: p3.y - 16 }, p3 };
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
      const cw = container.clientWidth || 400;
      const ch = container.clientHeight || 500;

      dpr = window.devicePixelRatio || 1;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;

      // Calculate perfect aspect-ratio preserving fit
      const padding = 16;
      const availW = cw - padding * 2;
      const availH = ch - padding * 2;
      const scale = Math.min(availW / VIRTUAL_WIDTH, availH / VIRTUAL_HEIGHT, 1.25);
      const offsetX = (cw - VIRTUAL_WIDTH * scale) / 2;
      const offsetY = (ch - VIRTUAL_HEIGHT * scale) / 2;

      transformRef.current = { scale, offsetX, offsetY };
    };

    updateSize();

    // Use ResizeObserver for instant responsive updates
    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(container);

    const render = (time: number) => {
      const cw = container.clientWidth || 400;
      const ch = container.clientHeight || 500;
      const { scale, offsetX, offsetY } = transformRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear full canvas with deep dark cyber background
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, cw, ch);

      // Subtle cyber grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.3)';
      ctx.lineWidth = 1;
      const gridSize = 20;
      ctx.beginPath();
      for (let x = 0; x < cw; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
      }
      for (let y = 0; y < ch; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
      }
      ctx.stroke();

      // Transform into virtual coordinate space
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      const activeNode = activeNodeIdRef.current;
      const selectedNode = selectedNodeIdRef.current;
      const hoveredNode = hoveredNodeIdRef.current;

      // 1. Draw Edges
      fixedEdges.forEach((edge) => {
        const pts = getEdgePoints(edge);
        if (!pts) return;

        const isFromActive = activeNode === edge.from;
        const isToActive = activeNode === edge.to;
        const isPathActive = isFromActive || isToActive;

        ctx.save();
        if (edge.dashed) {
          ctx.setLineDash([4, 4]);
        }

        if (isPathActive) {
          ctx.shadowColor = edge.color || '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = edge.color || '#38bdf8';
        } else {
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
        }

        ctx.beginPath();
        ctx.moveTo(pts.p0.x, pts.p0.y);
        ctx.bezierCurveTo(pts.p1.x, pts.p1.y, pts.p2.x, pts.p2.y, pts.p3.x, pts.p3.y);
        ctx.stroke();
        ctx.restore();

        // Edge label
        if (edge.label) {
          const mid = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, 0.5);
          ctx.save();
          ctx.font = '9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textMetrics = ctx.measureText(edge.label);
          const bw = textMetrics.width + 10;
          const bh = 16;

          ctx.fillStyle = isPathActive ? 'rgba(15, 23, 42, 0.95)' : 'rgba(10, 15, 26, 0.85)';
          ctx.strokeStyle = isPathActive ? (edge.color || '#38bdf8') : 'rgba(51, 65, 85, 0.8)';
          ctx.lineWidth = 1;
          drawRoundedRect(ctx, mid.x - bw / 2, mid.y - bh / 2, bw, bh, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isPathActive ? (edge.color || '#38bdf8') : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edge.label, mid.x, mid.y);
          ctx.restore();
        }
      });

      // 2. Draw Edge Particles
      particlesRef.current.forEach((particle) => {
        const edge = fixedEdges.find((e) => e.id === particle.edgeId);
        if (!edge) return;
        const pts = getEdgePoints(edge);
        if (!pts) return;

        const isFromActive = activeNode === edge.from;
        const isToActive = activeNode === edge.to;
        const speedMultiplier = isFromActive || isToActive ? 2.5 : 1;

        particle.t = (particle.t + particle.speed * speedMultiplier) % 1;
        const pt = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, particle.t);

        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = edge.color || '#38bdf8';
        ctx.shadowColor = edge.color || '#38bdf8';
        ctx.shadowBlur = isFromActive || isToActive ? 12 : 5;
        ctx.fill();
        ctx.restore();
      });

      // 3. Draw Nodes
      fixedNodes.forEach((node) => {
        const isActive = activeNode === node.id;
        const isSelected = selectedNode === node.id;
        const isHovered = hoveredNode === node.id;

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
        }

        ctx.save();

        // Active breathing halo
        if (isActive) {
          const pulse = (Math.sin(time / 180) + 1) / 2;
          ctx.save();
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 18 + pulse * 12;
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 2.2;
          drawRoundedRect(
            ctx,
            node.x - 2 - pulse * 1.5,
            node.y - 2 - pulse * 1.5,
            node.w + 4 + pulse * 3,
            node.h + 4 + pulse * 3,
            10,
          );
          ctx.stroke();
          ctx.restore();
        }

        // Node card gradient fill
        const grad = ctx.createLinearGradient(node.x, node.y, node.x + node.w, node.y + node.h);
        if (isActive || isSelected) {
          grad.addColorStop(0, bgGradient[0]);
          grad.addColorStop(1, bgGradient[1]);
        } else {
          grad.addColorStop(0, 'rgba(15, 23, 42, 0.96)');
          grad.addColorStop(1, 'rgba(30, 41, 59, 0.88)');
        }

        ctx.fillStyle = grad;
        ctx.strokeStyle = isActive
          ? accentColor
          : isSelected
          ? '#e2e8f0'
          : isHovered
          ? accentColor
          : 'rgba(51, 65, 85, 0.85)';
        ctx.lineWidth = isActive || isSelected ? 2 : 1;

        drawRoundedRect(ctx, node.x, node.y, node.w, node.h, 9);
        ctx.fill();
        ctx.stroke();

        // Left accent status dot
        ctx.save();
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        const dotX = node.x + 14;
        const dotY = node.y + node.h / 2;
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fill();

        if (isActive) {
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
        const titleY = node.h <= 42 ? node.y + 8 : node.y + 10;
        ctx.fillText(node.name, node.x + 25, titleY);

        // Node Subtitle
        ctx.font = '9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = isActive ? '#e2e8f0' : '#94a3b8';
        const subY = node.h <= 42 ? node.y + 22 : node.y + 26;
        ctx.fillText(node.sub, node.x + 25, subY);
        ctx.restore();

        // Active RUNNING badge
        if (isActive) {
          ctx.save();
          ctx.font = 'bold 8.5px monospace';
          ctx.fillStyle = accentColor;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('ACTIVE', node.x + node.w - 8, node.y + 9);
          ctx.restore();
        }

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
      className={`flex flex-col h-full w-full bg-[#050811] relative select-none overflow-hidden ${className}`}
    >
      {/* Top Floating Status Indicator */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-2 bg-slate-900/80 backdrop-blur border border-slate-800 px-2.5 py-1 rounded-md text-xs">
        <GitFork className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-semibold text-slate-200">LangGraph State Machine</span>
        {activeNodeId ? (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 font-mono text-emerald-300 border-emerald-500/50 bg-emerald-950/40 animate-pulse flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>실행: {activeNodeId}</span>
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-slate-400 border-slate-700 bg-slate-800/40">
            대기 (Idle)
          </Badge>
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

      {/* Selected Node Details Drawer */}
      {!compact && selectedNode && (
        <div className="p-3 border-t border-slate-800/90 bg-slate-950/95 shrink-0 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="font-bold text-slate-100">{selectedNode.name}</span>
              <span className="text-[10px] font-mono text-slate-500">ID: {selectedNode.id}</span>
            </div>
            {activeNodeId === selectedNode.id && (
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/40 animate-pulse">
                현재 활성화 노드
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
            {selectedNode.description}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-slate-500 font-mono">STATE:</span>
            {selectedNode.stateUpdates.map((su, idx) => (
              <span
                key={idx}
                className="text-[10px] font-mono bg-slate-900 border border-slate-800 text-blue-300 px-1.5 py-0.5 rounded"
              >
                {su}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
