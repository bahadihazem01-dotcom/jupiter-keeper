import http from "http";
import { logger, onLogEntry, getLogBuffer, LogEntry } from "./logger";
import { CONFIG } from "./config";

export interface DashboardData {
  wallet: string;
  solBalance: number;
  minSolBalance: number;
  stats: {
    cycleCount: number;
    ordersChecked: number;
    ordersExecuted: number;
    ordersFailed: number;
    ordersSkipped: number;
  };
  recentOrders: RecentOrder[];
  startedAt: string;
  uptimeSeconds: number;
  totalOrders: number;
  liquidOrders: number;
  pairsCount: number;
  cachedPairs: number;
  config: {
    rpc: string;
    pollIntervalMs: number;
    minProfitBps: number;
    slippageBps: number;
    maxOrdersPerCycle: number;
  };
}

export interface RecentOrder {
  timestamp: string;
  orderKey: string;
  inputMint: string;
  outputMint: string;
  profitBps: number;
  txid: string | null;
  status: "executed" | "failed" | "skipped";
  reason?: string;
}

let dashboardData: DashboardData = {
  wallet: "",
  solBalance: 0,
  minSolBalance: CONFIG.minSolBalance,
  stats: {
    cycleCount: 0,
    ordersChecked: 0,
    ordersExecuted: 0,
    ordersFailed: 0,
    ordersSkipped: 0,
  },
  recentOrders: [],
  startedAt: new Date().toISOString(),
  uptimeSeconds: 0,
  totalOrders: 0,
  liquidOrders: 0,
  pairsCount: 0,
  cachedPairs: 0,
  config: {
    rpc: CONFIG.rpcEndpoint.replace(/\/\/.*@/, "//***@"),
    pollIntervalMs: CONFIG.pollIntervalMs,
    minProfitBps: CONFIG.minProfitBps,
    slippageBps: CONFIG.slippageBps,
    maxOrdersPerCycle: CONFIG.maxOrdersPerCycle,
  },
};

const startTime = Date.now();
const MAX_RECENT_ORDERS = 50;
const sseClients: Set<http.ServerResponse> = new Set();
const logClients: Set<http.ServerResponse> = new Set();

export function updateDashboard(partial: Partial<DashboardData>) {
  Object.assign(dashboardData, partial);
  dashboardData.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  broadcastSSE();
}

export function addRecentOrder(order: RecentOrder) {
  dashboardData.recentOrders.unshift(order);
  if (dashboardData.recentOrders.length > MAX_RECENT_ORDERS) {
    dashboardData.recentOrders = dashboardData.recentOrders.slice(
      0,
      MAX_RECENT_ORDERS
    );
  }
  dashboardData.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  broadcastSSE();
}

function broadcastSSE() {
  const data = JSON.stringify(dashboardData);
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jupiter Keeper Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0a0e17;
      color: #e1e4e8;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
      border-bottom: 1px solid #21262d;
      padding: 20px 30px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 600;
      color: #c9f464;
    }
    .header .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #8b949e;
    }
    .header .status .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3fb950;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 10px;
      padding: 20px;
    }
    .card .label {
      font-size: 12px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .card .value {
      font-size: 28px;
      font-weight: 700;
    }
    .card .sub {
      font-size: 12px;
      color: #8b949e;
      margin-top: 4px;
    }
    .green { color: #3fb950; }
    .red { color: #f85149; }
    .yellow { color: #d29922; }
    .blue { color: #58a6ff; }
    .purple { color: #bc8cff; }

    .section {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 10px;
      margin-bottom: 24px;
      overflow: hidden;
    }
    .section-header {
      padding: 16px 20px;
      border-bottom: 1px solid #21262d;
      font-size: 14px;
      font-weight: 600;
      color: #c9d1d9;
    }

    .config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1px;
      background: #21262d;
    }
    .config-item {
      background: #161b22;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .config-item .key { color: #8b949e; font-size: 13px; }
    .config-item .val { color: #e1e4e8; font-size: 13px; font-family: monospace; }

    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      padding: 10px 16px;
      font-size: 12px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #21262d;
    }
    td {
      padding: 10px 16px;
      font-size: 13px;
      border-bottom: 1px solid #21262d;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: #1c2128; }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-executed { background: #0d3321; color: #3fb950; }
    .badge-failed { background: #3d1418; color: #f85149; }
    .badge-skipped { background: #2d2000; color: #d29922; }

    .mono { font-family: monospace; font-size: 12px; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .wallet-info {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
    }
    .wallet-info .address {
      font-family: monospace;
      font-size: 13px;
      color: #58a6ff;
    }

    .empty-state {
      padding: 40px;
      text-align: center;
      color: #8b949e;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Jupiter Keeper</h1>
    <div style="display:flex;align-items:center;gap:16px;">
      <button id="exportBtn" onclick="exportData()" style="background:linear-gradient(135deg,#238636,#2ea043);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">Export All Data</button>
      <div class="status">
        <div class="dot" id="statusDot"></div>
        <span id="statusText">Connecting...</span>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="cards">
      <div class="card">
        <div class="label">SOL Balance</div>
        <div class="value blue" id="solBalance">--</div>
        <div class="sub">Min: <span id="minSol">--</span> SOL</div>
      </div>
      <div class="card">
        <div class="label">Orders Executed</div>
        <div class="value green" id="executed">0</div>
        <div class="sub">Total successful fills</div>
      </div>
      <div class="card">
        <div class="label">Orders Skipped</div>
        <div class="value yellow" id="skipped">0</div>
        <div class="sub">Not profitable / no route</div>
      </div>
      <div class="card">
        <div class="label">Orders Failed</div>
        <div class="value red" id="failed">0</div>
        <div class="sub">Transaction errors</div>
      </div>
      <div class="card">
        <div class="label">Cycles</div>
        <div class="value purple" id="cycles">0</div>
        <div class="sub">Orders checked: <span id="checked">0</span></div>
      </div>
      <div class="card">
        <div class="label">Uptime</div>
        <div class="value" id="uptime">--</div>
        <div class="sub" id="startedAt">--</div>
      </div>
    </div>

    <div class="cards" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
      <div class="card">
        <div class="label">Total Orders</div>
        <div class="value" style="font-size:22px;color:#8b949e;" id="totalOrders">--</div>
        <div class="sub">On-chain limit orders</div>
      </div>
      <div class="card">
        <div class="label">Liquid Orders</div>
        <div class="value" style="font-size:22px;color:#58a6ff;" id="liquidOrders">--</div>
        <div class="sub">SOL/USDC/USDT output</div>
      </div>
      <div class="card">
        <div class="label">Token Pairs</div>
        <div class="value" style="font-size:22px;color:#bc8cff;" id="pairsCount">--</div>
        <div class="sub">Unique pairs monitored</div>
      </div>
      <div class="card">
        <div class="label">Cached (No Route)</div>
        <div class="value" style="font-size:22px;color:#d29922;" id="cachedPairs">--</div>
        <div class="sub">Skipped for 5 min</div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">Wallet</div>
      <div class="wallet-info">
        <span class="address" id="walletAddress">--</span>
        <a id="walletLink" href="#" target="_blank">View on Solscan</a>
      </div>
    </div>

    <div class="section">
      <div class="section-header">Recent Orders</div>
      <div id="ordersTable">
        <div class="empty-state">Waiting for orders...</div>
      </div>
    </div>

    <div class="section">
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;">
        <span>Live Terminal</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <label style="font-size:11px;color:#8b949e;cursor:pointer;"><input type="checkbox" id="autoScroll" checked style="margin-right:4px;">Auto-scroll</label>
          <select id="logFilter" style="background:#0d1117;color:#e1e4e8;border:1px solid #30363d;border-radius:4px;padding:2px 6px;font-size:11px;">
            <option value="ALL">All Levels</option>
            <option value="INFO">INFO only</option>
            <option value="WARN">WARN+</option>
            <option value="ERROR">ERROR only</option>
          </select>
          <button onclick="document.getElementById('logContainer').innerHTML=''" style="background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Clear</button>
        </div>
      </div>
      <div id="logContainer" style="height:400px;overflow-y:auto;padding:12px;font-family:'Cascadia Code','Fira Code',monospace;font-size:12px;line-height:1.6;background:#0d1117;"></div>
    </div>

    <div class="section">
      <div class="section-header">Configuration</div>
      <div class="config-grid" id="configGrid">
      </div>
    </div>
  </div>

  <script>
    function formatUptime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return h + 'h ' + m + 'm';
      if (m > 0) return m + 'm ' + s + 's';
      return s + 's';
    }

    function shortAddr(addr) {
      if (!addr || addr.length < 12) return addr || '--';
      return addr.slice(0, 4) + '...' + addr.slice(-4);
    }

    function update(data) {
      document.getElementById('statusDot').style.background = '#3fb950';
      document.getElementById('statusText').textContent = 'Running - Cycle ' + data.stats.cycleCount;

      document.getElementById('solBalance').textContent = data.solBalance.toFixed(4);
      document.getElementById('minSol').textContent = data.minSolBalance;
      document.getElementById('executed').textContent = data.stats.ordersExecuted;
      document.getElementById('skipped').textContent = data.stats.ordersSkipped;
      document.getElementById('failed').textContent = data.stats.ordersFailed;
      document.getElementById('cycles').textContent = data.stats.cycleCount;
      document.getElementById('checked').textContent = data.stats.ordersChecked;
      document.getElementById('uptime').textContent = formatUptime(data.uptimeSeconds);
      document.getElementById('startedAt').textContent = 'Since ' + new Date(data.startedAt).toLocaleString();

      document.getElementById('totalOrders').textContent = (data.totalOrders || 0).toLocaleString();
      document.getElementById('liquidOrders').textContent = (data.liquidOrders || 0).toLocaleString();
      document.getElementById('pairsCount').textContent = (data.pairsCount || 0).toLocaleString();
      document.getElementById('cachedPairs').textContent = (data.cachedPairs || 0).toLocaleString();

      if (data.wallet) {
        document.getElementById('walletAddress').textContent = data.wallet;
        var link = document.getElementById('walletLink');
        link.href = 'https://solscan.io/account/' + data.wallet;
      }

      // Config
      var configHTML = '';
      var configs = [
        ['RPC Endpoint', data.config.rpc],
        ['Poll Interval', data.config.pollIntervalMs + ' ms'],
        ['Min Profit', data.config.minProfitBps + ' bps'],
        ['Slippage', data.config.slippageBps + ' bps'],
        ['Max Orders/Cycle', data.config.maxOrdersPerCycle],
      ];
      configs.forEach(function(c) {
        configHTML += '<div class="config-item"><span class="key">' + c[0] + '</span><span class="val">' + c[1] + '</span></div>';
      });
      document.getElementById('configGrid').innerHTML = configHTML;

      // Orders table
      if (data.recentOrders.length === 0) {
        document.getElementById('ordersTable').innerHTML = '<div class="empty-state">Waiting for orders...</div>';
        return;
      }

      var html = '<table><thead><tr><th>Time</th><th>Order</th><th>Pair</th><th>Profit</th><th>Status</th><th>Tx</th></tr></thead><tbody>';
      data.recentOrders.forEach(function(o) {
        var badge = 'badge-' + o.status;
        var time = new Date(o.timestamp).toLocaleTimeString();
        var pair = shortAddr(o.inputMint) + ' → ' + shortAddr(o.outputMint);
        var tx = o.txid ? '<a href="https://solscan.io/tx/' + o.txid + '" target="_blank">' + o.txid.slice(0, 8) + '...</a>' : (o.reason || '--');
        html += '<tr>';
        html += '<td class="mono">' + time + '</td>';
        html += '<td class="mono">' + o.orderKey + '</td>';
        html += '<td class="mono">' + pair + '</td>';
        html += '<td>' + o.profitBps + ' bps</td>';
        html += '<td><span class="badge ' + badge + '">' + o.status + '</span></td>';
        html += '<td class="mono">' + tx + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      document.getElementById('ordersTable').innerHTML = html;
    }

    // Server-Sent Events for live updates
    var evtSource = new EventSource('/events');
    evtSource.onmessage = function(e) {
      update(JSON.parse(e.data));
    };
    evtSource.onerror = function() {
      document.getElementById('statusDot').style.background = '#f85149';
      document.getElementById('statusText').textContent = 'Disconnected';
    };

    // Also fetch initial data
    fetch('/api/data').then(function(r) { return r.json(); }).then(update);

    // Log colors
    var levelColors = {
      INFO: '#3fb950',
      WARN: '#d29922',
      ERROR: '#f85149',
      DEBUG: '#8b949e'
    };

    var levelPriority = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

    function shouldShowLog(level) {
      var filter = document.getElementById('logFilter').value;
      if (filter === 'ALL') return true;
      if (filter === 'INFO') return level === 'INFO';
      if (filter === 'WARN') return levelPriority[level] >= 2;
      if (filter === 'ERROR') return level === 'ERROR';
      return true;
    }

    function addLogLine(entry) {
      if (!shouldShowLog(entry.level)) return;
      var container = document.getElementById('logContainer');
      var line = document.createElement('div');
      var time = entry.timestamp.split('T')[1].replace('Z','');
      var color = levelColors[entry.level] || '#e1e4e8';
      var dataStr = entry.data ? ' ' + JSON.stringify(entry.data) : '';
      line.innerHTML = '<span style="color:#6e7681">' + time + '</span> <span style="color:' + color + ';font-weight:600">[' + entry.level + ']</span> ' + entry.message + '<span style="color:#6e7681">' + dataStr + '</span>';
      line.style.borderBottom = '1px solid #161b22';
      line.style.padding = '1px 0';
      container.appendChild(line);

      // Keep max 500 lines in DOM
      while (container.children.length > 500) {
        container.removeChild(container.firstChild);
      }

      if (document.getElementById('autoScroll').checked) {
        container.scrollTop = container.scrollHeight;
      }
    }

    // SSE for live logs
    var logSource = new EventSource('/logs');
    logSource.onmessage = function(e) {
      var entry = JSON.parse(e.data);
      addLogLine(entry);
    };

    // Re-filter when filter changes
    document.getElementById('logFilter').addEventListener('change', function() {
      document.getElementById('logContainer').innerHTML = '';
      fetch('/api/logs').then(function(r) { return r.json(); }).then(function(logs) {
        logs.forEach(addLogLine);
      });
    });

    // Load initial logs
    fetch('/api/logs').then(function(r) { return r.json(); }).then(function(logs) {
      logs.forEach(addLogLine);
    });

    // Export all data
    function exportData() {
      fetch('/api/export').then(function(r) { return r.json(); }).then(function(data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'jupiter-keeper-export-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  </script>
</body>
</html>`;
}

export function startDashboardServer(port: number = 3000): http.Server {
  // Forward log entries to SSE log clients
  onLogEntry((entry) => {
    const data = JSON.stringify(entry);
    for (const client of logClients) {
      client.write(`data: ${data}\n\n`);
    }
  });

  const server = http.createServer((req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));

      // Send initial data
      dashboardData.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
      res.write(`data: ${JSON.stringify(dashboardData)}\n\n`);
      return;
    }

    if (req.url === "/logs") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      logClients.add(res);
      req.on("close", () => logClients.delete(res));

      // Send buffered logs
      for (const entry of getLogBuffer()) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
      return;
    }

    if (req.url === "/api/logs") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(getLogBuffer()));
      return;
    }

    if (req.url === "/api/export") {
      dashboardData.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
      const exportData = {
        exportedAt: new Date().toISOString(),
        dashboard: dashboardData,
        logs: getLogBuffer(),
      };
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(exportData));
      return;
    }

    if (req.url === "/api/data") {
      dashboardData.uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(dashboardData));
      return;
    }

    // Serve dashboard HTML
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getHTML());
  });

  server.listen(port, () => {
    logger.info(`Dashboard running at http://localhost:${port}`);
  });

  return server;
}
