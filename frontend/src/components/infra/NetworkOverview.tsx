'use client';

import { Network, Server, ArrowUpRight, CheckCircle2, Shield } from 'lucide-react';
import { ProxmoxNetwork } from '@/lib/api';

interface NetworkOverviewProps {
  networks: ProxmoxNetwork[];
}

export function NetworkOverview({ networks }: NetworkOverviewProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <span>가상 브릿지 & SDN 네트워크 인터페이스</span>
          </h3>
          <p className="text-xs text-slate-400">
            Proxmox VE 호스트 및 VM/LXC 간 통신을 위한 Linux Bridge(vmbr) 및 물리 NIC 바인딩 현황
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400">총 {networks.length}개 인터페이스</span>
      </div>

      <div className="glow-card rounded-xl overflow-hidden border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 uppercase font-mono text-[11px]">
            <tr>
              <th className="py-3 px-4">인터페이스 (Iface)</th>
              <th className="py-3 px-4">소속 노드</th>
              <th className="py-3 px-4">유형</th>
              <th className="py-3 px-4">IPv4 CIDR / 서브넷</th>
              <th className="py-3 px-4">게이트웨이</th>
              <th className="py-3 px-4">물리 NIC 포트</th>
              <th className="py-3 px-4">상태</th>
              <th className="py-3 px-4">설명 (Comment)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-slate-300">
            {networks.map((net, idx) => {
              const isActive = net.active === 1;
              return (
                <tr key={`${net.node}-${net.iface}-${idx}`} className="hover:bg-slate-900/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-medium text-cyan-400 flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-cyan-400/80" />
                    <span>{net.iface}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">{net.node}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] uppercase">
                      {net.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-emerald-300">{net.cidr || '-'}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{net.gateway || '-'}</td>
                  <td className="py-3.5 px-4 font-mono text-amber-300">
                    {net.ports ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px]">
                        {net.ports}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-medium ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      {isActive ? 'ACTIVE' : 'DOWN'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate text-[11px]">
                    {net.comment || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
