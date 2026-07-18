// api/redeem-sgt.js
// POST { accessToken, mode, key?, amount? }
//   mode='catalog'   → { key } — biaya dikunci di server (CATALOG di bawah)
//   mode='exchange'  → { amount, exchangeType: 'pi' | 'rupiah' } — jumlah
//                       boleh dari client karena ini SELALU mengurangi
//                       saldo milik pengirim sendiri (tidak ada celah
//                       "dapat SGT gratis" di endpoint ini, cuma "pakai
//                       SGT milik sendiri").
import { verifyPiToken, sgtDebit } from './_sgtClient.js';

const CATALOG = {
  disc5:   { cost: 200,  name: 'Diskon 5% Mart' },
  disc10:  { cost: 400,  name: 'Diskon 10% Mart' },
  stiker:  { cost: 150,  name: 'Stiker Eksklusif' },
  kaos:    { cost: 1000, name: 'Kaos Sagatama' },
  buku:    { cost: 500,  name: 'Buku Pesantren' },
  sertif:  { cost: 300,  name: 'Sertifikat Digital' },
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accessToken, mode, key, amount, exchangeType } = req.body || {};
  const pi = await verifyPiToken(accessToken);
  if (!pi) return res.status(401).json({ error: 'Silakan login dengan Pi Network terlebih dahulu' });

  let cost, source, label;

  if (mode === 'catalog') {
    const item = CATALOG[key];
    if (!item) return res.status(400).json({ error: 'key katalog tidak dikenal' });
    cost = item.cost;
    source = 'yayasan_redeem_catalog';
    label = item.name;
  } else if (mode === 'exchange') {
    const amt = parseInt(amount);
    if (exchangeType === 'pi') {
      if (!(amt >= 500) || amt % 500 !== 0) {
        return res.status(400).json({ error: 'Minimal 500 SGT, kelipatan 500' });
      }
    } else if (exchangeType === 'rupiah') {
      if (!(amt >= 1000) || amt % 1000 !== 0) {
        return res.status(400).json({ error: 'Minimal 1000 SGT, kelipatan 1000' });
      }
    } else {
      return res.status(400).json({ error: 'exchangeType tidak dikenal' });
    }
    cost = amt;
    source = `yayasan_exchange_${exchangeType}`;
    label = `Tukar ke ${exchangeType === 'pi' ? 'Pi Coin' : 'Rupiah'}`;
  } else {
    return res.status(400).json({ error: 'mode tidak dikenal' });
  }

  // txId unik per kejadian (bukan deterministik seperti claim-sgt, karena
  // redeem/tukar memang boleh dilakukan berkali-kali oleh Pioneer yang sama)
  const txId = `yayasan_redeem_${pi.username}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const result = await sgtDebit({
      username: pi.username, amount: cost, txId,
      source, meta: { label, key: key || null, exchangeType: exchangeType || null }
    });
    return res.status(200).json({ success: true, newBalance: result.sgtBalance, cost, label });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message || 'Saldo SGT tidak cukup' });
    }
    console.error('[redeem-sgt] Error:', err.message, err.detail || '');
    return res.status(500).json({ error: err.message });
  }
}
