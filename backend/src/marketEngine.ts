import { Trade, OHLCV } from './types';
import { OrderBookManager } from './orderBook';

export class MarketEngine {
    private currentPrice: number = 50000.00;
    private lastTradeId: number = 0;
    
    public orderBook: OrderBookManager;
    
    public history1s: OHLCV[] = [];
    public history5s: OHLCV[] = [];
    
    public activeCandle1s: OHLCV | null = null;
    public activeCandle5s: OHLCV | null = null;
    
    public onTrade?: (trade: Trade) => void;
    public onOrderBookDelta?: (delta: any) => void;
    public onCandleUpdate?: (interval: string, candle: OHLCV) => void;

    constructor() {
        this.orderBook = new OrderBookManager();
        this.orderBook.updateBookAroundPrice(this.currentPrice);
        
        this.generateHistory(5 * 60 * 1000);
        
        setInterval(() => this.tick(), 300);
    }

    private generateHistory(timeRangeMs: number) {
        const now = Date.now();
        const startTime = now - timeRangeMs;
        let tempPrice = this.currentPrice;
        
        let current1sTs = Math.floor(startTime / 1000) * 1000;
        while (current1sTs < now) {
            const candle = this.createRandomCandle(current1sTs, tempPrice);
            tempPrice = candle.close;
            this.history1s.push(candle);
            
            const current5sTs = Math.floor(current1sTs / 5000) * 5000;
            const existing5s = this.history5s.find(c => c.timestamp === current5sTs);
            if (existing5s) {
                existing5s.high = Math.max(existing5s.high, candle.high);
                existing5s.low = Math.min(existing5s.low, candle.low);
                existing5s.close = candle.close;
                existing5s.volume += candle.volume;
            } else {
                this.history5s.push({ ...candle, timestamp: current5sTs });
            }
            
            current1sTs += 1000;
        }
        
        this.currentPrice = tempPrice;
        
        if (this.history1s.length > 500) this.history1s = this.history1s.slice(-500);
        if (this.history5s.length > 500) this.history5s = this.history5s.slice(-500);
    }

    private createRandomCandle(ts: number, open: number): OHLCV {
        const movement = (Math.random() - 0.5) * 20;
        const close = open + movement;
        const high = Math.max(open, close) + Math.random() * 5;
        const low = Math.min(open, close) - Math.random() * 5;
        const volume = Math.random() * 10 + 0.1;
        
        return {
            timestamp: ts,
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: parseFloat(volume.toFixed(4))
        };
    }

    private tick() {
        const priceChange = (Math.random() - 0.5) * 10;
        this.currentPrice = parseFloat((this.currentPrice + priceChange).toFixed(2));
        this.lastTradeId++;
        const trade: Trade = {
            id: this.lastTradeId,
            timestamp: Date.now(),
            price: this.currentPrice,
            quantity: parseFloat((Math.random() * 0.5 + 0.01).toFixed(4))
        };

        if (this.onTrade) this.onTrade(trade);

        if (Math.random() > 0.5) {
            const delta = this.orderBook.updateBookAroundPrice(this.currentPrice);
            if (this.onOrderBookDelta) {
                this.onOrderBookDelta(delta);
            }
        }

        this.updateActiveCandles(trade);
    }

    private updateActiveCandles(trade: Trade) {
        const now = trade.timestamp;
        const ts1s = Math.floor(now / 1000) * 1000;
        const ts5s = Math.floor(now / 5000) * 5000;

        const updateCandle = (candle: OHLCV | null, ts: number) => {
            if (!candle || candle.timestamp !== ts) {
                return {
                    timestamp: ts,
                    open: trade.price,
                    high: trade.price,
                    low: trade.price,
                    close: trade.price,
                    volume: trade.quantity
                };
            } else {
                candle.high = Math.max(candle.high, trade.price);
                candle.low = Math.min(candle.low, trade.price);
                candle.close = trade.price;
                candle.volume += trade.quantity;
                return candle;
            }
        };

        const prev1s = this.activeCandle1s;
        this.activeCandle1s = updateCandle(this.activeCandle1s, ts1s);
        if (prev1s && prev1s.timestamp !== ts1s) {
            this.history1s.push(prev1s);
            if (this.history1s.length > 500) this.history1s.shift();
        }
        if (this.onCandleUpdate) this.onCandleUpdate('1s', this.activeCandle1s);

        const prev5s = this.activeCandle5s;
        this.activeCandle5s = updateCandle(this.activeCandle5s, ts5s);
        if (prev5s && prev5s.timestamp !== ts5s) {
            this.history5s.push(prev5s);
            if (this.history5s.length > 500) this.history5s.shift();
        }
        if (this.onCandleUpdate) this.onCandleUpdate('5s', this.activeCandle5s);
    }
}
