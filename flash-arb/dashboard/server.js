const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- State ----
let botProcess = null;
let jupiterProcess = null;
let botLogs = [];
let jupiterLogs = [];
const MAX_LOGS = 500;

const FLASH_ARB_DIR = path.resolve(__dirname, "..");

// ---- Helpers ----

function getConfigPath(name) {
  return path.join(FLASH_ARB_DIR, name);
}

function readConfig(name) {
  const p = getConfigPath(name);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  const example = getConfigPath(name.replace(".toml", ".example.toml"));
  if (fs.existsSync(example)) return fs.readFileSync(example, "utf-8");
  return "";
}

function getRpcUrl() {
  const config = readConfig("bot-config.toml");
  const match = config.match(/url\s*=\s*"(https:\/\/[^"]+)"/);
  return match ? match[1] : "https://api.mainnet-beta.solana.com";
}

function getKeypairPath() {
  const config = readConfig("bot-config.toml");
  const match = config.match(/keypair_path\s*=\s*"([^"]+)"/);
  if (!match) return null;
  const kp = match[1];
  if (path.isAbsolute(kp)) return kp;
  return path.join(FLASH_ARB_DIR, kp);
}

function getPublicKey() {
  const kpPath = getKeypairPath();
  if (!kpPath || !fs.existsSync(kpPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(kpPath, "utf-8"));
    const { Keypair } = require("@solana/web3.js");
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    return kp.publicKey.toBase58();
  } catch {
    return null;
  }
}

function pushLog(arr, line) {
  arr.push({ time: new Date().toISOString(), text: line });
  if (arr.length > MAX_LOGS) arr.shift();
}

// ---- API Routes ----

// Get wallet info
app.get("/api/wallet", async (_req, res) => {
  const pubkey = getPublicKey();
  if (!pubkey) return res.json({ address: null, balance: 0, error: "No wallet found" });

  try {
    const rpc = getRpcUrl();
    const conn = new Connection(rpc, "confirmed");
    const balance = await conn.getBalance(new PublicKey(pubkey));
    const solBalance = balance / LAMPORTS_PER_SOL;
    const txCapacity = Math.floor(balance / 5000); // ~5000 lamports per tx
    res.json({ address: pubkey, balance: solBalance, txCapacity, rpc });
  } catch (e) {
    res.json({ address: pubkey, balance: 0, txCapacity: 0, error: e.message });
  }
});

// Get/save config
app.get("/api/config/:name", (req, res) => {
  const content = readConfig(req.params.name + ".toml");
  res.json({ content });
});

app.post("/api/config/:name", (req, res) => {
  const p = getConfigPath(req.params.name + ".toml");
  fs.writeFileSync(p, req.body.content, "utf-8");
  res.json({ ok: true });
});

// Bot status
app.get("/api/status", (_req, res) => {
  res.json({
    bot: botProcess ? "running" : "stopped",
    jupiter: jupiterProcess ? "running" : "stopped",
  });
});

// Start Jupiter
app.post("/api/jupiter/start", (_req, res) => {
  if (jupiterProcess) return res.json({ ok: false, error: "Already running" });

  const script = path.join(FLASH_ARB_DIR, "start-jupiter.sh");
  if (!fs.existsSync(script)) return res.json({ ok: false, error: "start-jupiter.sh not found" });

  jupiterLogs = [];
  jupiterProcess = spawn("bash", [script], { cwd: FLASH_ARB_DIR });
  jupiterProcess.stdout.on("data", (d) => pushLog(jupiterLogs, d.toString()));
  jupiterProcess.stderr.on("data", (d) => pushLog(jupiterLogs, d.toString()));
  jupiterProcess.on("close", () => { jupiterProcess = null; pushLog(jupiterLogs, "Jupiter server stopped."); });
  res.json({ ok: true });
});

// Stop Jupiter
app.post("/api/jupiter/stop", (_req, res) => {
  if (!jupiterProcess) return res.json({ ok: false, error: "Not running" });
  jupiterProcess.kill("SIGINT");
  jupiterProcess = null;
  res.json({ ok: true });
});

// Start Bot
app.post("/api/bot/start", (_req, res) => {
  if (botProcess) return res.json({ ok: false, error: "Already running" });

  const script = path.join(FLASH_ARB_DIR, "start-bot.sh");
  if (!fs.existsSync(script)) return res.json({ ok: false, error: "start-bot.sh not found" });

  botLogs = [];
  botProcess = spawn("bash", [script], { cwd: FLASH_ARB_DIR });
  botProcess.stdout.on("data", (d) => pushLog(botLogs, d.toString()));
  botProcess.stderr.on("data", (d) => pushLog(botLogs, d.toString()));
  botProcess.on("close", () => { botProcess = null; pushLog(botLogs, "Bot stopped."); });
  res.json({ ok: true });
});

// Stop Bot
app.post("/api/bot/stop", (_req, res) => {
  if (!botProcess) return res.json({ ok: false, error: "Not running" });
  botProcess.kill("SIGINT");
  botProcess = null;
  res.json({ ok: true });
});

// Get logs
app.get("/api/logs/bot", (_req, res) => res.json(botLogs.slice(-100)));
app.get("/api/logs/jupiter", (_req, res) => res.json(jupiterLogs.slice(-100)));

// Check if setup is done
app.get("/api/setup-status", (_req, res) => {
  const hasConfig = fs.existsSync(getConfigPath("bot-config.toml"));
  const hasJupiterConfig = fs.existsSync(getConfigPath("jupiter-config.toml"));
  const hasWallet = getPublicKey() !== null;
  const hasNotarb = fs.existsSync(path.join(FLASH_ARB_DIR, "notarb"));

  res.json({ hasConfig, hasJupiterConfig, hasWallet, hasNotarb });
});

// Quick setup — create configs from examples
app.post("/api/quick-setup", (req, res) => {
  const { heliusApiKey } = req.body;

  // Copy example configs
  for (const name of ["bot-config", "jupiter-config"]) {
    const dest = getConfigPath(name + ".toml");
    const src = getConfigPath(name + ".example.toml");
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      let content = fs.readFileSync(src, "utf-8");
      if (heliusApiKey) {
        content = content.replace(/YOUR_HELIUS_API_KEY/g, heliusApiKey);
      }
      fs.writeFileSync(dest, content, "utf-8");
    }
  }

  // Generate wallet if needed
  const walletDir = path.join(FLASH_ARB_DIR, "wallet");
  if (!fs.existsSync(walletDir)) fs.mkdirSync(walletDir, { recursive: true });

  const kpFile = path.join(walletDir, "fee-payer.json");
  if (!fs.existsSync(kpFile)) {
    const { Keypair } = require("@solana/web3.js");
    const kp = Keypair.generate();
    fs.writeFileSync(kpFile, JSON.stringify(Array.from(kp.secretKey)));
  }

  res.json({ ok: true, wallet: getPublicKey() });
});

// ---- Start Server ----
app.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  FLASH LOAN ARBITRAGE DASHBOARD                  ║");
  console.log("║                                                  ║");
  console.log(`║  Open in browser: http://localhost:${PORT}           ║`);
  console.log("║                                                  ║");
  console.log("║  Zero collateral. Zero risk. Just gas fees.      ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
});
