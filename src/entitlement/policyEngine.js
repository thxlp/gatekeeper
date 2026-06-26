const fs = require('fs');
const path = require('path');

const policyPath = path.join(__dirname, '..', '..', 'configs', 'policy.json');

function loadPolicy() {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

/**
 * Stage 2: Entitlement Engine
 * เช็คว่าแผน (plan) ของ account นี้ได้รับสิทธิ์ใช้ runtime/feature ที่ขอ deploy ไหม
 * และขนาด artifact เกิน quota ของแผนหรือไม่
 */
function checkEntitlement(account, { runtime, feature, artifactSizeMb }) {
  const policy = loadPolicy();
  const plan = policy.plans[account.plan];

  if (!plan) {
    return { allowed: false, reason: `unknown_plan:${account.plan}` };
  }
  if (runtime && !plan.allowed_runtimes.includes(runtime)) {
    return { allowed: false, reason: `runtime_not_entitled:${runtime}` };
  }
  if (feature && !plan.allowed_features.includes(feature)) {
    return { allowed: false, reason: `feature_not_entitled:${feature}` };
  }
  if (artifactSizeMb > plan.max_artifact_mb) {
    return {
      allowed: false,
      reason: `artifact_too_large:${artifactSizeMb.toFixed(2)}mb>${plan.max_artifact_mb}mb`,
    };
  }
  return { allowed: true };
}

module.exports = { checkEntitlement, loadPolicy };
