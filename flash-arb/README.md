# Flash Loan Arbitrage on Solana

**Borrow millions with ZERO collateral. Profit from price differences across DEXes. Pay nothing if the trade fails.**

Uses [NotArb](https://notarb.org) (free, 10K+ users) + [Helius](https://helius.dev) RPC (free tier).

## How Flash Loan Arbitrage Works

```
                        ALL IN ONE ATOMIC TRANSACTION
                        (fails = you lose only gas ~$0.001)

Step 1: Borrow          Step 2: Buy Low        Step 3: Sell High      Step 4: Repay
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Flash loan    │     │ Buy SOL on   │     │ Sell SOL on  │     │ Repay flash  │
│ $50,000 USDC │────>│ Orca at      │────>│ Raydium at   │────>│ loan + fee   │
│ (0 collateral)│     │ $170.00      │     │ $170.50      │     │ Keep $~147   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

**If the price difference disappears before execution → entire transaction reverts → you only lose gas (~$0.001).**

## Costs

| Item | Cost |
|------|------|
| NotArb software | FREE |
| Helius RPC | FREE (1M credits/month) |
| Flash loan collateral | ZERO |
| Gas per arb attempt | ~$0.001 |
| NotArb fee | 12.5% of PROFITS only |
| No profit? | You pay NOTHING |

**With $0.50 of SOL for gas, you can attempt ~100,000 arb trades.**

## Quick Start

### 1. Setup

```bash
cd flash-arb
bash setup.sh
```

### 2. Get a Free Helius API Key

Go to [dashboard.helius.dev](https://dashboard.helius.dev) → sign up (free) → copy your API key.

### 3. Download NotArb

Visit [download.notarb.org](https://download.notarb.org/) and download for your OS.

```bash
# Linux x64:
curl -L https://download.notarb.org/linux-x64 -o notarb.tar.gz
tar xzf notarb.tar.gz -C ./notarb/

# macOS:
curl -L https://download.notarb.org/darwin -o notarb.tar.gz
tar xzf notarb.tar.gz -C ./notarb/
```

### 4. Configure

Edit `bot-config.toml`:
- Replace `YOUR_HELIUS_API_KEY` with your actual key
- Set `keypair_path` to your wallet file
- Set `acknowledge_terms_of_service=true`

Edit `jupiter-config.toml`:
- Replace `YOUR_HELIUS_API_KEY` with your actual key

### 5. Fund Your Wallet

Send ANY amount of SOL to your wallet address. Even $0.10 works.

```bash
# Check your wallet address:
solana-keygen pubkey ./wallet/fee-payer.json

# On devnet (free):
solana airdrop 2 $(solana-keygen pubkey ./wallet/fee-payer.json) --url devnet
```

### 6. Start (Simulation Mode First!)

The config starts in **simulation mode** — no real trades, just shows opportunities:

```bash
# Terminal 1: Start Jupiter API server
bash start-jupiter.sh

# Terminal 2: Start the arb bot
bash start-bot.sh
```

Watch the output. When you see profitable opportunities appearing, switch to live:
- Edit `bot-config.toml` → `[simulation_mode]` → `enabled=false`
- Restart the bot

### 7. Go Live

```bash
# Edit bot-config.toml: set simulation_mode enabled=false
# Restart:
bash start-bot.sh
```

## What NotArb Does

NotArb scans for price differences across 8+ DEXes:
- **Raydium** (AMM + CLMM)
- **Orca Whirlpool**
- **Meteora** (DLMM + pools)
- **Pump.Fun**
- **Jupiter** (aggregator)
- And more...

When it finds a profitable route:
1. Takes a flash loan (borrows tokens with zero collateral)
2. Buys low on DEX A
3. Sells high on DEX B
4. Repays the flash loan
5. Keeps the profit (minus 12.5% NotArb fee)
6. All in ONE atomic transaction

## Realistic Expectations

| Timeframe | What to Expect |
|-----------|---------------|
| Day 1 | Learn the system, run simulation mode |
| Week 1 | Find small opportunities ($0-$5/day) |
| Month 1 | Optimize settings, $5-$20/day possible |
| Month 2+ | With experience: $20-$100/day on good market days |

**Honest truth:**
- Arb is COMPETITIVE. Professional firms run co-located servers.
- Volatile market days = MORE opportunities = MORE profit.
- Quiet market days = FEWER opportunities.
- Flash loans level the playing field (you don't need capital), but speed still matters.
- $100/day is possible but NOT guaranteed and NOT from day one.

## File Structure

```
flash-arb/
├── setup.sh                    # One-command setup
├── start-jupiter.sh            # Start Jupiter API server
├── start-bot.sh                # Start the arb bot
├── bot-config.example.toml     # Bot config template
├── jupiter-config.example.toml # Jupiter server config template
├── wallet/                     # Your wallet keypair (created by setup)
├── notarb/                     # NotArb binaries (downloaded by setup)
└── README.md                   # You're reading it
```

## Tips for Better Results

1. **Use a paid Helius plan** ($24.50/mo) for 50 req/s instead of 10. More speed = more opportunities captured.
2. **Run on a VPS close to Solana validators** (e.g., Amsterdam, Frankfurt, Tokyo). Lower latency = first to execute.
3. **Start with high-volume tokens** (SOL, USDC, USDT) — more trading = more arb opportunities.
4. **Join the NotArb Discord** at [discord.notarb.org](https://discord.notarb.org) for community strategies.
5. **Monitor on circular.bot** — track your bot's performance and compare with others.

## Links

- [NotArb Docs](https://docs.notarb.org)
- [NotArb Discord](https://discord.notarb.org)
- [NotArb Download](https://download.notarb.org)
- [NotArb Config Examples](https://examples.notarb.org)
- [Helius Dashboard](https://dashboard.helius.dev)
- [Jito Documentation](https://jito-foundation.gitbook.io/mev)

## Important

- **NotArb is NOT open source** — it's a free binary. The 12.5% fee on flash loan profits is how they make money.
- **Never share your wallet keypair** with anyone.
- **Start in simulation mode** — learn before risking real SOL.
- **Flash loans are atomic** — if the arb doesn't profit, the tx fails and you lose only gas (~$0.001).
- **This is NOT a guaranteed income** — arb profits depend on market conditions and competition.
