/**
 * Cost Monitor — Tracks how much SOL the fee payer is spending
 * and how many transactions you can still relay.
 *
 * Run with: npm run monitor
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadConfig } from "./config.js";
import { GaslessClient } from "./gasless-client.js";

interface MonitorStats {
  feePayerAddress: string;
  solBalance: number;
  solBalanceUsd: number;
  estimatedTxsRemaining: number;
  costPerTx: number;
  feeMargin: number;
  revenuePerTx: number;
  profitPerTx: number;
  txsUntilBreakeven: number;
}

const SOL_PER_TX = 0.000005; // ~5000 lamports per transaction
const SOL_PRICE_USD = 170; // Approximate — in production, fetch from oracle

async function getMonitorStats(
  connection: Connection,
  feePayerAddress: string,
  feeMargin: number
): Promise<MonitorStats> {
  const feePayer = new PublicKey(feePayerAddress);
  const balance = await connection.getBalance(feePayer);
  const solBalance = balance / LAMPORTS_PER_SOL;
  const solBalanceUsd = solBalance * SOL_PRICE_USD;

  const estimatedTxsRemaining = Math.floor(solBalance / SOL_PER_TX);
  const costPerTx = SOL_PER_TX;
  const revenuePerTx = SOL_PER_TX * (1 + feeMargin);
  const profitPerTx = revenuePerTx - costPerTx;

  // How many txs until the margin revenue covers the initial SOL outlay
  const txsUntilBreakeven = profitPerTx > 0 ? Math.ceil(solBalance / profitPerTx) : Infinity;

  return {
    feePayerAddress,
    solBalance,
    solBalanceUsd,
    estimatedTxsRemaining,
    costPerTx,
    feeMargin,
    revenuePerTx,
    profitPerTx,
    txsUntilBreakeven,
  };
}

function formatStats(stats: MonitorStats): string {
  const lines = [
    "",
    "╔══════════════════════════════════════════════════════════╗",
    "║         SOLANA GASLESS HUB — COST MONITOR               ║",
    "╠══════════════════════════════════════════════════════════╣",
    `║  Fee Payer:  ${stats.feePayerAddress.slice(0, 20)}...           ║`,
    `║  SOL Balance: ${stats.solBalance.toFixed(6)} SOL (~$${stats.solBalanceUsd.toFixed(2)})`,
    "╠══════════════════════════════════════════════════════════╣",
    "║  ECONOMICS                                              ║",
    `║  Cost per TX:     ${stats.costPerTx.toFixed(6)} SOL (~$${(stats.costPerTx * SOL_PRICE_USD).toFixed(6)})`,
    `║  Mode:            ${stats.feeMargin > 0 ? `Margin (${(stats.feeMargin * 100).toFixed(1)}%)` : "SOL-only (free)"}`,
    ...(stats.feeMargin > 0 ? [
      `║  Revenue per TX:  ${stats.revenuePerTx.toFixed(6)} SOL`,
      `║  Profit per TX:   ${stats.profitPerTx.toFixed(6)} SOL (~$${(stats.profitPerTx * SOL_PRICE_USD).toFixed(6)})`,
    ] : []),
    "╠══════════════════════════════════════════════════════════╣",
    "║  CAPACITY                                               ║",
    `║  TXs Remaining:   ~${stats.estimatedTxsRemaining.toLocaleString()} transactions`,
    ...(stats.feeMargin > 0 ? [`║  Break-even at:   ~${stats.txsUntilBreakeven.toLocaleString()} transactions relayed`] : []),
    "╠══════════════════════════════════════════════════════════╣",
    "║  COST BREAKDOWN                                         ║",
    `║  $1 SOL covers:   ~${Math.floor(1 / SOL_PER_TX).toLocaleString()} transactions`,
    `║  $5 SOL covers:   ~${Math.floor(5 / SOL_PER_TX).toLocaleString()} transactions`,
    `║  $10 SOL covers:  ~${Math.floor(10 / SOL_PER_TX).toLocaleString()} transactions`,
    "╚══════════════════════════════════════════════════════════╝",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  console.log("Loading configuration...");

  const cfg = loadConfig();
  const feePayerAddress = cfg.feePayer.publicKey.toBase58();

  // Try to get stats from Kora endpoint too
  const client = new GaslessClient(cfg.koraEndpoint, cfg.connection.rpcEndpoint);
  let koraHealthy = false;
  try {
    koraHealthy = await client.isHealthy();
  } catch {
    // Kora not running
  }

  const stats = await getMonitorStats(cfg.connection, feePayerAddress, cfg.feeMargin);
  console.log(formatStats(stats));

  if (koraHealthy) {
    console.log("  Kora Paymaster: ONLINE at", cfg.koraEndpoint);
    try {
      const tokens = await client.getSupportedTokens();
      console.log(`  Accepted fee tokens: ${tokens.length}`);
      for (const t of tokens) {
        console.log(`    - ${t.symbol || t.mint}`);
      }
    } catch {
      console.log("  (Could not fetch supported tokens)");
    }
  } else {
    console.log("  Kora Paymaster: OFFLINE");
    console.log("  Start it with: docker compose up -d");
  }

  console.log("");

  // Continuous monitoring mode
  if (process.argv.includes("--watch")) {
    console.log("Watching for balance changes (Ctrl+C to stop)...\n");
    setInterval(async () => {
      const newStats = await getMonitorStats(
        cfg.connection,
        feePayerAddress,
        cfg.feeMargin
      );
      process.stdout.write(
        `\r  SOL: ${newStats.solBalance.toFixed(6)} | TXs left: ~${newStats.estimatedTxsRemaining.toLocaleString()} | Profit/tx: ${newStats.profitPerTx.toFixed(6)} SOL  `
      );
    }, 10_000);
  }
}

main().catch(console.error);
