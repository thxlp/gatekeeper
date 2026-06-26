const rules = require('../../configs/detection-rules/heuristic-patterns.json');

/**
 * Stage 3b: Heuristic Pattern Match (เทียบกับแนวคิด YARA/Semgrep rule)
 * ตรวจ indicator ที่พบบ่อยในมัลแวร์/webshell เช่น eval+base64, system จาก request ตรงๆ,
 * encoded powershell ฯลฯ — เป็น "ชั้นที่ 2" ของ defense-in-depth ต่อจาก secret scan
 */
function scanContent(filePath, content) {
  const findings = [];
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, rule.flags || 'g');
    if (re.test(content)) {
      findings.push({
        type: 'heuristic',
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
