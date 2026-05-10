# Jupiter Limit Order Keeper Bot

A keeper bot that monitors and executes Jupiter limit orders on Solana when they become profitable. You earn the spread between the Jupiter swap quote and the order's taking amount as profit.

Based on [jup-ag/limit-order-taker-example](https://github.com/jup-ag/limit-order-taker-example), modernized with:

- **Balance checks** — verifies SOL balance before execution, pauses when low
- **Structured logging** — timestamped logs with levels (INFO/WARN/ERROR/DEBUG)
- **Error resilience** — individual order failures don't crash the bot
- **Configurable** — profit thresholds, polling intervals, order limits via `.env`
- **Graceful shutdown** — handles SIGINT/SIGTERM cleanly
- **Execution stats** — tracks orders checked, executed, failed, skipped
- **Retry logic** — automatic retries on API rate limits and transient failures

## How It Works

1. Fetches all open limit orders from the Jupiter Limit Order program
2. Groups and sorts orders by pair (best price first)
3. Gets a Jupiter swap quote for each order
4. Checks profitability: `quoteOutAmount >= takingAmount + takerFee + minProfit`
5. Verifies wallet SOL balance before each execution
6. Bundles Jupiter swap + limit order fill into one atomic transaction
7. You keep the spread as profit

## Prerequisites

- Node.js 18+
- pnpm
- A Solana wallet funded with SOL (for transaction fees)
- A private RPC endpoint (public RPCs will rate-limit you)

## Setup

1. Clone this repo:
```bash
git clone <your-repo-url>
cd limit-order-keeper
```

2. Install dependencies:
```bash
pnpm install
```

3. Create your `.env` file:
```bash
cp .env.example .env
```

4. Edit `.env` with your settings:
```env
RPC_ENDPOINT=https://your-rpc-endpoint.com
PRIVATE_KEY=your-base58-encoded-private-key
MIN_SOL_BALANCE=0.05
MIN_PROFIT_BPS=0
POLL_INTERVAL_MS=5000
```

## Running

### Quick start
```bash
pnpm start
```

### Running with tmux (recommended for servers)

tmux lets the bot keep running even after you disconnect from SSH.

```bash
# Create a new tmux session named "keeper"
tmux new -s keeper

# Inside the tmux session, start the bot
pnpm start

# Detach from tmux (bot keeps running in background)
# Press: Ctrl+B, then D

# Re-attach to check logs anytime
tmux attach -t keeper

# View the session without attaching
tmux ls
```

#### tmux cheat sheet
| Action | Keys |
|--------|------|
| Detach (leave running) | `Ctrl+B`, then `D` |
| Scroll up in logs | `Ctrl+B`, then `[`, then arrow keys or PgUp |
| Exit scroll mode | `q` |
| Kill session | `tmux kill-session -t keeper` |
| New window in session | `Ctrl+B`, then `C` |
| Switch windows | `Ctrl+B`, then `N` (next) or `P` (prev) |

### Running with systemd (auto-restart on crash)

Create `/etc/systemd/system/jupiter-keeper.service`:
```ini
[Unit]
Description=Jupiter Limit Order Keeper Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/limit-order-keeper
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:
```bash
pnpm build
sudo systemctl enable jupiter-keeper
sudo systemctl start jupiter-keeper
sudo journalctl -u jupiter-keeper -f  # view logs
```

## Configuration

All settings are configured via environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_ENDPOINT` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `PRIVATE_KEY` | (required) | Base58-encoded wallet private key |
| `MIN_SOL_BALANCE` | `0.05` | Minimum SOL to keep for tx fees |
| `MIN_PROFIT_BPS` | `0` | Minimum profit in basis points (100 = 1%) |
| `POLL_INTERVAL_MS` | `5000` | Delay between order fetch cycles |
| `ORDER_DELAY_MS` | `1000` | Delay between processing individual orders |
| `MAX_ORDERS_PER_CYCLE` | `10` | Max orders to process per cycle per pair |
| `JUPITER_API_BASE_URL` | `https://quote-api.jup.ag/v6` | Jupiter API base URL |
| `SLIPPAGE_BPS` | `0` | Slippage tolerance for quotes |

## Project Structure

```
src/
  index.ts       # Main loop: fetch orders, check profitability, execute
  config.ts      # Configuration from .env
  balance.ts     # SOL balance checks
  jupiterApi.ts  # Jupiter Quote/Swap API with retry logic
  fee.ts         # Taker fee calculation
  logger.ts      # Structured logging
```

## Security Notes

- Never share or commit your `.env` file
- Use a dedicated wallet for the keeper bot (not your main wallet)
- Start with a small SOL balance to test
- Monitor your wallet balance regularly
- The bot only executes profitable orders — you won't lose funds on the swaps themselves, but you pay SOL for transaction fees

## License

ISC
