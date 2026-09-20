// template อีเมล plain-text ภาษาไทย — รวมไว้ที่เดียวให้แก้ข้อความง่าย (ไม่มี HTML/branding
// ซับซ้อน — ระบบแจ้งเตือน ไม่ใช่ marketing)

export interface MailContent {
  subject: string;
  text: string;
}

export function deployFailedEmail(appName: string, reason: string): MailContent {
  return {
    subject: `[Gatekeeper] Deploy ไม่สำเร็จ — ${appName}`,
    text: [
      `Deploy ของ "${appName}" ไม่สำเร็จ`,
      '',
      `เหตุผล: ${reason}`,
      '',
      'ดูรายละเอียด (findings/score) ได้ที่หน้า Audit Log บน dashboard',
      'แอปเวอร์ชันก่อนหน้า (ถ้ามี) ยังให้บริการอยู่ตามปกติ',
    ].join('\n'),
  };
}

export function rollbackFailedEmail(appName: string, reason: string): MailContent {
  return {
    subject: `[Gatekeeper] Rollback ไม่สำเร็จ — ${appName}`,
    text: [
      `Rollback ของ "${appName}" ไม่สำเร็จ`,
      '',
      `เหตุผล: ${reason}`,
      '',
      'container ปัจจุบันยังให้บริการอยู่ตามเดิม — ลอง rollback ไป release อื่น หรือ deploy ใหม่',
    ].join('\n'),
  };
}

export function otpEmail(code: string, purposeLabel: string): MailContent {
  return {
    subject: `[Gatekeeper] รหัสยืนยัน ${code}`,
    text: [
      `รหัสยืนยันของคุณสำหรับ${purposeLabel}: ${code}`,
      '',
      'รหัสหมดอายุใน 10 นาที และใช้ได้ครั้งเดียว',
      'ถ้าคุณไม่ได้เป็นคนทำรายการนี้ ไม่ต้องทำอะไร — บัญชียังปลอดภัย ตราบใดที่รหัสไม่ถูกส่งต่อให้ใคร',
    ].join('\n'),
  };
}

/** เมลทดสอบช่องทางส่ง — ตั้งใจไม่มีลิงก์/ปุ่มใดๆ กันโดน spam filter ตอนทดสอบครั้งแรก */
export function mailTestEmail(transport: string): MailContent {
  return {
    subject: '[Gatekeeper] ทดสอบการส่งอีเมล',
    text: [
      'ถ้าคุณได้รับอีเมลฉบับนี้ แปลว่าช่องทางส่งอีเมลของ Gatekeeper ทำงานแล้ว',
      '',
      `ช่องทางที่ใช้: ${transport}`,
      `เวลาที่ส่ง: ${new Date().toISOString()}`,
      '',
      'อีเมลฉบับนี้ถูกส่งเพราะมีคนกดปุ่ม "ส่งเมลทดสอบ" ในหน้า Settings ของบัญชีนี้',
    ].join('\n'),
  };
}
