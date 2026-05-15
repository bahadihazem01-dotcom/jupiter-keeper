# Solana Gasless Hub

**Plug-and-play gasless transaction relayer for Solana.** You provide the infrastructure, the Paymaster handles gas fees. Start with SOL-only mode (10 cents is enough), then switch to margin pricing to earn a cut later.

Built on top of [Kora](https://github.com/solana-foundation/kora) (Solana Foundation's official Paymaster) + Jito bundles.

## How It Works

```
User (no SOL needed)          Your Infrastructure            Solana Network
┌──────────────────┐     ┌─────────────────────────┐     ┌──────────────┐
│                  │     │   Kora Paymaster Node    │     │              │
│  "I want to      │────>│                         │────>│  Transaction │
│   swap USDC"     │     │  1. Validates tx         │     │  confirmed!  │
│                  │     │  2. Pays SOL gas fee      │     │              │
│  Signs tx        │     │  (~$0.00085 per tx)       │     │              │
│  Pays ZERO SOL   │     │  3. Your SOL covers gas   │     │              │
└──────────────────┘     └─────────────────────────┘     └──────────────┘
```

### The Economics (SOL-only mode)

| Metric | Value |
|--------|-------|
| Solana gas fee per tx | ~0.000005 SOL (~$0.00085) |
| **$0.10 of SOL covers** | **~120 transactions** |
| $1 of SOL covers | ~200,000 transactions |
| $5 of SOL covers | ~1,000,000 transactions |

The key: **Solana fees are incredibly cheap.** Even 10 cents of SOL gets you started. Later, switch to margin pricing to charge users in USDC and earn revenue.

## Quick Start

### 1. Clone & Install

```bash
git clone <this-repo>
cd solana-gasless-hub
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Generate a Fee Payer Wallet

```bash
npm run setup
```

This generates a new Solana wallet and shows you how much SOL you need (spoiler: very little).

### 4. Start the Paymaster (Docker)

```bash
docker compose up -d
```

This runs a Kora Paymaster node on your machine. It's the well-known, battle-tested Solana Foundation infrastructure.

### 5. Monitor Your Costs

```bash
npm run monitor
```

### 6. Try a Gasless Transaction

```bash
npm run example:transfer
npm run example:swap
```

## Project Structure

```
solana-gasless-hub/
├── src/
│   ├── gasless-client.ts   # Client SDK — connect to any Kora Paymaster
│   ├── relayer.ts          # Main relayer entry point
│   ├── monitor.ts          # Cost/profit monitoring dashboard
│   ├── setup.ts            # Setup wizard
│   ├── config.ts           # Configuration loader
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
| `npm run setup` | Setup wizard — generates wallet, checks balance |
| `npm start` | Start the relayer |
| `npm run monitor` | Monitor costs and profit |
| `npm run monitor -- --watch` | Live monitoring mode |
| `npm run example:transfer` | Demo gasless USDC transfer |
| `npm run example:swap` | Demo gasless Jupiter swap |
| `npm run build` | Compile TypeScript |
| `npm run lint` | Type-check the code |

## How to Get Started with 10 Cents

1. **Generate a wallet** — `npm run setup` (free)
2. **Send 10 cents of SOL** — to the generated wallet address (~120 transactions covered)
3. **Start the Paymaster** — `docker compose up -d`
4. **Start relaying** — `npm start`
5. **Scale up later** — When you have more volume, switch to margin pricing in `kora.toml` to start earning from fees

## Kora Documentation

- [Kora Overview](https://launch.solana.com/docs/kora/getting-started)
- [Kora JSON-RPC API](https://launch.solana.com/docs/kora/json-rpc-api)
- [Node Operator Guide](https://launch.solana.com/docs/kora/operators)
- [Kora GitHub](https://github.com/solana-foundation/kora)

## License

MIT
