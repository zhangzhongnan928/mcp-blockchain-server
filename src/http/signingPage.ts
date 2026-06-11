/**
 * Self-contained transaction signing page.
 *
 * Plain HTML + vanilla JS that talks to the injected `window.ethereum` wallet
 * (MetaMask, Rabby, etc.). No framework, no bundler, no external scripts — so
 * there is nothing extra to build or deploy. The wallet signs **and** broadcasts
 * the transaction (`eth_sendTransaction`); the server is only told the hash.
 *
 * Transaction data is rendered with `textContent` (never innerHTML) and the
 * single inline script is gated behind a per-request CSP nonce.
 */
export function renderSigningPage(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Review &amp; Sign Transaction</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0;
         background: #0b1020; color: #e7ebf3; display: flex; min-height: 100vh; }
  .wrap { max-width: 560px; margin: auto; padding: 24px; width: 100%; }
  .card { background: #141b2e; border: 1px solid #243049; border-radius: 16px; overflow: hidden; }
  .card h1 { font-size: 18px; margin: 0; padding: 20px 24px; border-bottom: 1px solid #243049; }
  .body { padding: 20px 24px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #1d2740; }
  .row:last-child { border-bottom: 0; }
  .row .k { color: #8b97b3; flex: 0 0 auto; }
  .row .v { text-align: right; word-break: break-all; font-variant-numeric: tabular-nums; }
  .amount { font-size: 26px; font-weight: 600; text-align: center; padding: 8px 0 16px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .s-PENDING { background:#3a2f00; color:#ffd34d; }
  .s-SUBMITTED { background:#062b45; color:#5cc8ff; }
  .s-CONFIRMED { background:#04331f; color:#43d391; }
  .s-FAILED, .s-REJECTED { background:#3a0d10; color:#ff7a85; }
  .actions { display: flex; gap: 12px; margin-top: 20px; }
  button { flex: 1; padding: 12px 16px; font-size: 15px; font-weight: 600; border-radius: 12px;
           border: 0; cursor: pointer; transition: opacity .15s; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .primary { background: #4d7cff; color: #fff; }
  .ghost { background: transparent; color: #aab4cd; border: 1px solid #2c3955; }
  .full { width: 100%; }
  .msg { margin-top: 16px; padding: 12px 14px; border-radius: 10px; font-size: 14px; display: none; }
  .msg.error { background:#3a0d10; color:#ff9aa3; display:block; }
  .msg.success { background:#04331f; color:#6fe0a8; display:block; }
  .msg.info { background:#0e2034; color:#8fd0ff; display:block; }
  .muted { color: #8b97b3; font-size: 12px; text-align: center; margin-top: 14px; }
  a { color: #6ea8ff; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Review &amp; Sign</h1>
      <div class="body">
        <div id="loading" class="muted">Loading transaction…</div>

        <div id="content" style="display:none">
          <div class="amount"><span id="amount">—</span></div>
          <div class="row"><span class="k">Status</span><span class="v"><span id="badge" class="badge"></span></span></div>
          <div class="row"><span class="k">Network</span><span class="v" id="net"></span></div>
          <div class="row"><span class="k">To</span><span class="v" id="to"></span></div>
          <div class="row" id="acct-row" style="display:none"><span class="k">From</span><span class="v" id="account"></span></div>
          <div class="row" id="data-row" style="display:none"><span class="k">Data</span><span class="v" id="data"></span></div>
          <div class="row" id="gas-row" style="display:none"><span class="k">Gas limit</span><span class="v" id="gas"></span></div>
          <div class="row" id="hash-row" style="display:none"><span class="k">Tx hash</span><span class="v" id="hash"></span></div>

          <div id="connect-wrap" class="actions">
            <button id="connectBtn" class="primary full">Connect Wallet</button>
          </div>

          <div id="actions" class="actions" style="display:none">
            <button id="rejectBtn" class="ghost">Reject</button>
            <button id="approveBtn" class="primary" disabled>Approve &amp; Sign</button>
          </div>

          <div id="message" class="msg"></div>
        </div>
      </div>
    </div>
    <div class="muted">Your keys never leave your wallet. This page only relays the transaction hash.</div>
  </div>

<script nonce="${nonce}">
(function () {
  var txId = location.pathname.split('/').filter(Boolean).pop();
  var state = { tx: null, chain: null, account: null };

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).style.display = ''; }
  function hide(id) { $(id).style.display = 'none'; }
  function setMsg(t, kind) {
    var el = $('message');
    el.textContent = t || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  async function api(path, opts) {
    var r = await fetch(path, opts);
    var body = {};
    try { body = await r.json(); } catch (e) {}
    if (!r.ok) { throw new Error(body && body.error ? body.error : 'Request failed (' + r.status + ')'); }
    return body;
  }

  function chainHex() { return '0x' + parseInt(state.chain.chainId, 10).toString(16); }

  function render() {
    var tx = state.tx, chain = state.chain;
    $('amount').textContent = tx.valueDisplay + ' ' + chain.currency;
    $('net').textContent = chain.name + ' (chain ' + chain.chainId + ')';
    $('to').textContent = tx.to;

    var badge = $('badge');
    badge.textContent = tx.status;
    badge.className = 'badge s-' + tx.status;

    if (tx.data && tx.data !== '0x') { $('data').textContent = tx.data; show('data-row'); }
    if (tx.gasLimitHex) { $('gas').textContent = parseInt(tx.gasLimitHex, 16).toString(); show('gas-row'); }

    if (tx.txHash) {
      var a = document.createElement('a');
      a.href = chain.explorerUrl + '/tx/' + tx.txHash;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = tx.txHash.slice(0, 12) + '…' + tx.txHash.slice(-8);
      var cell = $('hash'); cell.textContent = ''; cell.appendChild(a);
      show('hash-row');
    }

    if (tx.status !== 'PENDING') {
      hide('connect-wrap'); hide('actions');
      if (tx.status === 'SUBMITTED') setMsg('Transaction submitted. Waiting for confirmation…', 'info');
      else if (tx.status === 'CONFIRMED') setMsg('Transaction confirmed on-chain.', 'success');
      else if (tx.status === 'REJECTED') setMsg('This transaction was rejected.', 'error');
      else if (tx.status === 'FAILED') setMsg('Transaction failed: ' + (tx.error || 'reverted on-chain'), 'error');
    }
  }

  async function load() {
    try {
      var data = await api('/api/tx/' + txId);
      state.tx = data.transaction;
      state.chain = data.chain;
      hide('loading'); show('content');
      render();
      if (state.tx.status === 'PENDING' && !window.ethereum) {
        setMsg('No EVM wallet detected. Install MetaMask (or a compatible wallet) to sign.', 'error');
      }
    } catch (e) {
      $('loading').textContent = 'Could not load transaction: ' + e.message;
    }
  }

  async function connect() {
    if (!window.ethereum) { setMsg('No EVM wallet detected. Install MetaMask to continue.', 'error'); return; }
    try {
      var accts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      state.account = accts[0];
      $('account').textContent = state.account;
      show('acct-row');
      hide('connect-wrap'); show('actions');
      $('approveBtn').disabled = false;
      setMsg('', '');
    } catch (e) { setMsg(e.message || 'Failed to connect wallet', 'error'); }
  }

  async function ensureNetwork() {
    var want = chainHex();
    var current = await window.ethereum.request({ method: 'eth_chainId' });
    if (current === want) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
    } catch (err) {
      if (err && err.code === 4902) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [state.chain.addParams] });
      } else { throw err; }
    }
  }

  function setBusy(b) {
    $('approveBtn').disabled = b || !state.account;
    $('rejectBtn').disabled = b;
  }

  async function approve() {
    if (!state.account) { setMsg('Connect your wallet first.', 'error'); return; }
    setBusy(true);
    setMsg('Confirm the transaction in your wallet…', 'info');
    try {
      await ensureNetwork();
      var p = { from: state.account, to: state.tx.to, value: state.tx.valueWeiHex, data: state.tx.data };
      if (state.tx.gasLimitHex) p.gas = state.tx.gasLimitHex;
      var hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [p] });
      await api('/api/tx/' + txId + '/submitted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash, from: state.account })
      });
      state.tx.status = 'SUBMITTED';
      state.tx.txHash = hash;
      render();
      poll();
    } catch (e) {
      setBusy(false);
      var msg = e && e.message ? e.message : 'Transaction failed';
      setMsg(msg, 'error');
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await api('/api/tx/' + txId + '/rejected', { method: 'POST' });
      state.tx.status = 'REJECTED';
      render();
    } catch (e) { setBusy(false); setMsg(e.message || 'Could not reject', 'error'); }
  }

  function poll() {
    var timer = setInterval(async function () {
      try {
        var data = await api('/api/tx/' + txId);
        state.tx = data.transaction;
        render();
        if (state.tx.status !== 'SUBMITTED') clearInterval(timer);
      } catch (e) { /* keep polling */ }
    }, 4000);
  }

  $('connectBtn').addEventListener('click', connect);
  $('approveBtn').addEventListener('click', approve);
  $('rejectBtn').addEventListener('click', reject);
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on('accountsChanged', function (accts) {
      state.account = accts && accts.length ? accts[0] : null;
      if (state.account) { $('account').textContent = state.account; }
    });
  }

  load();
})();
</script>
</body>
</html>`;
}

/** A minimal landing page shown at the server root. */
export function renderIndexPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MCP Blockchain Server</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0b1020; color:#e7ebf3; display:flex; min-height:100vh; margin:0; }
  .box { max-width:520px; margin:auto; padding:32px; text-align:center; }
  code { background:#1d2740; padding:2px 6px; border-radius:6px; }
</style>
</head>
<body>
  <div class="box">
    <h1>MCP Blockchain Server</h1>
    <p>This server is running. Transaction signing links look like
       <code>/tx/&lt;id&gt;</code> and are created by the AI assistant via the
       <code>prepare-transaction</code> tool.</p>
  </div>
</body>
</html>`;
}
