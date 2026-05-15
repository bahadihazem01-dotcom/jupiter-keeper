# Solana Gasless Hub

**Plug-and-play gasless transaction relayer for Solana.** Start for FREE on devnet, switch to mainnet when ready. Users pay you in USDC, you keep the margin. No need to pre-create token accounts — Kora handles ATA creation automatically.

Built on [Kora](https://github.com/solana-foundation/kora) (Solana Foundation's official Paymaster) + Jito bundles.

> **Helius is NOT a paymaster.** Helius provides fast RPC endpoints (free tier: 1M credits/month). This project uses Helius for faster RPC, but the actual gas payment is handled by Kora. [Get a free Helius API key →](https://dashboard.helius.dev)

## How It Works

```
User (no SOL needed)          Your Infrastructure            Solana Network
┌──────────────────┐     ┌─────────────────────────┐     ┌──────────────┐
│                  │     │   Kora Paymaster Node    │     │              │
│  "I want to      │────>│                         │────>│  Transaction │
│   swap USDC"     │     │  1. Validates tx         │     │  confirmed!  │
│                  │     │  2. Pays SOL gas fee      │     │              │
│  Signs tx        │     │  3. Charges user in USDC  │     │              │
│  Pays ZERO SOL   │     │  4. YOU keep the margin   │     │              │
└──────────────────┘     └─────────────────────────┘     └──────────────┘
```

### The Economics

| Metric | Value |
|--------|-------|
| Solana gas fee per tx | ~0.000005 SOL (~$0.00085) |
| Your fee margin (10%) | ~$0.000085 per tx (in USDC) |
| $0.10 of SOL covers | ~120 transactions |
| $1 of SOL covers | ~200,000 transactions |
| ATA creation (one-time) | ~0.002 SOL (~$0.34) per token account |

**You only need SOL for gas.** USDC token accounts are auto-created by Kora when the first user pays you — the ATA creation cost (~0.002 SOL) comes from your fee payer balance automatically. No manual account setup needed.

## $0 Quick Start (Devnet — FREE)

**You have nothing? No problem.** Start on devnet with free airdropped SOL:

### 1. Clone & Install

```bash
cd gasless-hub
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Default is devnet — no changes needed!
```

### 3. Setup (generates wallet + free airdrop)

```bash
npm run setup
```

This generates a wallet AND airdrops free devnet SOL. Zero cost.

### 4. Start the Paymaster (Docker)

```bash
docker compose up -d
```

### 5. Test Gasless Transactions

```bash
npm run example:transfer
npm run monitor
```

### 6. Switch to Mainnet When Ready

```bash
# Edit .env:
SOLANA_NETWORK=mainnet
# Fund your fee payer with ANY amount of SOL
# Restart: docker compose down && docker compose up -d
```

## Helius RPC Integration (Free, Recommended)

[Helius](https://helius.dev) provides faster, more reliable RPC than public Solana endpoints. Their free tier gives you 1M credits/month.

**What Helius IS:** An RPC provider (faster connection to Solana)
**What Helius is NOT:** A paymaster (it doesn't pay gas for you)

To use Helius:
1. Create a free account at [dashboard.helius.dev](https://dashboard.helius.dev)
2. Copy your API key
3. Add to `.env`:
```
HELIUS_API_KEY=your-key-here
```

The project auto-detects your network (devnet/mainnet) and builds the correct Helius RPC URL.

## Project Structure

```
gasless-hub/
├── src/
│   ├── gasless-client.ts   # Client SDK — connect to any Kora Paymaster
│   ├── relayer.ts          # Main relayer entry point
│   ├── monitor.ts          # Cost/profit monitoring dashboard
│   ├── setup.ts            # Setup wizard (with devnet airdrop)
│   ├── config.ts           # Configuration loader (network + Helius aware)
│   └── index.ts            # Package exports
├── examples/
│   ├── gasless-transfer.ts # Gasless USDC transfer
│   └── gasless-swap.ts     # Gasless Jupiter swap
├── kora-config/
│   ├── kora.toml           # Optimized Kora configuration
│   └── signers.toml        # Signer setup
├── docker-compose.yml      # One-command Kora deployment
├── .env.example            # Environment template
└── README.md               # You're reading it
```

## Using the Client SDK

```typescript
import { GaslessClient } from './src/gasless-client';

// Connect to any Kora Paymaster endpoint
const client = new GaslessClient('http://localhost:8080');

// Check it's online
const healthy = await client.isHealthy();

// Execute a gasless transaction
const signature = await client.executeGasless(userKeypair, [
  transferInstruction,
  swapInstruction,
  // any Solana instructions...
]);

// User paid ZERO SOL. Paymaster covered gas.
console.log(`TX: https://solscan.io/tx/${signature}`);
```

## Connecting to Existing Paymaster Endpoints

You don't have to run your own Kora node. You can connect to any public Kora endpoint:

```typescript
// Connect to someone else's Paymaster
const client = new GaslessClient('https://some-kora-endpoint.com');

// Same API, same gasless experience
await client.executeGasless(userKeypair, instructions);
```

## Configuration

### Network Mode

In `.env`:
```
# Start here (free!):
SOLANA_NETWORK=devnet

# When ready for real transactions:
SOLANA_NETWORK=mainnet
```

### Fee Pricing Models

In `kora-config/kora.toml`:

```toml
[validation.price]
# Option 1: Margin (recommended) — charge gas cost + X% margin
type = "margin"
margin = 0.1   # 10% margin = your profit

# Option 2: Free — you absorb all gas costs
# type = "free"

# Option 3: Fixed — charge a fixed token amount per tx
# type = "fixed"
# amount = 1000  # in token smallest unit
# token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # USDC
```

### Security

The `kora.toml` is pre-configured with tight fee payer policies:
- Fee payer **cannot** be used for transfers (prevents drainage)
- Fee payer **can** create ATAs (needed for token operations)
- Only well-known programs are allowed (System, Token, Jupiter, Orca)
- Max lamports per tx is capped

### Supported Programs

By default, the Paymaster accepts transactions involving:
- System Program (basic Solana operations)
- SPL Token Program (token transfers)
- Associated Token Account Program (ATA creation)
- Jupiter v6 (DEX aggregator swaps)
- Orca Whirlpool (AMM swaps)

Add more programs to `allowed_programs` in `kora.toml` as needed.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Setup wizard — generates wallet, airdrops on devnet |
| `npm start` | Start the relayer |
| `npm run monitor` | Monitor costs and profit |
| `npm run monitor -- --watch` | Live monitoring mode |
| `npm run example:transfer` | Demo gasless USDC transfer |
| `npm run example:swap` | Demo gasless Jupiter swap |
| `npm run build` | Compile TypeScript |
| `npm run lint` | Type-check the code |

## How to Get Started with $0

1. **Set network to devnet** — default in `.env` (free!)
2. **Run setup** — `npm run setup` (generates wallet, airdrops free SOL)
3. **Start Kora** — `docker compose up -d`
4. **Test gasless txs** — `npm run example:transfer`
5. **When ready for mainnet** — set `SOLANA_NETWORK=mainnet`, fund wallet with ANY amount of SOL

**No USDC account needed upfront!** When the first user pays you in USDC, Kora auto-creates your USDC token account (ATA) using ~0.002 SOL from your fee payer. After that, all USDC fees flow directly to you.

## Understanding the Stack

| Component | What It Does | Cost |
|-----------|-------------|------|
| **Helius** | Fast RPC (connects you to Solana faster) | Free tier: 1M credits/mo |
| **Kora** | Paymaster (pays gas, charges users in tokens) | Free (open source, self-hosted) |
| **Your SOL** | Gas budget (fee payer wallet) | Devnet: free. Mainnet: a few cents |
| **USDC margin** | Your revenue from relaying | 10% of gas cost per tx |

## Kora Documentation

- [Kora Overview](https://launch.solana.com/docs/kora/getting-started)
- [Kora JSON-RPC API](https://launch.solana.com/docs/kora/json-rpc-api)
- [Node Operator Guide](https://launch.solana.com/docs/kora/operators)
- [Kora GitHub](https://github.com/solana-foundation/kora)

## License

MIT
