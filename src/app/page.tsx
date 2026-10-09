'use client';
import { useEffect, useRef, useState } from 'react';
import { useMarketStore } from '../store/useMarketStore';
import Chart from '../components/Chart';
import OrderBook from '../components/OrderBook';
import Trades from '../components/Trades';
import DebugPanel from '../components/DebugPanel';

export default function Home() {
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<NodeJS.Timeout | null>(null);
  
  const { 
    isConnected,
    isStale,
    setConnectionStatus, 
    setStale, 
    setTier, 
    setNetworkStats,
    setOrderBookSnapshot,
    applyOrderBookDelta,
    addTrade,
    updateActiveCandles,
    trades
  } = useMarketStore();
  
  const [intervalSelection, setIntervalSelection] = useState<'1s' | '5s'>('1s');
  const [initialHistoryLoaded, setInitialHistoryLoaded] = useState(false);
  const [chartHistory, setChartHistory] = useState<any[]>([]);

  // Latency tracking
  const pings = useRef<{ [key: number]: number }>({});
  const rttHistory = useRef<number[]>([]);
  
  // Update rate tracking
  const updateCount = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      useMarketStore.getState().setUpdateRate(updateCount.current);
      updateCount.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrderBookSnapshot = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/orderbook');
      const data = await res.json();
      setOrderBookSnapshot(data);
    } catch (e) {
      console.error("Failed to fetch order book snapshot", e);
    }
  };

  const fetchHistory = async (interval: string) => {
    try {
      const res = await fetch(`http://localhost:4000/api/history?interval=${interval}`);
      const data = await res.json();
      
      let formatted = data.map((d: any) => ({
        time: Math.floor(d.timestamp / 1000),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      
      // Ensure strictly ascending order and remove duplicates
      formatted.sort((a: any, b: any) => a.time - b.time);
      formatted = formatted.filter((item: any, index: number, arr: any[]) => {
        return index === 0 || item.time > arr[index - 1].time;
      });
      
      setChartHistory(formatted);
      setInitialHistoryLoaded(true);
    } catch (e) {
      console.error("Failed to fetch history", e);
    }
  };

  const connectWs = () => {
    if (wsRef.current) wsRef.current.close();
    
    const ws = new WebSocket('ws://localhost:4000');
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus(true);
      setStale(false);
      fetchOrderBookSnapshot();
      
      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && !document.hidden) {
          const ts = Date.now();
          pings.current[ts] = ts;
          ws.send(JSON.stringify({ type: 'ping', timestamp: ts }));
        }
      }, 2000);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'pong') {
        const now = Date.now();
        const sentAt = pings.current[msg.timestamp];
        if (sentAt) {
          const rtt = now - sentAt;
          delete pings.current[msg.timestamp];
          
          rttHistory.current.push(rtt);
          if (rttHistory.current.length > 5) rttHistory.current.shift();
          
          let jitter = 0;
          if (rttHistory.current.length > 1) {
            let sumDiff = 0;
            for (let i = 1; i < rttHistory.current.length; i++) {
              sumDiff += Math.abs(rttHistory.current[i] - rttHistory.current[i-1]);
            }
            jitter = Math.round(sumDiff / (rttHistory.current.length - 1));
          }
          
          const avgRtt = Math.round(rttHistory.current.reduce((a,b)=>a+b,0)/rttHistory.current.length);
          setNetworkStats(avgRtt, jitter);
          
          ws.send(JSON.stringify({ type: 'report', rtt: avgRtt, jitter }));
        }
      } else if (msg.type === 'tierUpdate') {
        setTier(msg.tier);
      } else if (msg.type === 'orderBook') {
        const currentStoreId = useMarketStore.getState().orderBook.lastUpdateId;
        if (msg.data.updateId > currentStoreId + 1) {
           fetchOrderBookSnapshot();
        } else if (msg.data.updateId === currentStoreId + 1) {
           applyOrderBookDelta(msg.data);
        }
      } else if (msg.type === 'trade') {
        addTrade(msg.data);
      } else if (msg.type === 'chartUpdate') {
        updateCount.current++;
        updateActiveCandles(msg.data.candle1s, msg.data.candle5s);
      }
    };

    ws.onclose = () => {
      setConnectionStatus(false);
      setStale(true);
      if (pingInterval.current) clearInterval(pingInterval.current);
      setTimeout(connectWs, 3000);
    };
  };

  useEffect(() => {
    fetchHistory(intervalSelection);
  }, [intervalSelection]);

  useEffect(() => {
    connectWs();
    
    const handleVisibility = () => {
      if (document.hidden) {
        setStale(true);
      } else {
        setStale(false);
        fetchOrderBookSnapshot();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (wsRef.current) wsRef.current.close();
      if (pingInterval.current) clearInterval(pingInterval.current);
    };
  }, []);

  const latestPrice = trades.length > 0 ? trades[0].price : null;
  const previousPrice = trades.length > 1 ? trades[1].price : latestPrice;
  const priceColor = latestPrice && previousPrice && latestPrice > previousPrice ? 'text-[#26a69a]' : 
                     latestPrice && previousPrice && latestPrice < previousPrice ? 'text-[#ef5350]' : 'text-gray-100';

  return (
    <main className="min-h-screen bg-[#0d0e12] text-gray-300 font-sans flex flex-col select-none">
      <header className="flex flex-col sm:flex-row justify-between items-center px-4 py-3 bg-[#131722] border-b border-[#2a2e39]">
        <div className="flex items-center gap-6 w-full sm:w-auto">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-gray-100 m-0 leading-none">BTC/USD</h1>
            <span className="text-xs text-gray-500 uppercase tracking-wider mt-1">Bitcoin / US Dollar</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-mono tracking-tight ${priceColor}`}>
              {latestPrice ? `$${latestPrice.toFixed(2)}` : '---'}
            </span>
            {latestPrice && previousPrice && latestPrice !== previousPrice && (
              <span className={`text-sm font-semibold ${priceColor}`}>
                {latestPrice > previousPrice ? '+' : ''}{(((latestPrice - previousPrice) / previousPrice) * 100).toFixed(4)}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 sm:mt-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className={`w-2 h-2 rounded-full ${!isConnected ? 'bg-red-500' : isStale ? 'bg-yellow-500' : 'bg-[#26a69a]'}`}></div>
            <span className={!isConnected ? 'text-[#ef5350]' : isStale ? 'text-yellow-500' : 'text-[#26a69a]'}>
              {!isConnected ? 'DISCONNECTED' : isStale ? 'STALE' : 'CONNECTED'}
            </span>
          </div>
        </div>
      </header>

      {!isConnected && (
        <div className="w-full bg-[#ef5350]/20 text-[#ef5350] text-center py-1 text-xs border-b border-[#ef5350]/30 font-semibold tracking-wide">
          ATTEMPTING TO RECONNECT...
        </div>
      )}
      {isConnected && isStale && (
        <div className="w-full bg-yellow-900/40 text-yellow-500 text-center py-1 text-xs border-b border-yellow-800/50 font-semibold tracking-wide">
          DATA IS STALE. LAST UPDATE DELAYED.
        </div>
      )}

      <div className="flex-1 p-2">
        <div className="grid grid-cols-1 lg:grid-cols-4 lg:grid-rows-3 gap-2 h-full lg:h-[calc(100vh-80px)]">
          
          <div className="lg:col-span-3 lg:row-span-2 bg-[#131722] rounded border border-[#2a2e39] flex flex-col relative min-h-[400px]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#1a1e29]">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Chart</div>
              <div className="flex gap-1 bg-[#0d0e12] p-0.5 rounded border border-[#2a2e39]">
                <button 
                  onClick={() => setIntervalSelection('1s')}
                  className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${intervalSelection === '1s' ? 'bg-[#2962ff] text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  1s
                </button>
                <button 
                  onClick={() => setIntervalSelection('5s')}
                  className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${intervalSelection === '5s' ? 'bg-[#2962ff] text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  5s
                </button>
              </div>
            </div>
            <div className="flex-1 w-full relative">
              {initialHistoryLoaded ? (
                <Chart interval={intervalSelection} history={chartHistory} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                  Loading chart data...
                </div>
              )}
            </div>
          </div>
          
          <div className="lg:col-span-1 lg:row-span-3 bg-[#131722] rounded border border-[#2a2e39] flex flex-col min-h-[500px]">
            <div className="px-3 py-2 border-b border-[#2a2e39] bg-[#1a1e29] text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Order Book
            </div>
            <div className="flex-1 overflow-hidden">
              <OrderBook />
            </div>
          </div>

          <div className="lg:col-span-2 lg:row-span-1 bg-[#131722] rounded border border-[#2a2e39] flex flex-col min-h-[200px]">
            <div className="px-3 py-2 border-b border-[#2a2e39] bg-[#1a1e29] text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Recent Trades
            </div>
            <div className="flex-1 overflow-hidden">
              <Trades />
            </div>
          </div>

          <div className="lg:col-span-1 lg:row-span-1 bg-[#131722] rounded border border-[#2a2e39] flex flex-col min-h-[200px]">
            <div className="px-3 py-2 border-b border-[#2a2e39] bg-[#1a1e29] text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center">
              <span>System Status</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DebugPanel ws={wsRef.current} />
            </div>
          </div>
          
        </div>
      </div>
    </main>
  );
}
