export interface Trade {
  id: number;
  timestamp: number;
  price: number;
  quantity: number;
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

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
