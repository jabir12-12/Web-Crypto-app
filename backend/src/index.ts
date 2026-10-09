import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { MarketEngine } from './marketEngine.js';

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
    lastReportAt: number;
    tierChangeVotes: number;
}

const clients = new Set<ClientState>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const TIER_THRESHOLDS = {
    DOWNGRADE_DEGRADED: 120,
    DOWNGRADE_MINIMAL: 320,
    UPGRADE_FULL: 80,
    UPGRADE_DEGRADED: 240,
};

const THROTTLE_RATES = {
    [Tier.FULL]: 0,
    [Tier.DEGRADED]: 500, 
    [Tier.MINIMAL]: 2000, 
};

const REPORT_TIMEOUT_MS = 10000;
const REQUIRED_TIER_VOTES = 3;

function tierName(tier: Tier): string {
    return tier === Tier.FULL ? 'FULL' : tier === Tier.DEGRADED ? 'DEGRADED' : 'MINIMAL';
}

function tierRate(tier: Tier): number {
    return tier === Tier.FULL ? 20 : tier === Tier.DEGRADED ? 2 : 0.5;
}

wss.on('connection', (ws) => {
    const state: ClientState = {
        ws,
        tier: Tier.FULL,
        forceTier: null,
        rttHistory: [],
        lastChartEmitTime: 0,
        lastReportAt: Date.now(),
        tierChangeVotes: 0
    };
    clients.add(state);
    sendTierUpdate(state);

    ws.on('message', (msg) => {
        try {
            const data: unknown = JSON.parse(msg.toString());
            if (!isRecord(data) || typeof data.type !== 'string') {
                console.error('Ignoring invalid WebSocket message');
                return;
            }
            if (data.type === 'ping' && isFiniteNumber(data.timestamp)) {
                ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp, serverTime: Date.now() }));
            } else if (data.type === 'report' && isFiniteNumber(data.rtt)) {
                updateTier(state, data.rtt);
            } else if (data.type === 'forceTier') {
                if (data.tier === 'FULL') state.forceTier = Tier.FULL;
                else if (data.tier === 'DEGRADED') state.forceTier = Tier.DEGRADED;
                else if (data.tier === 'MINIMAL') state.forceTier = Tier.MINIMAL;
                else state.forceTier = null;
                updateTier(state, state.rttHistory[state.rttHistory.length - 1] || 0);
            } else {
                console.error(`Ignoring unsupported WebSocket message type: ${data.type}`);
            }
        } catch (error: unknown) {
            console.error('Ignoring malformed WebSocket message', error);
        }
    });

    ws.on('close', () => {
        clients.delete(state);
    });
});

function updateTier(state: ClientState, rtt: number) {
    state.lastReportAt = Date.now();
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

    const avgRtt = state.rttHistory.length > 0
        ? state.rttHistory.reduce((a, b) => a + b, 0) / state.rttHistory.length
        : 0;
    let desiredTier = state.tier;
    if (state.tier === Tier.FULL && avgRtt > TIER_THRESHOLDS.DOWNGRADE_MINIMAL) desiredTier = Tier.MINIMAL;
    else if (state.tier !== Tier.MINIMAL && avgRtt > TIER_THRESHOLDS.DOWNGRADE_DEGRADED) desiredTier = Tier.DEGRADED;
    else if (state.tier === Tier.MINIMAL && avgRtt < TIER_THRESHOLDS.UPGRADE_DEGRADED) desiredTier = Tier.DEGRADED;
    else if (state.tier === Tier.DEGRADED && avgRtt < TIER_THRESHOLDS.UPGRADE_FULL) desiredTier = Tier.FULL;

    if (desiredTier === state.tier) {
        state.tierChangeVotes = 0;
    } else {
        state.tierChangeVotes++;
        if (state.tierChangeVotes >= REQUIRED_TIER_VOTES) {
            state.tier = desiredTier;
            state.tierChangeVotes = 0;
            sendTierUpdate(state);
        }
    }
}

function sendTierUpdate(state: ClientState) {
    state.ws.send(JSON.stringify({
        type: 'tierUpdate',
        tier: tierName(state.tier),
        throttleMs: THROTTLE_RATES[state.tier],
        updatesPerSecond: tierRate(state.tier)
    }));
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
        if (state.forceTier === null && now - state.lastReportAt > REPORT_TIMEOUT_MS && state.tier !== Tier.MINIMAL) {
            state.tier = Tier.MINIMAL;
            state.tierChangeVotes = 0;
            sendTierUpdate(state);
        }
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
