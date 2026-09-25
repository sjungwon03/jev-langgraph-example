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
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>가상 브릿지 & SDN 네트워크 인터페이스</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Proxmox VE 호스트 및 VM/LXC 간 통신을 위한 Linux Bridge(vmbr) 및 물리 NIC 바인딩 현황
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">총 {networks.length}개 인터페이스</span>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-mono text-[11px]">
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
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50 text-slate-700 dark:text-slate-300">
            {networks.map((net, idx) => {
              const isActive = net.active === 1;
              return (
                <tr key={`${net.node}-${net.iface}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-medium text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-slate-400" />
                    <span>{net.iface}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">{net.node}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] uppercase text-slate-700 dark:text-slate-300">
                      {net.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">{net.cidr || '-'}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400">{net.gateway || '-'}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                    {net.ports ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                        {net.ports}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-medium ${
                        isActive
                          ? 'bg-emerald-500/10 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 dark:border-emerald-800/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-400 dark:bg-slate-500'
                        }`}
                      />
                      {isActive ? 'ACTIVE' : 'DOWN'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate text-[11px]">
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
