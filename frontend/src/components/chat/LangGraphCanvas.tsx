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
  Maximize2,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  const [dimensions, setDimensions] = useState({ width: 600, height: 660 });
  const animFrameIdRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  // Node details lookup
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

  // Calculate layout nodes based on current canvas width
  const getLayoutNodes = useCallback((): CanvasNode[] => {
    const cx = dimensions.width / 2;
    const isNarrow = dimensions.width < 500;
    const branchOffset = isNarrow ? 110 : 145;

    return [
      {
        id: '__start__',
        name: 'START',
        sub: '입력 주입 & 상태 초기화',
        type: 'start',
        x: cx - 75,
        y: 25,
        w: 150,
        h: 46,
        description: nodeDetails.__start__.desc,
        stateUpdates: nodeDetails.__start__.state,
      },
      {
        id: 'router',
        name: 'Router Node',
        sub: 'LLM 의도 분류 & 도구 결정',
        type: 'router',
        x: cx - 95,
        y: 110,
        w: 190,
        h: 58,
        description: nodeDetails.router.desc,
        stateUpdates: nodeDetails.router.state,
      },
      {
        id: 'safety_check',
        name: 'Safety Gate',
        sub: '파괴적 고위험 검증 (HITL)',
        type: 'safety',
        x: cx - branchOffset - 85,
        y: 220,
        w: 170,
        h: 56,
        description: nodeDetails.safety_check.desc,
        stateUpdates: nodeDetails.safety_check.state,
      },
      {
        id: 'tool_executor',
        name: 'Tool Executor',
        sub: 'Proxmox MCP 실행',
        type: 'tool',
        x: cx - branchOffset - 85,
        y: 335,
        w: 170,
        h: 56,
        description: nodeDetails.tool_executor.desc,
        stateUpdates: nodeDetails.tool_executor.state,
      },
      {
        id: 'synthesizer',
        name: 'Synthesizer',
        sub: '결과 종합 & 응답 생성',
        type: 'synth',
        x: cx - 95,
        y: 450,
        w: 190,
        h: 58,
        description: nodeDetails.synthesizer.desc,
        stateUpdates: nodeDetails.synthesizer.state,
      },
      {
        id: '__end__',
        name: 'END',
        sub: '스트리밍 종료 & 감사 기록',
        type: 'end',
        x: cx - 75,
        y: 565,
        w: 150,
        h: 46,
        description: nodeDetails.__end__.desc,
        stateUpdates: nodeDetails.__end__.state,
      },
    ];
  }, [dimensions.width]);

  // Edges definition
  const edges: CanvasEdge[] = [
    {
      id: 'e-start-router',
      from: '__start__',
      to: 'router',
      label: 'START',
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
      color: '#3b82f6',
      dashed: true,
    },
    {
      id: 'e-safety-tool',
      from: 'safety_check',
      to: 'tool_executor',
      label: '안전 승인 통과',
      condition: '!confirmationNeeded',
      color: '#a855f7',
    },
    {
      id: 'e-safety-synth-interrupted',
      from: 'safety_check',
      to: 'synthesizer',
      label: '승인 요청 대기 (중단)',
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
      label: '완료',
      color: '#6366f1',
    },
  ];

  // Initialize and maintain particles
  useEffect(() => {
    const initialParticles: Particle[] = [];
    edges.forEach((edge) => {
      const count = 3;
      for (let i = 0; i < count; i++) {
        initialParticles.push({
          edgeId: edge.id,
          t: i / count,
          speed: 0.004 + Math.random() * 0.003,
          size: 2.5 + Math.random() * 1.5,
          color: edge.color || '#38bdf8',
        });
      }
    });
    particlesRef.current = initialParticles;
  }, []);

  // Update dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: Math.max(clientWidth, 380),
          height: Math.max(clientHeight, 640),
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper to get bezier path points for edge
  const getEdgePoints = useCallback(
    (edge: CanvasEdge, nodes: CanvasNode[]) => {
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) return null;

      const cx = dimensions.width / 2;

      // Special handling for right bypass: router -> synthesizer
      if (edge.id === 'e-router-synth-bypass') {
        const p0 = { x: fromNode.x + fromNode.w - 15, y: fromNode.y + fromNode.h - 5 };
        const p3 = { x: toNode.x + toNode.w - 15, y: toNode.y + 5 };
        const bypassX = cx + (dimensions.width < 500 ? 120 : 160);
        const p1 = { x: bypassX, y: p0.y + 60 };
        const p2 = { x: bypassX, y: p3.y - 60 };
        return { p0, p1, p2, p3 };
      }

      // Special handling for safety -> synthesizer (interrupted HITL)
      if (edge.id === 'e-safety-synth-interrupted') {
        const p0 = { x: fromNode.x + fromNode.w, y: fromNode.y + fromNode.h / 2 };
        const p3 = { x: toNode.x + 20, y: toNode.y };
        const p1 = { x: cx - 20, y: fromNode.y + fromNode.h / 2 };
        const p2 = { x: cx - 20, y: toNode.y - 40 };
        return { p0, p1, p2, p3 };
      }

      // Default vertical / branch flows
      let p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
      let p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };

      // Router to safety check (flows to left)
      if (edge.id === 'e-router-safety') {
        p0 = { x: fromNode.x + 30, y: fromNode.y + fromNode.h };
        p3 = { x: toNode.x + toNode.w / 2, y: toNode.y };
      }

      // Tool executor to synthesizer (flows from left back to center)
      if (edge.id === 'e-tool-synth') {
        p0 = { x: fromNode.x + fromNode.w / 2, y: fromNode.y + fromNode.h };
        p3 = { x: toNode.x + 40, y: toNode.y };
      }

      const dy = p3.y - p0.y;
      const p1 = { x: p0.x, y: p0.y + dy * 0.45 };
      const p2 = { x: p3.x, y: p3.y - dy * 0.45 };

      return { p0, p1, p2, p3 };
    },
    [dimensions.width],
  );

  // Evaluate cubic bezier at t
  const getBezierPoint = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number,
  ) => {
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x;
    const y =
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y;
    return { x, y };
  };

  // Helper to draw rounded rectangle
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

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Support High-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    let startTime = performance.now();

    const render = (time: number) => {
      const elapsed = time - startTime;
      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear Canvas
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // Draw subtle background grid
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 1;
      const gridSize = 24;
      ctx.beginPath();
      for (let x = 0; x < dimensions.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height);
      }
      for (let y = 0; y < dimensions.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width, y);
      }
      ctx.stroke();

      const nodes = getLayoutNodes();

      // 1. Draw Edges
      edges.forEach((edge) => {
        const pts = getEdgePoints(edge, nodes);
        if (!pts) return;

        const isFromActive = activeNodeId === edge.from;
        const isToActive = activeNodeId === edge.to;
        const isPathActive = isFromActive || isToActive;

        ctx.save();
        if (edge.dashed) {
          ctx.setLineDash([4, 4]);
        }

        // Draw shadow glow for active edges
        if (isPathActive) {
          ctx.shadowColor = edge.color || '#38bdf8';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 3;
          ctx.strokeStyle = edge.color || '#38bdf8';
        } else {
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
        }

        ctx.beginPath();
        ctx.moveTo(pts.p0.x, pts.p0.y);
        ctx.bezierCurveTo(pts.p1.x, pts.p1.y, pts.p2.x, pts.p2.y, pts.p3.x, pts.p3.y);
        ctx.stroke();
        ctx.restore();

        // Edge label background and text
        if (edge.label) {
          const mid = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, 0.5);
          ctx.save();
          ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textMetrics = ctx.measureText(edge.label);
          const bw = textMetrics.width + 12;
          const bh = 18;

          ctx.fillStyle = isPathActive ? 'rgba(15, 23, 42, 0.95)' : 'rgba(10, 15, 26, 0.85)';
          ctx.strokeStyle = isPathActive ? (edge.color || '#38bdf8') : 'rgba(51, 65, 85, 0.8)';
          ctx.lineWidth = 1;
          drawRoundedRect(ctx, mid.x - bw / 2, mid.y - bh / 2, bw, bh, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isPathActive ? (edge.color || '#38bdf8') : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(edge.label, mid.x, mid.y);
          ctx.restore();
        }
      });

      // 2. Draw Animated Edge Particles
      particlesRef.current.forEach((particle) => {
        const edge = edges.find((e) => e.id === particle.edgeId);
        if (!edge) return;
        const pts = getEdgePoints(edge, nodes);
        if (!pts) return;

        const isFromActive = activeNodeId === edge.from;
        const isToActive = activeNodeId === edge.to;
        const speedBoost = isFromActive || isToActive ? 2.2 : 1;

        particle.t = (particle.t + particle.speed * speedBoost) % 1;
        const pt = getBezierPoint(pts.p0, pts.p1, pts.p2, pts.p3, particle.t);

        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = edge.color || '#38bdf8';
        ctx.shadowColor = edge.color || '#38bdf8';
        ctx.shadowBlur = isFromActive || isToActive ? 14 : 6;
        ctx.fill();
        ctx.restore();
      });

      // 3. Draw Nodes
      nodes.forEach((node) => {
        const isActive = activeNodeId === node.id;
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNodeId === node.id;

        // Theme colors per node type
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

        // Pulsing halo for active node
        if (isActive) {
          const pulse = (Math.sin(time / 200) + 1) / 2;
          ctx.save();
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 24 + pulse * 14;
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 2.5;
          drawRoundedRect(
            ctx,
            node.x - 3 - pulse * 2,
            node.y - 3 - pulse * 2,
            node.w + 6 + pulse * 4,
            node.h + 6 + pulse * 4,
            12,
          );
          ctx.stroke();
          ctx.restore();
        }

        // Selected indicator border
        if (isSelected) {
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 10;
        }

        // Node Body Background
        const grad = ctx.createLinearGradient(node.x, node.y, node.x + node.w, node.y + node.h);
        if (isActive || isSelected) {
          grad.addColorStop(0, bgGradient[0]);
          grad.addColorStop(1, bgGradient[1]);
        } else {
          grad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
          grad.addColorStop(1, 'rgba(30, 41, 59, 0.85)');
        }

        ctx.fillStyle = grad;
        ctx.strokeStyle = isActive
          ? accentColor
          : isSelected
          ? '#94a3b8'
          : isHovered
          ? accentColor
          : 'rgba(51, 65, 85, 0.85)';
        ctx.lineWidth = isActive || isSelected ? 2 : 1;

        drawRoundedRect(ctx, node.x, node.y, node.w, node.h, 10);
        ctx.fill();
        ctx.stroke();

        // Left Accent Bar / Dot
        ctx.save();
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(node.x + 16, node.y + node.h / 2, 4.5, 0, Math.PI * 2);
        ctx.fill();

        if (isActive) {
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 10;
          ctx.arc(node.x + 16, node.y + node.h / 2, 6.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        // Node Title
        ctx.save();
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(node.name, node.x + 28, node.y + 11);

        // Node Subtitle
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = isActive ? '#e2e8f0' : '#94a3b8';
        ctx.fillText(node.sub, node.x + 28, node.y + 28);
        ctx.restore();

        // Active State Badge
        if (isActive) {
          ctx.save();
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = accentColor;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('ACTIVE', node.x + node.w - 10, node.y + 11);
          ctx.restore();
        }

        ctx.restore();
      });

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [dimensions, activeNodeId, selectedNodeId, hoveredNodeId, getLayoutNodes, getEdgePoints]);

  // Handle Mouse Events on Canvas
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodes = getLayoutNodes();
    const found = nodes.find(
      (n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h,
    );

    if (found) {
      setHoveredNodeId(found.id);
      canvas.style.cursor = 'pointer';
    } else {
      setHoveredNodeId(null);
      canvas.style.cursor = 'default';
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodes = getLayoutNodes();
    const found = nodes.find(
      (n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h,
    );

    if (found) {
      setSelectedNodeId(found.id);
      if (onSelectNode) onSelectNode(found.id);
    }
  };

  const selectedNode = getLayoutNodes().find((n) => n.id === selectedNodeId) || getLayoutNodes()[1];

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-[#050811] relative select-none overflow-hidden ${className}`}
    >
      {/* Top Floating Status Indicator */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-slate-900/80 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
        <GitFork className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-semibold text-slate-200">LangGraph State Machine</span>
        {activeNodeId ? (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 font-mono text-emerald-300 border-emerald-500/50 bg-emerald-950/40 animate-pulse flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>실행 중: {activeNodeId}</span>
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-slate-400 border-slate-700 bg-slate-800/40">
            대기 (Idle)
          </Badge>
        )}
      </div>

      {/* Canvas Element */}
      <div className="flex-1 w-full h-full relative overflow-auto flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          className="block"
        />
      </div>

      {/* Selected Node Details Drawer */}
      {!compact && selectedNode && (
        <div className="p-3 border-t border-slate-800/90 bg-slate-950/90 shrink-0 text-xs">
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
