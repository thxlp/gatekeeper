const SEVERITY_WEIGHT = { CRITICAL: 100, HIGH: 40, MEDIUM: 15, LOW: 5, INFO: 0 };

/**
 * Stage 4: Risk & Decision Engine
 * - มี CRITICAL อย่างน้อย 1 เคส -> BLOCK เสมอ ไม่ต้องถ่วงน้ำหนัก (defense ที่เข้มสุด)
 * - คะแนนสะสมสูงแต่ไม่ critical -> QUARANTINE ให้คนตรวจ
 * - ต่ำกว่า threshold -> ALLOW
 */
function evaluate(findings) {
  let score = 0;
  let hasCritical = false;

  for (const f of findings) {
    score += SEVERITY_WEIGHT[f.severity] || 0;
    if (f.severity === 'CRITICAL') hasCritical = true;
  }

  let decision;
  if (hasCritical) {
    decision = 'BLOCK';
  } else if (score >= 40) {
    decision = 'QUARANTINE';
  } else {
    decision = 'ALLOW';
  }

  return { decision, score, findings };
}

module.exports = { evaluate };
