# Synthetic BTC/USD market dashboard

This project is a self-contained synthetic BTC/USD market-data dashboard.

## Run locally

Start the backend in one terminal:

```bash
cd backend
npm install
npm run dev
```

Start the frontend in a second terminal from the repository root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The backend exposes REST
at `http://localhost:4000/api` and WebSocket at `ws://localhost:4000`.

For a deployment, set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` to the
public backend HTTPS/WSS origins before building. They default to the local
URLs above.

## Market-data behavior

The backend generates trades every 300 ms and maintains at least 10 bid and
10 ask levels. `GET /api/orderbook` provides a snapshot with a monotonically
increasing `lastUpdateId`; WebSocket `orderBook` messages provide ordered
deltas. The client buffers deltas while a snapshot is in flight and requests a
new snapshot after a sequence gap.

`GET /api/history?interval=1s` and `interval=5s` provide OHLCV history.
WebSocket `trade` messages provide recent trades and `chartUpdate` messages
provide active candles. Set `MARKET_SEED` before starting the backend to make
the generated sequence deterministic:

```powershell
$env:MARKET_SEED = "1337"
npm run dev
```

## Adaptive chart delivery

The client sends a ping every two seconds. RTT is the elapsed time between the
ping timestamp and its pong. Jitter is the average absolute difference between
the last five consecutive RTT samples. The backend averages those reports and
owns the delivery tier for each connection.

Automatic tier changes require three consecutive reports, providing
hysteresis:

- `FULL`: below 80 ms when upgrading; target 20 chart updates/sec.
- `DEGRADED`: above 120 ms to downgrade from full and below 80 ms to upgrade
  to full; target 2 updates/sec.
- `MINIMAL`: above 320 ms to downgrade and below 240 ms to upgrade to
  degraded; target 0.5 updates/sec.

If no latency report arrives for 10 seconds, the connection moves to
`MINIMAL`. A disconnected client is removed. The debug panel can force any
tier or return to automatic mode, and displays the backend-selected effective
rate.
