import { create } from 'zustand';

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  lastUpdateId: number;
}

export interface OrderBookDelta {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  updateId: number;
}

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const normalizeOrderBook = (snapshot: OrderBook): OrderBook => ({
  bids: [...snapshot.bids].sort((a, b) => b.price - a.price).slice(0, 20),
  asks: [...snapshot.asks].sort((a, b) => a.price - b.price).slice(0, 20),
  lastUpdateId: snapshot.lastUpdateId,
});

export interface Trade {
  id: number;
  timestamp: number;
  price: number;
  quantity: number;
}

interface MarketState {
  // Connection state
  isConnected: boolean;
  isStale: boolean;
  tier: string;
  rtt: number;
  jitter: number;
  updateRate: number;

  // Market Data
  orderBook: OrderBook;
  lastOrderBookUpdateAt: number | null;
  trades: Trade[];
  activeCandle1s: OHLCV | null;
  activeCandle5s: OHLCV | null;

  // Actions
  setConnectionStatus: (status: boolean) => void;
  setStale: (stale: boolean) => void;
  setTier: (tier: string) => void;
  setNetworkStats: (rtt: number, jitter: number) => void;
  setUpdateRate: (rate: number) => void;
  setOrderBookSnapshot: (snapshot: OrderBook) => void;
  applyOrderBookDelta: (delta: OrderBookDelta) => boolean;
  addTrade: (trade: Trade) => void;
  updateActiveCandles: (candle1s: OHLCV | null, candle5s: OHLCV | null) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  isConnected: false,
  isStale: true,
  tier: 'FULL',
  rtt: 0,
  jitter: 0,
  updateRate: 0,

  orderBook: { bids: [], asks: [], lastUpdateId: 0 },
  lastOrderBookUpdateAt: null,
  trades: [],
  activeCandle1s: null,
  activeCandle5s: null,

  setConnectionStatus: (status) => set({ isConnected: status }),
  setStale: (stale) => set({ isStale: stale }),
  setTier: (tier) => set({ tier }),
  setNetworkStats: (rtt, jitter) => set({ rtt, jitter }),
  setUpdateRate: (rate) => set({ updateRate: rate }),

  setOrderBookSnapshot: (snapshot) => set((state) => (
    snapshot.lastUpdateId >= state.orderBook.lastUpdateId
      ? { orderBook: normalizeOrderBook(snapshot), lastOrderBookUpdateAt: Date.now() }
      : state
  )),
  applyOrderBookDelta: (delta) => {
    let applied = false;
    set((state) => {
      if (delta.updateId !== state.orderBook.lastUpdateId + 1) {
        return state;
      }

      const newBids = [...state.orderBook.bids];
      const newAsks = [...state.orderBook.asks];

      // Process delta bids
      delta.bids.forEach((b: OrderBookEntry) => {
        const idx = newBids.findIndex(x => x.price === b.price);
        if (b.quantity === 0) {
          if (idx !== -1) newBids.splice(idx, 1);
        } else {
          if (idx !== -1) newBids[idx] = b;
          else newBids.push(b);
        }
      });

      // Process delta asks
      delta.asks.forEach((a: OrderBookEntry) => {
        const idx = newAsks.findIndex(x => x.price === a.price);
        if (a.quantity === 0) {
          if (idx !== -1) newAsks.splice(idx, 1);
        } else {
          if (idx !== -1) newAsks[idx] = a;
          else newAsks.push(a);
        }
      });

      // Sort properly
      newBids.sort((a, b) => b.price - a.price);
      newAsks.sort((a, b) => a.price - b.price);

      applied = true;
      return {
        orderBook: {
          bids: newBids.slice(0, 20),
          asks: newAsks.slice(0, 20),
          lastUpdateId: delta.updateId
        },
        lastOrderBookUpdateAt: Date.now()
      };
    });
    return applied;
  },

  addTrade: (trade) => set((state) => ({
    trades: [trade, ...state.trades].slice(0, 50)
  })),

  updateActiveCandles: (candle1s, candle5s) => set({
    activeCandle1s: candle1s || null,
    activeCandle5s: candle5s || null,
  })
}));
