/**
 * Gasless Client — Connects to a Kora Paymaster endpoint and submits
 * transactions where the Paymaster pays SOL gas fees.
 *
 * This is the core client that apps/users interact with.
 * The Paymaster operator (you) earns a fee margin on every tx.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

export interface KoraConfig {
  feePayer: string;
  rpcUrl: string;
  maxSignatures: number;
  lamportsPerSignature: number;
  tokens: Array<{
    mint: string;
    account: string;
    symbol?: string;
  }>;
}

export interface FeeEstimate {
  feeInLamports: number;
  feeInToken: number | null;
  signerPubkey: string;
  paymentAddress: string;
}

export class GaslessClient {
  private endpoint: string;
  private connection: Connection;

  constructor(endpoint: string, rpcUrl?: string) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.connection = new Connection(
      rpcUrl || "https://api.mainnet-beta.solana.com",
      "confirmed"
    );
  }

  /**
   * Call a JSON-RPC method on the Kora endpoint
   */
  private async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    };

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Kora RPC HTTP error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as {
      result?: T;
      error?: { code: number; message: string };
    };
    if (json.error) {
      throw new Error(`Kora RPC error: ${json.error.message} (code: ${json.error.code})`);
    }
    return json.result as T;
  }

  /**
   * Get the Paymaster node configuration
   */
  async getConfig(): Promise<KoraConfig> {
    return this.rpc<KoraConfig>("getConfig");
  }

  /**
   * Get supported tokens for fee payment
   */
  async getSupportedTokens(): Promise<
    Array<{ mint: string; account: string; symbol?: string }>
  > {
    return this.rpc("getSupportedTokens");
  }

  /**
   * Get fee payer (Paymaster) public key
   */
  async getPayerSigner(): Promise<{ signerPubkey: string; paymentAddress: string }> {
    return this.rpc("getPayerSigner");
  }

  /**
   * Get a recent blockhash from the Paymaster
   */
  async getBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    return this.rpc("getBlockhash");
  }

  /**
   * Estimate the fee for a transaction (in lamports and optionally in a token)
   */
  async estimateFee(
    transactionBase64: string,
    feeToken?: string
  ): Promise<FeeEstimate> {
    const params: Record<string, unknown> = { transaction: transactionBase64 };
    if (feeToken) {
      params.fee_token = feeToken;
    }
    return this.rpc<FeeEstimate>("estimateTransactionFee", [params]);
  }

  /**
   * Sign a transaction via the Paymaster (Paymaster adds its fee payer signature)
   */
  async signTransaction(transactionBase64: string): Promise<{ transaction: string }> {
    return this.rpc("signTransaction", [{ transaction: transactionBase64 }]);
  }

  /**
   * Sign AND send a transaction via the Paymaster
   * The Paymaster pays gas and broadcasts to the network.
   */
  async signAndSendTransaction(
    transactionBase64: string
  ): Promise<{ signature: string }> {
    return this.rpc("signAndSendTransaction", [
      { transaction: transactionBase64 },
    ]);
  }

  /**
   * Build a gasless transaction: creates a transaction where the Paymaster
   * is set as the fee payer, so the user pays ZERO SOL for gas.
   *
   * @param userKeypair - The user's keypair (signs the transaction)
   * @param instructions - The instructions to execute
   * @param feeToken - Optional: SPL token mint to pay fees in (if the Paymaster requires it)
   */
  async buildGaslessTransaction(
    userKeypair: Keypair,
    instructions: TransactionInstruction[],
    feeToken?: string
  ): Promise<{
    transaction: Transaction;
    serialized: string;
    feeEstimate: FeeEstimate | null;
  }> {
    // Get the Paymaster's fee payer public key
    const payerInfo = await this.getPayerSigner();
    const feePayer = new PublicKey(payerInfo.signerPubkey);

    // Get a recent blockhash
    const { blockhash } = await this.getBlockhash();

    // Build transaction with Paymaster as fee payer
    const transaction = new Transaction();
    transaction.feePayer = feePayer;
    transaction.recentBlockhash = blockhash;

    // Add user's instructions
    for (const ix of instructions) {
      transaction.add(ix);
    }

    // User signs the transaction (partial sign — Paymaster signs the rest)
    transaction.partialSign(userKeypair);

    // Serialize for the Paymaster
    const serialized = transaction
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    // Estimate fees if requested
    let feeEstimate: FeeEstimate | null = null;
    try {
      feeEstimate = await this.estimateFee(serialized, feeToken);
    } catch {
      // Fee estimation is optional
    }

    return { transaction, serialized, feeEstimate };
  }

  /**
   * Execute a gasless transaction end-to-end:
   * 1. Build the transaction with Paymaster as fee payer
   * 2. User signs it
   * 3. Send to Paymaster for co-signing and broadcasting
   *
   * Returns the transaction signature.
   */
  async executeGasless(
    userKeypair: Keypair,
    instructions: TransactionInstruction[]
  ): Promise<string> {
    const { serialized } = await this.buildGaslessTransaction(
      userKeypair,
      instructions
    );

    // Send to Paymaster — it co-signs (as fee payer) and broadcasts
    const result = await this.signAndSendTransaction(serialized);
    return result.signature;
  }

  /**
   * Check the Paymaster's health/liveness
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.getConfig();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the fee payer's SOL balance (useful for monitoring)
   */
  async getFeePayerBalance(): Promise<number> {
    const payerInfo = await this.getPayerSigner();
    const feePayer = new PublicKey(payerInfo.signerPubkey);
    const balance = await this.connection.getBalance(feePayer);
    return balance / LAMPORTS_PER_SOL;
  }
}
