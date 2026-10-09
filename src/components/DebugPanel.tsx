'use client';
import { useMarketStore } from '../store/useMarketStore';
import { useState } from 'react';

export default function DebugPanel({ ws }: { ws: WebSocket | null }) {
  const { isConnected, rtt, jitter, tier, updateRate, orderBook } = useMarketStore();
  const [forcedTier, setForcedTier] = useState<string>('AUTO');
  const [showDemoControls, setShowDemoControls] = useState(false);

  const forceTier = (t: string) => {
    setForcedTier(t);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'forceTier', tier: t === 'AUTO' ? null : t }));
    }
  };

  const getTierColor = (t: string) => {
    switch (t) {
      case 'FULL': return 'text-[#26a69a]';
      case 'DEGRADED': return 'text-yellow-500';
      case 'MINIMAL': return 'text-[#ef5350]';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] p-3 text-xs">
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px] uppercase">Latency</span>
          <span className="font-mono text-gray-200">{rtt} ms</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px] uppercase">Jitter</span>
          <span className="font-mono text-gray-200">{jitter} ms</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px] uppercase">Tier</span>
          <span className={`font-bold ${getTierColor(tier)}`}>{tier}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px] uppercase">Updates/sec</span>
          <span className="font-mono text-gray-200">{updateRate}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px] uppercase">Sequence</span>
          <span className="font-mono text-gray-400">{orderBook.lastUpdateId || '---'}</span>
        </div>
      </div>

      <div className="border-t border-[#2a2e39] pt-2 mt-auto">
        <button 
          onClick={() => setShowDemoControls(!showDemoControls)}
          className="w-full text-left text-[11px] text-gray-400 hover:text-gray-200 flex justify-between items-center outline-none"
        >
          <span>DEMO CONTROLS</span>
          <span>{showDemoControls ? '▼' : '▶'}</span>
        </button>
        
        {showDemoControls && (
          <div className="mt-2 flex flex-col gap-2 bg-[#1a1e29] p-2 rounded border border-[#2a2e39]">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px] uppercase">Force Tier</span>
              <select 
                value={forcedTier}
                onChange={(e) => forceTier(e.target.value)}
                className="bg-[#0d0e12] text-gray-200 text-xs p-1 rounded border border-[#2a2e39] outline-none w-24"
              >
                <option value="AUTO">Auto</option>
                <option value="FULL">Full</option>
                <option value="DEGRADED">Degraded</option>
                <option value="MINIMAL">Minimal</option>
              </select>
            </div>
            {/* Additional demo controls can go here */}
          </div>
        )}
      </div>

    </div>
  );
}
