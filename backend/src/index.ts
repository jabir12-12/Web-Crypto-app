import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { MarketEngine } from './marketEngine';

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const engine = new MarketEngine();

// REST API
app.get('/api/orderbook', (req, res) => {
    res.json(engine.orderBook.getSnapshot());
});

app.get('/api/history', (req, res) => {
    const interval = req.query.interval as string;
    if (interval === '1s') res.json(engine.history1s);
    else if (interval === '5s') res.json(engine.history5s);
    else res.status(400).json({ error: 'Invalid interval' });
});

enum Tier { FULL, DEGRADED, MINIMAL }

interface ClientState {
    ws: WebSocket;
    tier: Tier;
    forceTier: Tier | null;
    rttHistory: number[];
    lastChartEmitTime: number;
}

const clients = new Set<ClientState>();

const TIER_THRESHOLDS = {
    DEGRADED: 100, 
    MINIMAL: 300,  
};

const THROTTLE_RATES = {
    [Tier.FULL]: 0,
    [Tier.DEGRADED]: 500, 
    [Tier.MINIMAL]: 2000, 
};

wss.on('connection', (ws) => {
    const state: ClientState = {
        ws,
        tier: Tier.FULL,
        forceTier: null,
        rttHistory: [],
        lastChartEmitTime: 0
    };
    clients.add(state);

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp, serverTime: Date.now() }));
            } else if (data.type === 'report') {
                updateTier(state, data.rtt);
            } else if (data.type === 'forceTier') {
                if (data.tier === 'FULL') state.forceTier = Tier.FULL;
                else if (data.tier === 'DEGRADED') state.forceTier = Tier.DEGRADED;
                else if (data.tier === 'MINIMAL') state.forceTier = Tier.MINIMAL;
                else state.forceTier = null;
                updateTier(state, state.rttHistory[state.rttHistory.length - 1] || 0);
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        clients.delete(state);
    });
});

function updateTier(state: ClientState, rtt: number) {
    if (rtt != null) {
        state.rttHistory.push(rtt);
        if (state.rttHistory.length > 5) state.rttHistory.shift();
    }
    
    if (state.forceTier !== null) {
        if (state.tier !== state.forceTier) {
            state.tier = state.forceTier;
            sendTierUpdate(state);
        }
        return;
    }

    const avgRtt = state.rttHistory.reduce((a, b) => a + b, 0) / state.rttHistory.length;
    
    let newTier = Tier.FULL;
    if (avgRtt > TIER_THRESHOLDS.MINIMAL) {
        newTier = Tier.MINIMAL;
    } else if (avgRtt > TIER_THRESHOLDS.DEGRADED) {
        newTier = Tier.DEGRADED;
    }

    if (newTier !== state.tier) {
        state.tier = newTier;
        sendTierUpdate(state);
    }
}

function sendTierUpdate(state: ClientState) {
    const tierName = state.tier === Tier.FULL ? 'FULL' : state.tier === Tier.DEGRADED ? 'DEGRADED' : 'MINIMAL';
    state.ws.send(JSON.stringify({ type: 'tierUpdate', tier: tierName, throttleMs: THROTTLE_RATES[state.tier] }));
}

// OrderBook Deltas (Always delivered to maintain sequence)
engine.onOrderBookDelta = (snapshot) => {
    const msg = JSON.stringify({ type: 'orderBook', data: snapshot });
    clients.forEach(state => {
        if (state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(msg);
        }
    });
};

// Trades (Always delivered, or throttled? Let's deliver always but chart updates are throttled)
engine.onTrade = (trade) => {
    const msg = JSON.stringify({ type: 'trade', data: trade });
    clients.forEach(state => {
        if (state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(msg);
        }
    });
};

// Chart Updates (Throttled based on tier)
setInterval(() => {
    const now = Date.now();
    clients.forEach(state => {
        const activeTier = state.forceTier !== null ? state.forceTier : state.tier;
        const throttleMs = THROTTLE_RATES[activeTier];
        
        if (now - state.lastChartEmitTime >= throttleMs) {
            if (state.ws.readyState === WebSocket.OPEN) {
                const msg = JSON.stringify({
                    type: 'chartUpdate',
                    data: {
                        candle1s: engine.activeCandle1s,
                        candle5s: engine.activeCandle5s
                    }
                });
                state.ws.send(msg);
                state.lastChartEmitTime = now;
            }
        }
    });
}, 50);

server.listen(4000, () => {
    console.log('Backend listening on port 4000');
});
