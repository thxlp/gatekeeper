const fs = require('fs');
const path = require('path');
const ticket = require('../ticket/ticket');

const deployedDir = path.join(__dirname, '..', '..', 'data', 'deployed');

/**
 * Stage 5: Build & Deploy Orchestrator
 *
 * จุดสำคัญด้านความปลอดภัย: deploy() ไม่เชื่อ caller เลย เชื่อแค่ signed ticket เท่านั้น
 * แม้จะมีโค้ดส่วนอื่นในระบบพยายามเรียกฟังก์ชันนี้ตรงๆ โดยข้าม Stage 1-4 มา
 * ก็จะถูก reject เพราะไม่มี ticket ที่เซ็นถูกต้อง — นี่คือ fail-closed boundary ตัวจริง
 * ไม่ใช่แค่ "เชื่อใจ" ว่า caller จะเรียกผ่าน flow ที่ถูกต้องเสมอ
 *
 * Production จริง: ส่วน "// TODO" ด้านล่างคือจุดต่อ docker build / k8s apply / systemd
 */
function deploy({ stagingDir, signedTicket }) {
  const result = ticket.verify(signedTicket);
  if (!result.valid) {
    return { ok: false, reason: `ticket_rejected:${result.reason}` };
  }

  const requestId = result.payload.request_id;
  fs.mkdirSync(deployedDir, { recursive: true });
  const targetDir = path.join(deployedDir, requestId);
  fs.cpSync(stagingDir, targetDir, { recursive: true });

  // TODO (production): ต่อ docker build / k8s apply / systemd restart ที่จุดนี้
  return { ok: true, deployedPath: targetDir };
}

module.exports = { deploy };
