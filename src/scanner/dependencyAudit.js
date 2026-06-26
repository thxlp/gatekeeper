/**
 * Stage 3c: Dependency Audit (Software Composition Analysis)
 *
 * จุดต่อยอดจริง: เรียก Trivy / Grype / OSV-Scanner ผ่าน child_process.exec()
 * เช่น `trivy fs --format json <stagingDir>` แล้ว parse ผลมาเป็น findings[]
 *
 * Sandbox ที่ใช้พัฒนาไฟล์นี้ไม่มี network ออกไปดึง vulnerability DB จึงทำเป็น stub
 * ที่ตรวจแค่ "มี manifest dependency ไหม" และแจ้งตรงๆ ว่ายังไม่ได้ผูก engine จริง
 * เพื่อไม่ทำให้ผู้ใช้เข้าใจผิดว่ามีการสแกน CVE จริงเกิดขึ้นแล้ว
 */
function scanDependencies(files) {
  const manifestFiles = ['package.json', 'requirements.txt', 'go.sum', 'composer.lock'];
  const found = files.find((f) => manifestFiles.some((m) => f.path.endsWith(m)));

  if (!found) {
    return [];
  }

  return [
    {
      type: 'dependency',
      rule_id: 'SCA-NOT-CONFIGURED',
      severity: 'INFO',
      description: `พบไฟล์ manifest (${found.path}) แต่ SCA engine จริง (Trivy/OSV) ยังไม่ได้ผูกเข้ามา — ดูวิธีต่อยอดใน README`,
      file: found.path,
    },
  ];
}

module.exports = { scanDependencies };
