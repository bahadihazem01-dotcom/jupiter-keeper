import { config } from "dotenv";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

config();

export type NetworkMode = "devnet" | "mainnet";

const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface GaslessHubConfig {
  network: NetworkMode;
  connection: Connection;
  feePayer: Keypair;
  feeMargin: number;
  feeTokenMint: PublicKey | null;
  koraEndpoint: string;
  jitoBlockEngineUrl: string;
  monitorPort: number;
  selfHostedKora: boolean;
  koraPort: number;
  heliusApiKey: string | null;
  rpcUrl: string;
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return val;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function resolveRpcUrl(network: NetworkMode, heliusApiKey: string | null): string {
  const explicitRpc = process.env["SOLANA_RPC_URL"];
  if (explicitRpc) return explicitRpc;

  if (heliusApiKey) {
    if (network === "devnet") {
      return `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    }
    return `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  }

  if (network === "devnet") {
    return "https://api.devnet.solana.com";
  }
  return "https://api.mainnet-beta.solana.com";
}

function resolveUsdcMint(network: NetworkMode): string {
  const explicit = process.env["FEE_TOKEN_MINT"];
  if (explicit) return explicit;
  return network === "devnet" ? DEVNET_USDC_MINT : MAINNET_USDC_MINT;
}

export function loadConfig(): GaslessHubConfig {
  const network = (optionalEnv("SOLANA_NETWORK", "devnet") as NetworkMode);
  const heliusApiKey = process.env["HELIUS_API_KEY"] || null;

  const rpcUrl = resolveRpcUrl(network, heliusApiKey);
  const connection = new Connection(rpcUrl, "confirmed");

  const feePayerKey = requireEnv("FEE_PAYER_PRIVATE_KEY");
  let feePayer: Keypair;
  try {
    feePayer = Keypair.fromSecretKey(bs58.decode(feePayerKey));
  } catch {
    try {
      const parsed = JSON.parse(feePayerKey);
      feePayer = Keypair.fromSecretKey(Uint8Array.from(parsed));
    } catch {
      throw new Error("FEE_PAYER_PRIVATE_KEY must be base58 or JSON array format");
    }
  }

  const feeMargin = parseFloat(optionalEnv("FEE_MARGIN", "0.1"));
  const usdcMint = resolveUsdcMint(network);
  const feeTokenMint = usdcMint ? new PublicKey(usdcMint) : null;
  const koraEndpoint = optionalEnv("KORA_ENDPOINT", "http://localhost:8080");
  const jitoBlockEngineUrl = optionalEnv(
    "JITO_BLOCK_ENGINE_URL",
    "https://mainnet.block-engine.jito.wtf"
  );
  const monitorPort = parseInt(optionalEnv("MONITOR_PORT", "3001"), 10);
  const selfHostedKora = optionalEnv("SELF_HOSTED_KORA", "false") === "true";
  const koraPort = parseInt(optionalEnv("KORA_PORT", "8080"), 10);

  return {
    network,
    connection,
    feePayer,
    feeMargin,
    feeTokenMint,
    koraEndpoint,
    jitoBlockEngineUrl,
    monitorPort,
    selfHostedKora,
    koraPort,
    heliusApiKey,
    rpcUrl,
  };
}
