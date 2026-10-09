import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { MarketEngine } from './marketEngine.js';
import { Tier, TierController, THROTTLE_RATES, tierName, tierRate } from './tierController.js';

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

interface ClientState {
    ws: WebSocket;
    tierController: TierController;
    lastChartEmitTime: number;
}

const clients = new Set<ClientState>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

wss.on('connection', (ws) => {
    const state = {
        ws,
        tierController: new TierController(Date.now(), () => sendTierUpdate(state)),
        lastChartEmitTime: 0,
    } as ClientState;
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
                state.tierController.report(data.rtt);
            } else if (data.type === 'forceTier') {
                const forcedTier = data.tier === 'FULL' ? Tier.FULL
                    : data.tier === 'DEGRADED' ? Tier.DEGRADED
                        : data.tier === 'MINIMAL' ? Tier.MINIMAL : null;
                state.tierController.force(forcedTier);
                if (forcedTier === null) state.tierController.report(0);
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

function sendTierUpdate(state: ClientState) {
    const tier = state.tierController.tier;
    state.ws.send(JSON.stringify({
        type: 'tierUpdate',
        tier: tierName(tier),
        throttleMs: THROTTLE_RATES[tier],
        updatesPerSecond: tierRate(tier)
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
        state.tierController.checkReportTimeout(now);
        const activeTier = state.tierController.forceTier ?? state.tierController.tier;
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

const port = Number(process.env.PORT ?? 4000);

server.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
});
