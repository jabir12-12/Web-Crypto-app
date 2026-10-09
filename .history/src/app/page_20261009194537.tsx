'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChartCandle, OHLCV, OrderBook as MarketOrderBook, OrderBookDelta, OrderBookEntry, Trade, useMarketStore } from '../store/useMarketStore';
import Chart from '../components/Chart';
import OrderBook from '../components/OrderBook';
import Trades from '../components/Trades';
import DebugPanel, { DeliveryTierControl } from '../components/DebugPanel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isOrderBookEntry = (value: unknown): value is OrderBookEntry =>
  isRecord(value) && isNumber(value.price) && isNumber(value.quantity);

const isOrderBook = (value: unknown): value is MarketOrderBook =>
  isRecord(value) &&
  Array.isArray(value.bids) &&
  value.bids.every(isOrderBookEntry) &&
  Array.isArray(value.asks) &&
  value.asks.every(isOrderBookEntry) &&
  isNumber(value.lastUpdateId);

const isOrderBookDelta = (value: unknown): value is OrderBookDelta =>
  isRecord(value) &&
  Array.isArray(value.bids) &&
  value.bids.every(isOrderBookEntry) &&
  Array.isArray(value.asks) &&
  value.asks.every(isOrderBookEntry) &&
  Number.isInteger(value.updateId);

const isTrade = (value: unknown): value is Trade =>
  isRecord(value) &&
  Number.isInteger(value.id) &&
  isNumber(value.timestamp) &&
  isNumber(value.price) &&
  isNumber(value.quantity);

const isOHLCV = (value: unknown): value is OHLCV =>
  isRecord(value) &&
  isNumber(value.timestamp) &&
  isNumber(value.open) &&
  isNumber(value.high) &&
  isNumber(value.low) &&
  isNumber(value.close) &&
  isNumber(value.volume);

const isHistoryCandle = (value: unknown): value is OHLCV => isOHLCV(value);

export default function Home() {
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const connectWsRef = useRef<() => void>(() => undefined);
  const fetchSnapshotRef = useRef<() => void>(() => undefined);
  const snapshotInFlightRef = useRef(false);
  const pendingDeltasRef = useRef<OrderBookDelta[]>([]);

  const {
    isConnected,
    isStale,
    rtt,
    jitter,
    updateRate,
    setConnectionStatus,
    setStale,
    setTier,
    setNetworkStats,
    setUpdateRate,
    setOrderBookSnapshot,
    applyOrderBookDelta,
    addTrade,
    updateActiveCandles,
    trades
  } = useMarketStore();

  const [intervalSelection, setIntervalSelection] = useState<'1s' | '5s'>('1s');
  const [initialHistoryLoaded, setInitialHistoryLoaded] = useState(false);
  const [chartHistory, setChartHistory] = useState<ChartCandle[]>([]);
  const [debugSocket, setDebugSocket] = useState<WebSocket | null>(null);

  // Latency tracking
  const pings = useRef<{ [key: number]: number }>({});
  const rttHistory = useRef<number[]>([]);

  const fetchOrderBookSnapshot = useCallback(async () => {
    if (snapshotInFlightRef.current) return;
    snapshotInFlightRef.current = true;
    try {
      const res = await fetch(`${API_URL}/api/orderbook`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (!isOrderBook(data)) throw new Error('Invalid order book snapshot');
      setOrderBookSnapshot(data);

      const pending = pendingDeltasRef.current
        .filter((delta) => delta.updateId > data.lastUpdateId)
        .sort((a, b) => a.updateId - b.updateId);
      pendingDeltasRef.current = [];
      let expectedId = data.lastUpdateId;
      for (const [index, delta] of pending.entries()) {
        if (delta.updateId !== expectedId + 1) {
          pendingDeltasRef.current = pending.slice(index);
          break;
        }
        applyOrderBookDelta(delta);
        expectedId = delta.updateId;
      }
      if (pendingDeltasRef.current.length > 0) {
        setTimeout(() => fetchSnapshotRef.current(), 0);
      }
    } catch (error: unknown) {
      console.error("Failed to fetch order book snapshot", error);
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, [applyOrderBookDelta, setOrderBookSnapshot]);

  const fetchHistory = useCallback(async (interval: '1s' | '5s', signal: AbortSignal) => {
    try {
      const res = await fetch(`${API_URL}/api/history?interval=${interval}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (signal.aborted) return;
      if (!Array.isArray(data) || !data.every(isHistoryCandle)) {
        throw new Error('Invalid history response');
      }

      let formatted: ChartCandle[] = data.map((d) => ({
        time: Math.floor(d.timestamp / 1000),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      // Ensure strictly ascending order and remove duplicates
      formatted.sort((a, b) => a.time - b.time);
      formatted = formatted.filter((item, index, arr) => {
        return index === 0 || item.time > arr[index - 1].time;
      });
      if (signal.aborted) return;
      setChartHistory(formatted);
      setInitialHistoryLoaded(true);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error("Failed to fetch history", error);
    }
  }, []);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setDebugSocket(ws);

    ws.onopen = () => {
      setConnectionStatus(true);
      setStale(false);
      pendingDeltasRef.current = [];
      void fetchOrderBookSnapshot();

      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && !document.hidden) {
          const ts = Date.now();
          pings.current[ts] = ts;
          ws.send(JSON.stringify({ type: 'ping', timestamp: ts }));
        }
      }, 2000);
    };

    ws.onmessage = (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.data) as unknown;
      } catch (error: unknown) {
        console.error('Ignoring malformed WebSocket message', error);
        return;
      }
      if (!isRecord(msg) || typeof msg.type !== 'string') return;

      if (msg.type === 'pong' && isNumber(msg.timestamp)) {
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
              sumDiff += Math.abs(rttHistory.current[i] - rttHistory.current[i - 1]);
            }
            jitter = Math.round(sumDiff / (rttHistory.current.length - 1));
          }

          const avgRtt = Math.round(rttHistory.current.reduce((a, b) => a + b, 0) / rttHistory.current.length);
          setNetworkStats(avgRtt, jitter);

          ws.send(JSON.stringify({ type: 'report', rtt: avgRtt, jitter }));
        }
      } else if (
        msg.type === 'tierUpdate' &&
        typeof msg.tier === 'string' &&
        isNumber(msg.updatesPerSecond)
      ) {
        setTier(msg.tier);
        setUpdateRate(msg.updatesPerSecond);
      } else if (msg.type === 'orderBook' && isOrderBookDelta(msg.data)) {
        if (snapshotInFlightRef.current) {
          pendingDeltasRef.current.push(msg.data);
          return;
        }
        const currentStoreId = useMarketStore.getState().orderBook.lastUpdateId;
        if (msg.data.updateId <= currentStoreId) {
          return;
        }
        if (msg.data.updateId > currentStoreId + 1) {
          pendingDeltasRef.current.push(msg.data);
          void fetchOrderBookSnapshot();
        } else if (msg.data.updateId === currentStoreId + 1) {
          applyOrderBookDelta(msg.data);
        }
      } else if (msg.type === 'trade' && isTrade(msg.data)) {
        addTrade(msg.data);
      } else if (
        msg.type === 'chartUpdate' &&
        isRecord(msg.data) &&
        (msg.data.candle1s === null || isOHLCV(msg.data.candle1s)) &&
        (msg.data.candle5s === null || isOHLCV(msg.data.candle5s))
      ) {
        updateActiveCandles(msg.data.candle1s, msg.data.candle5s);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws || !mountedRef.current) return;
      setConnectionStatus(false);
      setStale(true);
      if (pingInterval.current) clearInterval(pingInterval.current);
      setDebugSocket(null);
      reconnectTimeout.current = setTimeout(() => connectWsRef.current(), 3000);
    };
  }, [
    applyOrderBookDelta,
    fetchOrderBookSnapshot,
    setConnectionStatus,
    setNetworkStats,
    setUpdateRate,
    setStale,
    setTier,
    updateActiveCandles,
  ]);
  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);
  useEffect(() => {
    fetchSnapshotRef.current = fetchOrderBookSnapshot;
  }, [fetchOrderBookSnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      setInitialHistoryLoaded(false);
      return fetchHistory(intervalSelection, controller.signal);
    });
    return () => controller.abort();
  }, [fetchHistory, intervalSelection]);

  useEffect(() => {
    mountedRef.current = true;
    connectWs();

    const handleVisibility = () => {
      if (document.hidden) {
        setStale(true);
      } else {
        setStale(false);
        void fetchOrderBookSnapshot();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      mountedRef.current = false;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (wsRef.current) wsRef.current.close();
      if (pingInterval.current) clearInterval(pingInterval.current);
      pendingDeltasRef.current = [];
      snapshotInFlightRef.current = false;
    };
  }, [connectWs, fetchOrderBookSnapshot, setStale]);

  const latestPrice = trades.length > 0 ? trades[0].price : null;
  const previousPrice = trades.length > 1 ? trades[1].price : latestPrice;
  const priceDelta = latestPrice && previousPrice ? latestPrice - previousPrice : null;
  const priceColor = latestPrice && previousPrice && latestPrice > previousPrice ? 'text-[#26a69a]' :
    latestPrice && previousPrice && latestPrice < previousPrice ? 'text-[#ef5350]' : 'text-gray-100';

  return (
    <main className="flex h-screen flex-col overflow-hidden select-none bg-[#080a0f] text-gray-300">
      <header className="grid shrink-0 grid-cols-1 gap-3 border-b border-white/10 bg-[#0d1119]/90 px-4 py-3 backdrop-blur-xl sm:grid-cols-[1.25fr_0.8fr_1.95fr] sm:items-center sm:px-6">
        <div className="flex items-center gap-4">
          <div className="border-r border-white/10 pr-4">
            <h1 className="m-0 text-xl font-bold leading-none tracking-tight text-gray-100">BTC / USD</h1>
            <span className="mt-1 block text-[11px] text-gray-500">Simulated Market</span>
          </div>
          <div>
            <div className={`font-mono text-2xl font-semibold leading-none ${priceColor}`}>
              {latestPrice ? `$${latestPrice.toFixed(2)}` : '---'}
            </div>
            <div className={`mt-1 text-xs font-semibold ${priceColor}`}>
              {priceDelta !== null ? `${priceDelta >= 0 ? '▲ +' : '▼ '}$${Math.abs(priceDelta).toFixed(2)} (${previousPrice ? `${priceDelta >= 0 ? '+' : ''}${((priceDelta / previousPrice) * 100).toFixed(2)}%` : '---'})` : 'Waiting for trades'}
            </div>
          </div>
        </div>

        <div className="hidden items-center justify-center gap-3 border-l border-r border-white/10 px-3 sm:flex">
          <div className={`h-2.5 w-2.5 rounded-full ${!isConnected ? 'bg-red-400' : isStale ? 'bg-amber-400' : 'bg-emerald-400'} shadow-[0_0_10px_currentColor]`} />
          <div>
            <div className="text-xs font-semibold text-gray-200">{!isConnected ? 'Disconnected' : isStale ? 'Stale' : 'Connected'}</div>
            <div className="text-[10px] text-gray-500">Receiving live data</div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <div className="grid grid-cols-3 gap-3 text-right">
            <div><span className="eyebrow block">Latency</span><span className="font-mono text-xs text-gray-200">{rtt} ms</span></div>
            <div><span className="eyebrow block">Jitter</span><span className="font-mono text-xs text-gray-200">{jitter} ms</span></div>
            <div><span className="eyebrow block">Update Rate</span><span className="font-mono text-xs text-gray-200">{updateRate} / sec</span></div>
          </div>
          <DeliveryTierControl ws={debugSocket} />
        </div>
      </header>

      {!isConnected && (
        <div className="w-full shrink-0 bg-[#ef5350]/20 text-[#ef5350] text-center py-1 text-xs border-b border-[#ef5350]/30 font-semibold tracking-wide">
          ATTEMPTING TO RECONNECT...
        </div>
      )}
      {isConnected && isStale && (
        <div className="w-full shrink-0 bg-yellow-900/40 text-yellow-500 text-center py-1 text-xs border-b border-yellow-800/50 font-semibold tracking-wide">
          DATA IS STALE. LAST UPDATE DELAYED.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 md:overflow-hidden">
        <div className="grid min-h-275 h-full grid-cols-1 gap-3 md:min-h-0 md:grid-cols-12 md:grid-rows-[minmax(0,1.65fr)_minmax(0,1fr)]">

          <div className="panel relative flex min-h-100 flex-col overflow-hidden rounded-xl md:col-span-7 md:row-span-1 md:min-h-0">
            <div className="panel-header flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-100">Candlestick Chart</div>
              </div>
              <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
                <button
                  onClick={() => setIntervalSelection('1s')}
                  className={`rounded-md px-3 py-1.5 text-[10px] font-bold transition-colors ${intervalSelection === '1s' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  1s
                </button>
                <button
                  onClick={() => setIntervalSelection('5s')}
                  className={`rounded-md px-3 py-1.5 text-[10px] font-bold transition-colors ${intervalSelection === '5s' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  5s
                </button>
              </div>
            </div>
            <div className="flex-1 w-full relative">
              {initialHistoryLoaded && chartHistory.length > 0 ? (
                <Chart interval={intervalSelection} history={chartHistory} />
              ) : initialHistoryLoaded ? (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                  No candle history available.
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                  Loading chart data...
                </div>
              )}
            </div>
          </div>

          <div className="panel flex min-h-125 flex-col overflow-hidden rounded-xl md:col-span-5 md:row-start-1 md:min-h-0">
            <div className="panel-header flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-100">Order Book (Top 10)</div>
              </div>
              <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-300">Live</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <OrderBook />
            </div>
          </div>

          <div className="panel flex min-h-55 flex-col overflow-hidden rounded-xl md:col-span-6 md:row-start-2 md:min-h-0">
            <div className="panel-header px-4 py-3">
              <div className="text-sm font-semibold text-gray-100">Recent Trades</div>
            </div>
            <div className="flex-1 overflow-hidden">
              <Trades />
            </div>
          </div>

          <div className="panel flex min-h-55 flex-col overflow-hidden rounded-xl md:col-span-6 md:col-start-7 md:row-start-2 md:min-h-0">
            <div className="panel-header flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-100">Connection &amp; Delivery Details</div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DebugPanel />
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
