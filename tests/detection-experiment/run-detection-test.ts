/**
 * Experiment 1 — วัดประสิทธิภาพการตรวจจับของด่านสแกน (security_scan)
 *
 * เรียก ScannerService.scanText() ตัวจริงจาก backend/src/scanner/ ทีละไฟล์
 * เทียบกับ tests/detection-dataset/ground_truth.csv แล้วออกเป็น CSV + สรุปเมตริก
 *
 * ขอบเขตโดยเจตนา (อย่าขยายโดยไม่ตั้งใจ):
 *   - ไม่เรียก runPipeline / DeployPipelineService
 *   - ไม่แตะ docker, docker-socket-proxy, Postgres, GitAppStore, ticket service
 *   - ไม่เรียก scanDependencies() (SCA ยังเป็น stub ตรวจแค่ว่ามี manifest ไหม
 *     จึงไม่อยู่ในขอบเขตการวัด recall/precision ของการทดลองนี้)
 *   - อ่านไฟล์จาก tests/detection-dataset/ และ configs/detection-rules/ เท่านั้น
 *   - เขียนผลลง tests/detection-experiment/output/ เท่านั้น
 *
 * กอง evasion (category = evasion, expected = detect) ถูกวัดแยกจากตารางหลักโดยสิ้นเชิง:
 *   - confusion matrix ของ positive/negative/clean *ไม่นับ* แถว evasion เลย
 *     ตัวเลข precision/recall/F1 ในตารางหลักจึงเท่ากับตอนที่ยังไม่มีกอง evasion เป๊ะ
 *   - evasion วัดด้วยเมตริกของตัวเอง: อัตราถูกจับ (detection rate — ระบบกันการหลบได้)
 *     เทียบอัตราหลบผ่าน (evasion success rate = bypassed/total — กฎถูกหลบสำเร็จ = FN)
 *
 * วิธีรัน: ดู tests/detection-experiment/README.md
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

/** tests/detection-experiment/ -> tests/ -> gatekeeper/ */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const DATASET_DIR = path.join(REPO_ROOT, 'tests', 'detection-dataset');
const OUTPUT_DIR = path.join(__dirname, 'output');
const GROUND_TRUTH = path.join(DATASET_DIR, 'ground_truth.csv');

/**
 * ScannerService อ่านกฎจาก CONFIGS_DIR ซึ่ง common/paths.ts คำนวณตอน module load
 * (`process.env.GATEKEEPER_ROOT` ไม่งั้น `resolve(process.cwd(), '..')`)
 * จึงต้องตั้งค่านี้ให้ชัดเจน *ก่อน* โหลด scanner.service เพื่อให้รันจาก cwd ไหนก็ได้
 * — ด้วยเหตุผลเดียวกันไฟล์นี้ใช้ require() ไม่ใช่ import (import ถูก hoist ขึ้นไปบนสุด)
 */
if (!process.env.GATEKEEPER_ROOT) {
  process.env.GATEKEEPER_ROOT = REPO_ROOT;
}

// reflect-metadata / @nestjs อยู่ใน backend/node_modules ซึ่งไม่ได้อยู่บนเส้นทาง
// resolution ปกติของไฟล์นี้ (node ไล่ขึ้นจาก tests/ ไม่ผ่าน backend/) จึงชี้ paths ให้ตรง
require(require.resolve('reflect-metadata', { paths: [BACKEND_DIR] }));

// backend ไม่ได้เปิด esModuleInterop — ห้าม default-import CJS (กฎใน CLAUDE.md)
const scannerModule = require(path.join(BACKEND_DIR, 'src', 'scanner', 'scanner.service'));
const auditModule = require(path.join(BACKEND_DIR, 'src', 'scanner', 'dependency-audit.service'));

// ---------------------------------------------------------------------------
// types (ประกาศซ้ำเป็น structural type — ไม่ import type ข้าม project boundary)
// ---------------------------------------------------------------------------

interface Finding {
  type: 'secret' | 'heuristic' | 'dependency';
  rule_id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  file: string;
}

interface GroundTruthRow {
  filename: string;
  rule_id: string;
  expected: string;
  category: 'positive' | 'negative' | 'clean' | 'evasion';
}

interface Counts {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

interface Metrics extends Counts {
  precision: number;
  recall: number;
  f1: number;
}

/** เมตริกของกอง evasion: detected = กฎยังจับได้ (กันการหลบ), bypassed = หลบสำเร็จ (FN) */
interface EvasionCounts {
  detected: number;
  bypassed: number;
}

function isEvasion(row: GroundTruthRow): boolean {
  return row.category === 'evasion';
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readGroundTruth(file: string): GroundTruthRow[] {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const header = lines.shift();
  if (header !== 'filename,rule_id,expected,category') {
    throw new Error(`ground_truth.csv header ไม่ตรงกับที่คาดไว้: ${header}`);
  }

  return lines.map((line, i) => {
    const cols = line.split(',');
    if (cols.length !== 4) {
      throw new Error(`ground_truth.csv บรรทัดที่ ${i + 2} มี ${cols.length} คอลัมน์ (ต้องเป็น 4)`);
    }
    return {
      filename: cols[0],
      rule_id: cols[1],
      expected: cols[2],
      category: cols[3] as GroundTruthRow['category'],
    };
  });
}

/** อ่าน rule id ทั้งหมดจาก configs/detection-rules/ (อ่านอย่างเดียว ไม่แก้ไข) */
function loadRuleIds(): string[] {
  const base = path.join(REPO_ROOT, 'configs', 'detection-rules');
  const ids: string[] = [];
  for (const fn of ['secret-patterns.json', 'heuristic-patterns.json']) {
    const rules = JSON.parse(fs.readFileSync(path.join(base, fn), 'utf8'));
    for (const r of rules) ids.push(r.id);
  }
  return ids;
}

function emptyCounts(): Counts {
  return { tp: 0, fp: 0, fn: 0, tn: 0 };
}

function toMetrics(c: Counts): Metrics {
  const precision = c.tp + c.fp === 0 ? 0 : c.tp / (c.tp + c.fp);
  const recall = c.tp + c.fn === 0 ? 0 : c.tp / (c.tp + c.fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { ...c, precision, recall, f1 };
}

function pct(v: number): string {
  return (v * 100).toFixed(1) + '%';
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

function writeCsv(file: string, header: string[], rows: string[][]): void {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  fs.writeFileSync(file, body + '\n', 'utf8');
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

/**
 * ไฟล์ documentation ในกอง negative — ไฟล์ .md ที่อธิบายว่ากฎจับอะไร จึงมีรูปแบบ
 * ที่กฎมองหาอยู่ในเนื้อความตรงๆ เป็นแหล่ง false positive ที่ตั้งใจใส่ไว้วัด
 * (แยกรายงานต่างหาก และคำนวณเมตริกอีกชุดโดยตัดกลุ่มนี้ออก)
 */
function isDocumentationNegative(row: GroundTruthRow): boolean {
  return row.category === 'negative' && row.filename.toLowerCase().endsWith('.md');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  if (!fs.existsSync(GROUND_TRUTH)) {
    throw new Error(`ไม่พบ ground_truth.csv ที่ ${GROUND_TRUTH}`);
  }

  const scanner = new scannerModule.ScannerService(new auditModule.DependencyAuditService());
  const ruleIds = loadRuleIds();
  const rows = readGroundTruth(GROUND_TRUTH);

  console.log('Experiment 1 — Detection effectiveness of the security_scan stage');
  console.log('  repo root   : ' + REPO_ROOT);
  console.log('  dataset     : ' + DATASET_DIR);
  console.log('  rules loaded: ' + ruleIds.length + ' (' + ruleIds.join(', ') + ')');
  console.log('  files       : ' + rows.length);
  console.log('');

  // --- สแกนทีละไฟล์ ------------------------------------------------------
  const hitsByFile = new Map<string, string[]>();
  const missingFiles: string[] = [];

  for (const row of rows) {
    const abs = path.join(DATASET_DIR, row.filename);
    if (!fs.existsSync(abs)) {
      missingFiles.push(row.filename);
      continue;
    }
    const content = fs.readFileSync(abs, 'utf8');
    const findings: Finding[] = scanner.scanText(row.filename, content);
    // ใช้ Set กันกรณี rule เดียวกันถูกรายงานซ้ำ
    hitsByFile.set(row.filename, Array.from(new Set(findings.map((f) => f.rule_id))).sort());
  }

  if (missingFiles.length > 0) {
    console.error('พบไฟล์ใน ground_truth.csv ที่ไม่มีอยู่จริง ' + missingFiles.length + ' ไฟล์:');
    for (const f of missingFiles) console.error('  - ' + f);
    console.error('แก้ ground_truth.csv หรือชุดข้อมูลให้ตรงกันก่อน แล้วรันใหม่');
    process.exitCode = 1;
    return;
  }

  // แยกกอง evasion ออกจากตารางหลักตั้งแต่ต้น — ตารางหลัก (positive/negative/clean)
  // จะไม่เห็นแถว evasion เลย จึงได้ตัวเลขเท่ากับตอนที่ยังไม่มีกอง evasion เป๊ะ
  const mainRows = rows.filter((r) => !isEvasion(r));
  const evasionRows = rows.filter(isEvasion);

  // --- confusion matrix ต่อกฎ (ไล่ทุกกฎ × ทุกไฟล์ในตารางหลัก) -------------
  const perRule = new Map<string, Counts>();
  const perRuleNoDocs = new Map<string, Counts>();
  for (const id of ruleIds) {
    perRule.set(id, emptyCounts());
    perRuleNoDocs.set(id, emptyCounts());
  }

  // รายละเอียดของ false positive ทุกตัว เอาไว้พิมพ์ท้ายรายงาน
  const fpDetails: { file: string; rule: string; category: string; isDoc: boolean }[] = [];
  const fnDetails: { file: string; rule: string }[] = [];

  for (const row of mainRows) {
    const hits = hitsByFile.get(row.filename) || [];
    const isDoc = isDocumentationNegative(row);

    for (const ruleId of ruleIds) {
      const shouldCatch = row.expected === 'yes' && row.rule_id === ruleId;
      const didCatch = hits.indexOf(ruleId) !== -1;

      const bucket: keyof Counts = shouldCatch
        ? didCatch
          ? 'tp'
          : 'fn'
        : didCatch
          ? 'fp'
          : 'tn';

      perRule.get(ruleId)[bucket] += 1;
      if (!isDoc) perRuleNoDocs.get(ruleId)[bucket] += 1;

      if (bucket === 'fp') {
        fpDetails.push({ file: row.filename, rule: ruleId, category: row.category, isDoc });
      } else if (bucket === 'fn') {
        fnDetails.push({ file: row.filename, rule: ruleId });
      }
    }
  }

  // --- micro-average รวม --------------------------------------------------
  const total = emptyCounts();
  const totalNoDocs = emptyCounts();
  for (const id of ruleIds) {
    for (const k of ['tp', 'fp', 'fn', 'tn'] as (keyof Counts)[]) {
      total[k] += perRule.get(id)[k];
      totalNoDocs[k] += perRuleNoDocs.get(id)[k];
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // --- results.csv : หนึ่งแถวต่อหนึ่งไฟล์ (เฉพาะตารางหลัก ไม่รวม evasion) --
  const resultRows: string[][] = [];
  for (const row of mainRows) {
    const hits = hitsByFile.get(row.filename) || [];
    const shouldCatch = row.expected === 'yes';
    const caughtByExpected = shouldCatch && hits.indexOf(row.rule_id) !== -1;
    const extraHits = hits.filter((h) => !(shouldCatch && h === row.rule_id));

    let verdict: string;
    if (shouldCatch) {
      verdict = caughtByExpected ? (extraHits.length ? 'TP+FP' : 'TP') : extraHits.length ? 'FN+FP' : 'FN';
    } else {
      verdict = extraHits.length ? 'FP' : 'TN';
    }

    resultRows.push([
      row.filename,
      row.category,
      row.rule_id,
      row.expected,
      hits.join(';'),
      extraHits.join(';'),
      verdict,
      isDocumentationNegative(row) ? 'documentation' : '',
    ]);
  }

  writeCsv(
    path.join(OUTPUT_DIR, 'results.csv'),
    ['filename', 'category', 'expected_rule', 'expected', 'detected_rules', 'unexpected_rules', 'verdict', 'group'],
    resultRows,
  );

  // --- metrics.csv : หนึ่งแถวต่อหนึ่งกฎ + สองแถวรวม ----------------------
  const metricRows: string[][] = [];
  const fmt = (n: number) => n.toFixed(4);

  for (const id of ruleIds) {
    const m = toMetrics(perRule.get(id));
    const mnd = toMetrics(perRuleNoDocs.get(id));
    metricRows.push([
      id,
      String(m.tp),
      String(m.fp),
      String(m.fn),
      String(m.tn),
      fmt(m.precision),
      fmt(m.recall),
      fmt(m.f1),
      fmt(mnd.precision),
      fmt(mnd.f1),
    ]);
  }

  const mTotal = toMetrics(total);
  const mTotalNoDocs = toMetrics(totalNoDocs);
  metricRows.push([
    'TOTAL (micro-avg)',
    String(mTotal.tp),
    String(mTotal.fp),
    String(mTotal.fn),
    String(mTotal.tn),
    fmt(mTotal.precision),
    fmt(mTotal.recall),
    fmt(mTotal.f1),
    fmt(mTotalNoDocs.precision),
    fmt(mTotalNoDocs.f1),
  ]);

  writeCsv(
    path.join(OUTPUT_DIR, 'metrics.csv'),
    [
      'rule_id',
      'tp',
      'fp',
      'fn',
      'tn',
      'precision',
      'recall',
      'f1',
      'precision_excl_docs',
      'f1_excl_docs',
    ],
    metricRows,
  );

  // --- false-positives-documentation.csv : รายงานแยกกลุ่ม documentation ---
  const docFps = fpDetails.filter((d) => d.isDoc);
  const otherFps = fpDetails.filter((d) => !d.isDoc);
  const docFileCount = rows.filter(isDocumentationNegative).length;

  writeCsv(
    path.join(OUTPUT_DIR, 'false-positives-documentation.csv'),
    ['filename', 'rule_id', 'category'],
    docFps.map((d) => [d.file, d.rule, d.category]),
  );

  writeCsv(
    path.join(OUTPUT_DIR, 'false-positives-code.csv'),
    ['filename', 'rule_id', 'category'],
    otherFps.map((d) => [d.file, d.rule, d.category]),
  );

  // --- กอง evasion : วัดแยกด้วยเมตริกของตัวเอง ----------------------------
  // นิยาม (ตามที่ตกลง):
  //   detected = กฎเป้าหมายยังจับไฟล์ที่พยายามหลบได้ → ระบบกันการหลบได้ (ดี)
  //   bypassed = กฎเป้าหมายจับไม่ได้ → หลบสำเร็จ = false negative ของ evasion
  // detection rate = detected / total ;  evasion success rate = bypassed / total
  const perRuleEva = new Map<string, EvasionCounts>();
  for (const id of ruleIds) perRuleEva.set(id, { detected: 0, bypassed: 0 });

  const evaResultRows: string[][] = [];
  const bypassedFiles: { file: string; rule: string }[] = [];
  let evaDetected = 0;
  let evaBypassed = 0;

  for (const row of evasionRows) {
    const hits = hitsByFile.get(row.filename) || [];
    const detected = hits.indexOf(row.rule_id) !== -1;
    const crossHits = hits.filter((h) => h !== row.rule_id);

    const bucket = perRuleEva.get(row.rule_id);
    if (bucket) {
      if (detected) bucket.detected += 1;
      else bucket.bypassed += 1;
    }
    if (detected) evaDetected += 1;
    else {
      evaBypassed += 1;
      bypassedFiles.push({ file: row.filename, rule: row.rule_id });
    }

    evaResultRows.push([
      row.filename,
      row.rule_id,
      hits.join(';'),
      detected ? 'DETECTED' : 'BYPASSED',
      crossHits.join(';'),
    ]);
  }

  writeCsv(
    path.join(OUTPUT_DIR, 'evasion-results.csv'),
    ['filename', 'target_rule', 'detected_rules', 'verdict', 'cross_hits'],
    evaResultRows,
  );

  // evasion-metrics.csv : รายกฎ (เฉพาะกฎที่มีไฟล์ evasion) + แถวรวม
  const evaMetricRows: string[][] = [];
  const rate = (num: number, den: number): string => (den === 0 ? '' : (num / den).toFixed(4));
  for (const id of ruleIds) {
    const c = perRuleEva.get(id);
    const total = c.detected + c.bypassed;
    if (total === 0) continue; // กฎที่ไม่มีไฟล์ evasion ไม่ต้องมีแถว
    evaMetricRows.push([
      id,
      String(total),
      String(c.detected),
      String(c.bypassed),
      rate(c.detected, total),
      rate(c.bypassed, total),
    ]);
  }
  const evaTotal = evaDetected + evaBypassed;
  evaMetricRows.push([
    'TOTAL',
    String(evaTotal),
    String(evaDetected),
    String(evaBypassed),
    rate(evaDetected, evaTotal),
    rate(evaBypassed, evaTotal),
  ]);

  writeCsv(
    path.join(OUTPUT_DIR, 'evasion-metrics.csv'),
    ['rule_id', 'total', 'detected', 'bypassed', 'detection_rate', 'evasion_success_rate'],
    evaMetricRows,
  );

  // --- สรุปออกจอ ----------------------------------------------------------
  const W = 26;
  console.log('ผลรายกฎ — ตารางหลัก (positive/negative/clean เท่านั้น ไม่รวม evasion)');
  console.log(
    pad('rule_id', W) +
      padLeft('TP', 5) +
      padLeft('FP', 5) +
      padLeft('FN', 5) +
      padLeft('prec', 9) +
      padLeft('recall', 9) +
      padLeft('F1', 9),
  );
  console.log('-'.repeat(W + 42));
  for (const id of ruleIds) {
    const m = toMetrics(perRule.get(id));
    console.log(
      pad(id, W) +
        padLeft(String(m.tp), 5) +
        padLeft(String(m.fp), 5) +
        padLeft(String(m.fn), 5) +
        padLeft(pct(m.precision), 9) +
        padLeft(pct(m.recall), 9) +
        padLeft(pct(m.f1), 9),
    );
  }
  console.log('-'.repeat(W + 42));
  console.log(
    pad('TOTAL (micro-avg)', W) +
      padLeft(String(mTotal.tp), 5) +
      padLeft(String(mTotal.fp), 5) +
      padLeft(String(mTotal.fn), 5) +
      padLeft(pct(mTotal.precision), 9) +
      padLeft(pct(mTotal.recall), 9) +
      padLeft(pct(mTotal.f1), 9),
  );

  console.log('');
  console.log('False negative (ควรจับแต่ไม่จับ): ' + fnDetails.length);
  for (const d of fnDetails) console.log('  - ' + d.file + '  [' + d.rule + ']');

  console.log('');
  console.log(
    'False positive ในกลุ่ม documentation (' +
      docFileCount +
      ' ไฟล์ .md ในกอง negative): ' +
      docFps.length,
  );
  for (const d of docFps) console.log('  - ' + d.file + '  [' + d.rule + ']');

  console.log('');
  console.log('False positive ในกลุ่มโค้ด/คอนฟิก (ไม่รวม documentation): ' + otherFps.length);
  for (const d of otherFps) console.log('  - ' + d.file + '  [' + d.rule + '] (' + d.category + ')');

  console.log('');
  console.log('เมตริกรวมเมื่อตัดกลุ่ม documentation ออก:');
  console.log(
    '  precision ' +
      pct(mTotalNoDocs.precision) +
      '  recall ' +
      pct(mTotalNoDocs.recall) +
      '  F1 ' +
      pct(mTotalNoDocs.f1) +
      '   (TP ' +
      mTotalNoDocs.tp +
      ' / FP ' +
      mTotalNoDocs.fp +
      ' / FN ' +
      mTotalNoDocs.fn +
      ')',
  );

  // --- สรุปกอง evasion (แยกจากตารางหลักโดยสิ้นเชิง) -----------------------
  console.log('');
  console.log('='.repeat(W + 42));
  console.log('กอง evasion — โค้ดอันตรายที่พยายามหลบ pattern (วัดแยก ไม่กระทบตารางหลัก)');
  console.log('  จำนวนไฟล์ evasion: ' + evasionRows.length);
  console.log('');
  console.log(
    pad('rule_id', W) + padLeft('total', 7) + padLeft('detect', 8) + padLeft('bypass', 8) + padLeft('detect%', 10),
  );
  console.log('-'.repeat(W + 33));
  for (const id of ruleIds) {
    const c = perRuleEva.get(id);
    const t = c.detected + c.bypassed;
    if (t === 0) continue;
    console.log(
      pad(id, W) +
        padLeft(String(t), 7) +
        padLeft(String(c.detected), 8) +
        padLeft(String(c.bypassed), 8) +
        padLeft(pct(c.detected / t), 10),
    );
  }
  console.log('-'.repeat(W + 33));
  console.log(
    pad('TOTAL', W) +
      padLeft(String(evaTotal), 7) +
      padLeft(String(evaDetected), 8) +
      padLeft(String(evaBypassed), 8) +
      padLeft(evaTotal ? pct(evaDetected / evaTotal) : '-', 10),
  );
  console.log('');
  console.log(
    '  detection rate (กันการหลบได้)     : ' +
      (evaTotal ? pct(evaDetected / evaTotal) : '-') +
      '   (' + evaDetected + '/' + evaTotal + ')',
  );
  console.log(
    '  evasion success rate (หลบสำเร็จ)  : ' +
      (evaTotal ? pct(evaBypassed / evaTotal) : '-') +
      '   (' + evaBypassed + '/' + evaTotal + ')',
  );
  console.log('');
  console.log('ไฟล์ที่หลบสำเร็จ (bypassed = FN ของ evasion): ' + bypassedFiles.length);
  for (const d of bypassedFiles) console.log('  - ' + d.file + '  [' + d.rule + ']');

  console.log('');
  console.log('เขียนผลลง ' + OUTPUT_DIR);
  console.log('  results.csv                        (ผลรายไฟล์ ตารางหลัก)');
  console.log('  metrics.csv                        (เมตริกรายกฎ + รวม ตารางหลัก)');
  console.log('  false-positives-documentation.csv  (FP กลุ่มเอกสาร)');
  console.log('  false-positives-code.csv           (FP กลุ่มโค้ด/คอนฟิก)');
  console.log('  evasion-results.csv                (ผลรายไฟล์ กอง evasion)');
  console.log('  evasion-metrics.csv                (detection rate / evasion success rate)');
}

main();
