import { config } from "dotenv";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

config();

export interface GaslessHubConfig {
  connection: Connection;
  feePayer: Keypair;
  feeMargin: number;
  feeTokenMint: PublicKey | null;
  koraEndpoint: string;
  jitoBlockEngineUrl: string;
  monitorPort: number;
  selfHostedKora: boolean;
  koraPort: number;
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

export function loadConfig(): GaslessHubConfig {
  const rpcUrl = optionalEnv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
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
  const feeTokenMintStr = optionalEnv(
    "FEE_TOKEN_MINT",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const feeTokenMint = feeTokenMintStr ? new PublicKey(feeTokenMintStr) : null;
  const koraEndpoint = optionalEnv("KORA_ENDPOINT", "http://localhost:8080");
  const jitoBlockEngineUrl = optionalEnv(
    "JITO_BLOCK_ENGINE_URL",
    "https://mainnet.block-engine.jito.wtf"
  );
  const monitorPort = parseInt(optionalEnv("MONITOR_PORT", "3001"), 10);
  const selfHostedKora = optionalEnv("SELF_HOSTED_KORA", "false") === "true";
  const koraPort = parseInt(optionalEnv("KORA_PORT", "8080"), 10);

  return {
    connection,
    feePayer,
    feeMargin,
    feeTokenMint,
    koraEndpoint,
    jitoBlockEngineUrl,
    monitorPort,
    selfHostedKora,
    koraPort,
  };
}
