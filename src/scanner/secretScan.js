const rules = require('../../configs/detection-rules/secret-patterns.json');

/**
 * Stage 3a: Secret Scan (เทียบกับแนวคิด gitleaks/trufflehog)
 * โหลด pattern จาก config ไฟล์ ไม่ hardcode ในโค้ด เพื่อให้ทีม Security
 * อัปเดต ruleset ได้โดยไม่ต้อง deploy ตัว Gatekeeper ใหม่ (แต่ต้องผ่านการเซ็น/อนุมัติ — ดู README)
 */
function scanContent(filePath, content) {
  const findings = [];
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, rule.flags || 'g');
    if (re.test(content)) {
      findings.push({
        type: 'secret',
        rule_id: rule.id,
        severity: rule.severity,
        description: rule.description,
        file: filePath,
      });
    }
  }
  return findings;
}

module.exports = { scanContent };
