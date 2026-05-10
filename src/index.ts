import { LimitOrderProvider, Order } from "@jup-ag/limit-order-sdk";
import { Decimal } from "decimal.js";
import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getQuote, getSwapIx, failedPairCache } from "./jupiterApi";
import { Wallet, BN } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { getTakerFee } from "./fee";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { validateBalance, checkBalance } from "./balance";
import {
  startDashboardServer,
  updateDashboard,
  addRecentOrder,
} from "./dashboard";
import { exec } from "child_process";
import { getOrCreateWallet } from "./wallet";

interface ExecutionStats {
  cycleCount: number;
  ordersChecked: number;
  ordersExecuted: number;
  ordersFailed: number;
  ordersSkipped: number;
  totalProfit: Decimal;
}

const stats: ExecutionStats = {
  cycleCount: 0,
  ordersChecked: 0,
  ordersExecuted: 0,
  ordersFailed: 0,
  ordersSkipped: 0,
  totalProfit: new Decimal(0),
};

let running = true;

function setupGracefulShutdown() {
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function logStats() {
  logger.info("Execution stats", {
    cycles: stats.cycleCount,
    checked: stats.ordersChecked,
    executed: stats.ordersExecuted,
    failed: stats.ordersFailed,
    skipped: stats.ordersSkipped,
  });
}

export async function main() {
  setupGracefulShutdown();

  const connection = new Connection(CONFIG.rpcEndpoint);

  // Get existing wallet or generate a new one
  const wallet = await getOrCreateWallet(connection);

  const limitOrder = new LimitOrderProvider(connection);

  logger.info("Keeper bot started", {
    wallet: wallet.publicKey.toBase58(),
    rpc: CONFIG.rpcEndpoint.replace(/\/\/.*@/, "//***@"), // hide credentials
    pollInterval: CONFIG.pollIntervalMs,
    minProfitBps: CONFIG.minProfitBps,
    minSolBalance: CONFIG.minSolBalance,
  });

  // Start dashboard
  startDashboardServer(CONFIG.dashboardPort);
  updateDashboard({ wallet: wallet.publicKey.toBase58() });

  // Open browser
  const dashboardUrl = `http://localhost:${CONFIG.dashboardPort}`;
  const openCmd =
    process.platform === "darwin"
      ? `open ${dashboardUrl}`
      : process.platform === "win32"
        ? `start ${dashboardUrl}`
        : `xdg-open ${dashboardUrl} 2>/dev/null || echo "Open ${dashboardUrl} in your browser"`;
  exec(openCmd);

  // Initial balance check
  const hasBalance = await validateBalance(connection, wallet.publicKey);
  if (!hasBalance) {
    logger.error(
      "Insufficient SOL balance to start. Fund your wallet and retry."
    );
    process.exit(1);
  }

  // Update dashboard with initial balance
  const initBal = await checkBalance(connection, wallet.publicKey);
  updateDashboard({ solBalance: initBal.solBalance });

  const fee = await limitOrder.getFee();
  logger.info("Fee config loaded", {
    takerFee: fee.takerFee.toNumber(),
    takerStableFee: fee.takerStableFee.toNumber(),
  });

  while (running) {
    stats.cycleCount++;

    const cycleStart = Date.now();

    try {
      logger.info(`── Cycle ${stats.cycleCount} starting ──`);

      // Periodic balance check (every 10 cycles)
      if (stats.cycleCount % 10 === 0) {
        logger.info("Balance check (every 10 cycles)");
        const bal = await checkBalance(connection, wallet.publicKey);
        updateDashboard({ solBalance: bal.solBalance });
        logger.info("Balance", { sol: bal.solBalance, sufficient: bal.hasSufficientSol });
        if (!bal.hasSufficientSol) {
          logger.warn(
            "Low SOL balance, pausing 30s until balance is restored..."
          );
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }
      }

      // Update dashboard stats every cycle
      updateDashboard({
        stats: {
          cycleCount: stats.cycleCount,
          ordersChecked: stats.ordersChecked,
          ordersExecuted: stats.ordersExecuted,
          ordersFailed: stats.ordersFailed,
          ordersSkipped: stats.ordersSkipped,
        },
      });

      // Fetch open orders
      const fetchStart = Date.now();
      const pendingOrders = await limitOrder.getOrders();
      const fetchMs = Date.now() - fetchStart;
      logger.info(`Fetched ${pendingOrders.length} open orders`, { fetchTimeMs: fetchMs });

      if (pendingOrders.length === 0) {
        await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
        continue;
      }

      // Filter to orders with liquid output tokens (SOL, USDC, USDT)
      const LIQUID_MINTS = new Set([
        "So11111111111111111111111111111111111111112",  // SOL
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
      ]);

      const liquidOrders = pendingOrders.filter(
        (order) => LIQUID_MINTS.has(order.account.outputMint.toBase58())
      );
      logger.info(`Filtered to ${liquidOrders.length} liquid orders`, {
        total: pendingOrders.length,
        filtered: pendingOrders.length - liquidOrders.length,
        liquid: liquidOrders.length,
      });

      // Group orders by pair
      const pendingOrderGroup = liquidOrders.reduce(
        (
          group: Record<string, { publicKey: PublicKey; account: Order }[]>,
          order
        ) => {
          const { inputMint, outputMint } = order.account;
          const pair = inputMint.toBase58() + outputMint.toBase58();
          group[pair] = group[pair] || [];
          group[pair].push(order);
          return group;
        },
        {}
      );

      // Known liquid input tokens — these pairs are most likely to have routes & profit
      const PRIORITY_INPUT_MINTS = new Set([
        "So11111111111111111111111111111111111111112",  // SOL
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
        "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",   // JUP
        "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",   // mSOL
        "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",  // ETH (Wormhole)
        "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",  // BONK
        "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",   // RENDER
        "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",  // PYTH
        "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",   // HNT
        "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",  // W
      ]);

      // Pick the best (lowest price ratio) order per pair
      const priorityOrders: { publicKey: PublicKey; account: Order }[] = [];
      const otherOrders: { publicKey: PublicKey; account: Order }[] = [];

      Object.values(pendingOrderGroup).forEach((orders) => {
        const sorted = orders.sort((a, b) => {
          const aPrice = new Decimal(a.account.takingAmount.toString()).div(
            a.account.makingAmount.toString()
          );
          const bPrice = new Decimal(b.account.takingAmount.toString()).div(
            b.account.makingAmount.toString()
          );
          return aPrice.cmp(bPrice);
        });
        const best = sorted[0];
        if (PRIORITY_INPUT_MINTS.has(best.account.inputMint.toBase58())) {
          priorityOrders.push(best);
        } else {
          otherOrders.push(best);
        }
      });

      // Shuffle the "other" orders to cover different obscure pairs each cycle
      for (let i = otherOrders.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherOrders[i], otherOrders[j]] = [otherOrders[j], otherOrders[i]];
      }

      // Priority orders first, then random others, capped at maxOrdersPerCycle
      const filterOrders = [
        ...priorityOrders,
        ...otherOrders,
      ].slice(0, CONFIG.maxOrdersPerCycle);
      const pairsCount = Object.keys(pendingOrderGroup).length;
      logger.info(`Order selection`, {
        totalPairs: pairsCount,
        priorityPairs: priorityOrders.length,
        otherPairs: otherOrders.length,
        checking: filterOrders.length,
        cachedSkips: failedPairCache.size,
      });

      // Update dashboard with order stats
      updateDashboard({
        totalOrders: pendingOrders.length,
        liquidOrders: liquidOrders.length,
        pairsCount,
        cachedPairs: failedPairCache.size,
      });

      // Process each order
      for (const order of filterOrders) {
        if (!running) break;
        stats.ordersChecked++;

        const {
          account: {
            makingAmount,
            takingAmount,
            inputMint,
            outputMint,
            makerOutputAccount,
          },
          publicKey,
        } = order;

        const orderKey = publicKey.toBase58().slice(0, 8);
        logger.debug(`Checking order ${orderKey}`, {
          inputMint: inputMint.toBase58().slice(0, 8),
          outputMint: outputMint.toBase58().slice(0, 8),
          makingAmount: makingAmount.toString(),
          takingAmount: takingAmount.toString(),
        });

        // Skip if maker output account is closed
        if (CONFIG.skipClosedMakerAccounts) {
          const acctCheckStart = Date.now();
          const makerOutputAccountInfo =
            await connection.getAccountInfo(makerOutputAccount);
          const acctCheckMs = Date.now() - acctCheckStart;
          if (!makerOutputAccountInfo) {
            logger.debug(`Skipping order ${orderKey}: maker output account closed`, { rpcTimeMs: acctCheckMs });
            stats.ordersSkipped++;
            addRecentOrder({
              timestamp: new Date().toISOString(),
              orderKey,
              inputMint: inputMint.toBase58(),
              outputMint: outputMint.toBase58(),
              profitBps: 0,
              txid: null,
              status: "skipped",
              reason: "Maker account closed",
            });
            continue;
          }
        }

        // Get Jupiter quote
        const quoteStart = Date.now();
        const route = await getQuote(
          inputMint,
          outputMint,
          makingAmount.toString()
        );
        const quoteMs = Date.now() - quoteStart;
        if (!route) {
          logger.debug(`Skipping order ${orderKey}: no route found`, { quoteTimeMs: quoteMs });
          stats.ordersSkipped++;
          addRecentOrder({
            timestamp: new Date().toISOString(),
            orderKey,
            inputMint: inputMint.toBase58(),
            outputMint: outputMint.toBase58(),
            profitBps: 0,
            txid: null,
            status: "skipped",
            reason: "No route",
          });
          continue;
        }

        const quoteOutAmount = new BN(route.outAmount);
        logger.info(`Quote received for ${orderKey}`, {
          quoteTimeMs: quoteMs,
          inAmount: makingAmount.toString(),
          outAmount: route.outAmount,
          priceImpact: route.priceImpactPct,
        });

        // Calculate taking amount with taker fee
        const takerFee = getTakerFee(inputMint, outputMint, fee);
        const takingAmountWithTakerFee = takingAmount
          .muln(10000 + takerFee)
          .divn(10000);

        // Check profitability
        const profitLamports = quoteOutAmount.sub(takingAmountWithTakerFee);
        const profitBps = quoteOutAmount.gt(new BN(0))
          ? profitLamports.muln(10000).div(quoteOutAmount).toNumber()
          : 0;

        if (quoteOutAmount.lt(takingAmountWithTakerFee)) {
          const gap = new Decimal(takingAmountWithTakerFee.toString())
            .div(quoteOutAmount.toString())
            .toFixed(2);
          logger.info(`Order ${orderKey} NOT profitable`, {
            quoteOut: quoteOutAmount.toString(),
            required: takingAmountWithTakerFee.toString(),
            gapMultiple: gap + "x",
            takerFeeBps: takerFee,
          });
          stats.ordersSkipped++;
          continue;
        }

        if (profitBps < CONFIG.minProfitBps) {
          logger.debug(
            `Order ${orderKey} below min profit threshold (${profitBps} < ${CONFIG.minProfitBps} bps)`
          );
          stats.ordersSkipped++;
          continue;
        }

        logger.info(`Executing order ${orderKey}`, {
          profitBps,
          quoteOut: quoteOutAmount.toString(),
          required: takingAmountWithTakerFee.toString(),
        });

        try {
          // Balance check before execution
          const balanceOk = await validateBalance(
            connection,
            wallet.publicKey
          );
          if (!balanceOk) {
            logger.warn("Insufficient SOL, skipping execution");
            stats.ordersSkipped++;
            break; // break out of order loop, wait for next cycle
          }

          // Get swap transaction
          const swapResult = await getSwapIx(wallet.publicKey, route);
          if (!swapResult) {
            logger.error(`Failed to get swap tx for order ${orderKey}`);
            stats.ordersFailed++;
            continue;
          }

          const swapTransactionBuf = Buffer.from(
            swapResult.swapTransaction,
            "base64"
          );
          const swapTransaction =
            VersionedTransaction.deserialize(swapTransactionBuf);

          // Resolve address lookup tables
          const swapALT = await Promise.all(
            swapTransaction.message.addressTableLookups.map(async (lookup) => {
              return new AddressLookupTableAccount({
                key: lookup.accountKey,
                state: AddressLookupTableAccount.deserialize(
                  await connection
                    .getAccountInfo(lookup.accountKey)
                    .then((res) => res!.data)
                ),
              });
            })
          );

          const txMessage = TransactionMessage.decompile(
            swapTransaction.message,
            { addressLookupTableAccounts: swapALT }
          );

          // Get fill order instruction
          const limitOrderTx = await limitOrder.fillOrder({
            owner: wallet.publicKey,
            orderAccount: order,
            amount: makingAmount,
            expectedOutAmount: takingAmount,
          });

          // Combine swap + fill instructions
          txMessage.instructions.push(...limitOrderTx.instructions);
          txMessage.recentBlockhash = (
            await connection.getLatestBlockhash()
          ).blockhash;
          swapTransaction.message = txMessage.compileToV0Message([...swapALT]);
          swapTransaction.sign([wallet.payer]);

          // Send transaction
          const txid = await connection.sendRawTransaction(
            swapTransaction.serialize(),
            { skipPreflight: true, maxRetries: 2 }
          );

          logger.info(`Order executed successfully`, {
            order: orderKey,
            txid,
            profitBps,
            solscan: `https://solscan.io/tx/${txid}`,
          });

          stats.ordersExecuted++;
          stats.totalProfit = stats.totalProfit.add(
            new Decimal(profitLamports.toString())
          );

          addRecentOrder({
            timestamp: new Date().toISOString(),
            orderKey,
            inputMint: inputMint.toBase58(),
            outputMint: outputMint.toBase58(),
            profitBps,
            txid,
            status: "executed",
          });

          // Update balance after execution
          const postBal = await checkBalance(connection, wallet.publicKey);
          updateDashboard({ solBalance: postBal.solBalance });
        } catch (err) {
          logger.error(`Failed to execute order ${orderKey}`, {
            error: String(err),
          });
          stats.ordersFailed++;

          addRecentOrder({
            timestamp: new Date().toISOString(),
            orderKey,
            inputMint: inputMint.toBase58(),
            outputMint: outputMint.toBase58(),
            profitBps,
            txid: null,
            status: "failed",
            reason: String(err).slice(0, 80),
          });
        }

        await new Promise((r) => setTimeout(r, CONFIG.orderDelayMs));
      }

      // Cycle summary
      const cycleMs = Date.now() - cycleStart;
      logger.info(`── Cycle ${stats.cycleCount} complete ──`, {
        durationMs: cycleMs,
        checked: filterOrders.length,
        executed: stats.ordersExecuted,
        skipped: stats.ordersSkipped,
        cachedPairs: failedPairCache.size,
      });

      // Log stats every 10 cycles
      if (stats.cycleCount % 10 === 0) {
        logStats();
      }
    } catch (err) {
      logger.error("Cycle error", { error: String(err) });
    }

    await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
  }

  logger.info("Keeper bot stopped");
  logStats();
}

main();
