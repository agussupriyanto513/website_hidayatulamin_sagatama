// api/claim-sgt.js
// POST { accessToken, taskKey }  →  { success, newBalance, alreadyClaimed }
//
// PRINSIP KEAMANAN: jumlah SGT untuk tiap misi dikunci di SERVER (daftar
// TASKS di bawah), TIDAK PERNAH dipercaya dari client. Client cuma kirim
// `taskKey` (mis. 'visit', 'share'), bukan jumlah poinnya.
//
// Anti double-klaim: setiap misi (kecuali 'visit' yang harian) hanya bisa
// dikreditkan SEKALI per Pioneer, ditegakkan lewat txId deterministik ke
// ledger pusat (bukan lewat database sendiri — app ini sengaja tidak
// punya Firestore sendiri untuk SGT).
import { verifyPiToken, sgtCredit, sgtCall } from './_sgtClient.js';

const TASKS = {
  visit:  { pts: 10,  daily: true,  label: 'Kunjungi Portal Harian' },
  share:  { pts: 25,  daily: false, label: 'Share ke WhatsApp' },
  mart:   { pts: 50,  daily: false, label: 'Kunjungi Sagatama Mart' },
  psb:    { pts: 100, daily: false, label: 'Isi Form Pendaftaran' },
  donasi: { pts: 200, daily: false, label: 'Lakukan Donasi' },
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

  const { accessToken, taskKey } = req.body || {};
  const task = TASKS[taskKey];
  if (!task) return res.status(400).json({ error: 'taskKey tidak dikenal' });

  const pi = await verifyPiToken(accessToken);
  if (!pi) return res.status(401).json({ error: 'Silakan login dengan Pi Network terlebih dahulu' });

  // txId deterministik: harian → sekali per hari; lainnya → sekali selamanya
  const txId = task.daily
    ? `yayasan_${taskKey}_${pi.username}_${new Date().toISOString().slice(0, 10)}`
    : `yayasan_${taskKey}_${pi.username}`;

  try {
    // Ambil saldo sebelum, supaya bisa tahu apakah kredit ini baru atau
    // sudah pernah diproses sebelumnya (ledger pusat idempotent by txId).
    const before = await sgtCall('balance', { accessToken });
    const result = await sgtCredit({
      username: pi.username, amount: task.pts, txId,
      source: `yayasan_task_${taskKey}`,
      meta: { label: task.label }
    });
    const alreadyClaimed = (result.sgtBalance === before.sgtBalance);

    return res.status(200).json({
      success: true,
      newBalance: result.sgtBalance,
      pointsAwarded: alreadyClaimed ? 0 : task.pts,
      alreadyClaimed
    });
  } catch (err) {
    console.error('[claim-sgt] Error:', err.message, err.detail || '');
    return res.status(500).json({ error: err.message });
  }
}
