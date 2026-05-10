import { config } from "dotenv";
config();

export const CONFIG = {
  // RPC endpoint for Solana
  rpcEndpoint: process.env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com",

  // Wallet private key (base58 encoded)
  privateKey: process.env.PRIVATE_KEY || "",

  // Minimum SOL balance to keep for transaction fees (in SOL)
  minSolBalance: parseFloat(process.env.MIN_SOL_BALANCE || "0.05"),

  // Minimum profit margin in basis points (100 = 1%)
  minProfitBps: parseInt(process.env.MIN_PROFIT_BPS || "0"),

  // Polling interval in milliseconds between order checks
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "5000"),

  // Delay between processing individual orders (ms)
  orderDelayMs: parseInt(process.env.ORDER_DELAY_MS || "1000"),

  // Maximum number of orders to process per cycle
  maxOrdersPerCycle: parseInt(process.env.MAX_ORDERS_PER_CYCLE || "50"),

  // Jupiter API base URL
  jupiterApiBaseUrl:
    process.env.JUPITER_API_BASE_URL || "https://api.jup.ag/swap/v1",

  // Slippage in basis points for Jupiter quotes
  slippageBps: parseInt(process.env.SLIPPAGE_BPS || "0"),

  // Whether to skip orders where maker output account is closed
  skipClosedMakerAccounts: true,

  // Dashboard port
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || "3000"),
};
