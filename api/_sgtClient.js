// api/_sgtClient.js
// Helper untuk memanggil ledger SGT terpusat di backend Mart.
// App ini SENGAJA tidak punya Firestore sendiri untuk SGT — semua saldo
// dan riwayat hidup di backend Mart (portal-sagatama / sgt_wallets).
const SGT_BACKEND = process.env.SGT_BACKEND_URL || 'https://sagatama-backend.vercel.app';

async function sgtCall(endpoint, body) {
  const res = await fetch(`${SGT_BACKEND}/api/sgt/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `sgt/${endpoint} gagal`);
    err.detail = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function sgtCallInternal(endpoint, body) {
  const secret = process.env.SGT_INTERNAL_SECRET;
  if (!secret) throw new Error('SGT_INTERNAL_SECRET belum diset di environment');
  const res = await fetch(`${SGT_BACKEND}/api/sgt/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `sgt/${endpoint} gagal`);
    err.detail = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Verifikasi accessToken Pi langsung ke Pi Platform API → dapat username asli
async function verifyPiToken(accessToken) {
  if (!accessToken) return null;
  try {
    const resp = await fetch('https://api.minepi.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || !data.username) return null;
    return { uid: data.uid, username: data.username };
  } catch (e) {
    console.error('[_sgtClient] verifyPiToken error:', e.message);
    return null;
  }
}

async function sgtCredit({ username, amount, txId, source, meta }) {
  if (!(amount > 0)) return null;
  return sgtCallInternal('credit', { username, amount, txId, source, meta });
}

async function sgtDebit({ username, amount, txId, source, meta }) {
  if (!(amount > 0)) return null;
  return sgtCallInternal('debit', { username, amount, txId, source, meta });
}

export { verifyPiToken, sgtCredit, sgtDebit, sgtCall };
