/**
 * Experiment 1 (v2) — วัดประสิทธิภาพการตรวจจับของด่านสแกน บนชุดข้อมูล v2 (ผสมโค้ดจริง)
 *
 * เหมือน run-detection-test.ts ทุกประการเรื่องวิธีเรียก scanner (ใช้ ScannerService.scanText()
 * ตัวจริงจาก backend/src/scanner/) แต่:
 *   - ใช้ dataset จาก tests/detection-dataset-v2/ (มี prefix synthetic-/real- ใน category)
 *   - ดึงกอง malicious จริงลง /tmp ก่อนสแกน แล้ว "ลบทิ้งเสมอ" ด้วย try/finally (แม้พังกลางทาง)
 *   - รายงานแยก: synthetic-only / real-only / combined / แยกตามแหล่ง (sources.csv) / evasion / malicious
 *
 * ขอบเขตโดยเจตนา (เหมือน v1 — อย่าขยาย):
 *   - ไม่เรียก runPipeline / DeployPipelineService, ไม่แตะ docker/postgres/ticket/GitAppStore
 *   - ไม่เรียก scanDependencies() (SCA ยัง stub)
 *   - อ่านกฎอย่างเดียวจาก configs/detection-rules/ (ห้ามแก้กฎ/threshold)
 *   - เขียนผลเฉพาะใน tests/detection-experiment/output-v2/
 *   - โค้ด malicious ถูกอ่านเป็นข้อความเท่านั้น ไม่ execute และถูกลบทิ้งหลังรัน
 *
 * วิธีรัน: ดู tests/detection-experiment/README-v2.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as os from 'os';

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const DATASET_DIR = path.join(REPO_ROOT, 'tests', 'detection-dataset-v2');
const OUTPUT_DIR = path.join(__dirname, 'output-v2');
const GROUND_TRUTH = path.join(DATASET_DIR, 'ground_truth.csv');
const SOURCES_CSV = path.join(DATASET_DIR, 'sources.csv');
const MAL_DIR_ROOT = path.join(DATASET_DIR, 'malicious-remote');
const FETCH_SCRIPT = path.join(MAL_DIR_ROOT, 'fetch-malicious.sh');
const MAL_SOURCES_CSV = path.join(MAL_DIR_ROOT, 'sources.csv');
// SKIP_MALICIOUS=1 → ไม่เรียก fetch-malicious.sh เลย (ไม่แตะเน็ต ไม่สร้างอะไรใน /tmp) — ใช้บน production
const SKIP_MALICIOUS = process.env.SKIP_MALICIOUS === '1';

if (!process.env.GATEKEEPER_ROOT) {
  process.env.GATEKEEPER_ROOT = REPO_ROOT;
}

require(require.resolve('reflect-metadata', { paths: [BACKEND_DIR] }));
// backend ไม่เปิด esModuleInterop — ห้าม default-import CJS
const scannerModule = require(path.join(BACKEND_DIR, 'src', 'scanner', 'scanner.service'));
const auditModule = require(path.join(BACKEND_DIR, 'src', 'scanner', 'dependency-audit.service'));

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------
interface Finding {
  type: string;
  rule_id: string;
  severity: string;
  description: string;
  file: string;
}

type Source = 'synthetic' | 'real' | 'malicious';
type BaseCat = 'positive' | 'negative' | 'clean' | 'evasion' | 'malicious';

interface Row {
  id: string; // คีย์ไม่ซ้ำสำหรับ hitsById (ใช้ path ที่แสดงในรายงาน)
  absPath: string; // path จริงบนดิสก์ที่อ่าน
  rule_id: string;
  expected: string; // yes | no | detect
  source: Source;
  baseCat: BaseCat;
  origin: string; // แหล่งที่มา (repo หรือ 'synthetic') สำหรับ breakdown แยกแหล่ง
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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
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

/** split CSV บรรทัดเดียว รองรับ cell ที่ถูก quote (sources.csv มี note ที่อาจมี comma) */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadRuleIds(): string[] {
  const base = path.join(REPO_ROOT, 'configs', 'detection-rules');
  const ids: string[] = [];
  for (const fn of ['secret-patterns.json', 'heuristic-patterns.json']) {
    const rules = JSON.parse(fs.readFileSync(path.join(base, fn), 'utf8'));
    for (const r of rules) ids.push(r.id);
  }
  return ids;
}

/** อ่าน sources.csv → map: filename (relative ใน dataset) -> origin_repo */
function loadRealOrigins(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(SOURCES_CSV)) return m;
  const lines = fs.readFileSync(SOURCES_CSV, 'utf8').split('\n').filter((l) => l.trim());
  lines.shift(); // header: filename,origin_repo,commit,upstream_path,license,note
  for (const line of lines) {
    const c = splitCsvLine(line);
    if (c.length >= 2) m.set(c[0], c[1]);
  }
  return m;
}

/** map group_id -> origin_repo จาก malicious-remote/sources.csv */
function loadMalGroupOrigins(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(MAL_SOURCES_CSV)) return m;
  const lines = fs.readFileSync(MAL_SOURCES_CSV, 'utf8').split('\n').filter((l) => l.trim());
  lines.shift(); // header: group_id,target_rule,origin_repo,commit,license,selection,note
  for (const line of lines) {
    const c = splitCsvLine(line);
    if (c.length >= 3) m.set(c[0], c[2]);
  }
  return m;
}

function isDocNegative(row: Row): boolean {
  return row.baseCat === 'negative' && row.id.toLowerCase().endsWith('.md');
}

// ---------------------------------------------------------------------------
// อ่าน ground_truth (dataset v2) — category มี prefix synthetic-/real-
// ---------------------------------------------------------------------------
function readGroundTruthV2(realOrigins: Map<string, string>): Row[] {
  const lines = fs.readFileSync(GROUND_TRUTH, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l);
  const header = lines.shift();
  if (header !== 'filename,rule_id,expected,category') {
    throw new Error(`ground_truth.csv header ไม่ตรงกับที่คาดไว้: ${header}`);
  }
  return lines.map((line, i) => {
    const cols = splitCsvLine(line);
    if (cols.length !== 4) {
      throw new Error(`ground_truth.csv บรรทัดที่ ${i + 2} มี ${cols.length} คอลัมน์`);
    }
    const [filename, rule_id, expected, category] = cols;
    const source: Source = category.startsWith('synthetic') ? 'synthetic' : 'real';
    const baseCat = category.replace(/^synthetic-|^real-/, '') as BaseCat;
    const origin = source === 'synthetic' ? 'synthetic' : realOrigins.get(filename) || '(unknown)';
    return {
      id: filename,
      absPath: path.join(DATASET_DIR, filename),
      rule_id,
      expected,
      source,
      baseCat,
      origin,
    };
  });
}

// ---------------------------------------------------------------------------
// กอง malicious: ดึงลง /tmp แล้วอ่าน ground_truth.malicious.csv
// (คืน { rows, dir } เพื่อให้ finally ลบ dir ทิ้งได้แม้พังกลางทาง)
// ---------------------------------------------------------------------------
function fetchMalicious(malGroupOrigin: Map<string, string>): { rows: Row[]; dir: string | null } {
  if (!fs.existsSync(FETCH_SCRIPT)) {
    console.warn('!! ไม่พบ fetch-malicious.sh — ข้ามกอง malicious');
    return { rows: [], dir: null };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-detect-malicious-'));
  console.log('>> ดึงกอง malicious ลง ' + dir + ' (อ่านอย่างเดียว ห้าม execute; จะลบทิ้งหลังรัน)');
  try {
    execFileSync('bash', [FETCH_SCRIPT], {
      env: { ...process.env, GK_MAL_DIR: dir },
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 300000,
    });
  } catch (e) {
    console.warn('!! ดึงกอง malicious ไม่สำเร็จ (network/git?) — รายงานส่วนอื่นต่อ; ยังลบ /tmp ให้');
    return { rows: [], dir };
  }
  const gt = path.join(dir, 'ground_truth.malicious.csv');
  if (!fs.existsSync(gt)) {
    console.warn('!! ไม่พบ ground_truth.malicious.csv หลัง fetch — ข้ามกอง malicious');
    return { rows: [], dir };
  }
  const lines = fs.readFileSync(gt, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l);
  lines.shift(); // header: filename,target_rule,expected,group_id
  const rows: Row[] = [];
  for (const line of lines) {
    const c = splitCsvLine(line);
    if (c.length < 4) continue;
    const [rel, target_rule, expected, group_id] = c;
    rows.push({
      id: 'malicious/' + rel,
      absPath: path.join(dir, rel),
      rule_id: target_rule,
      expected,
      source: 'malicious',
      baseCat: 'malicious',
      origin: malGroupOrigin.get(group_id) || group_id,
    });
  }
  return { rows, dir };
}

// ---------------------------------------------------------------------------
// confusion matrix ต่อกฎ สำหรับ subset ของ "main rows" (positive/negative/clean)
// ---------------------------------------------------------------------------
function confusionByRule(
  rows: Row[],
  ruleIds: string[],
  hitsById: Map<string, string[]>,
): { perRule: Map<string, Counts>; total: Counts } {
  const perRule = new Map<string, Counts>();
  for (const id of ruleIds) perRule.set(id, emptyCounts());
  for (const row of rows) {
    const hits = hitsById.get(row.id) || [];
    for (const ruleId of ruleIds) {
      const shouldCatch = row.expected === 'yes' && row.rule_id === ruleId;
      const didCatch = hits.indexOf(ruleId) !== -1;
      const bucket: keyof Counts = shouldCatch ? (didCatch ? 'tp' : 'fn') : didCatch ? 'fp' : 'tn';
      perRule.get(ruleId)[bucket] += 1;
    }
  }
  const total = emptyCounts();
  for (const id of ruleIds)
    for (const k of ['tp', 'fp', 'fn', 'tn'] as (keyof Counts)[]) total[k] += perRule.get(id)[k];
  return { perRule, total };
}

function printMainTable(title: string, rows: Row[], ruleIds: string[], hitsById: Map<string, string[]>): Metrics {
  const { perRule, total } = confusionByRule(rows, ruleIds, hitsById);
  const W = 26;
  console.log('');
  console.log('### ' + title + '  (ไฟล์ที่นับ: ' + rows.length + ')');
  console.log(
    pad('rule_id', W) + padLeft('TP', 5) + padLeft('FP', 5) + padLeft('FN', 5) + padLeft('prec', 9) + padLeft('recall', 9) + padLeft('F1', 9),
  );
  console.log('-'.repeat(W + 42));
  for (const id of ruleIds) {
    const m = toMetrics(perRule.get(id));
    // ข้ามกฎที่ไม่มีไฟล์เกี่ยวข้องเลยใน subset นี้ (TP+FP+FN=0) เพื่อให้อ่านง่าย
    if (m.tp + m.fp + m.fn === 0) continue;
    console.log(
      pad(id, W) + padLeft(String(m.tp), 5) + padLeft(String(m.fp), 5) + padLeft(String(m.fn), 5) +
        padLeft(pct(m.precision), 9) + padLeft(pct(m.recall), 9) + padLeft(pct(m.f1), 9),
    );
  }
  console.log('-'.repeat(W + 42));
  const mt = toMetrics(total);
  console.log(
    pad('TOTAL (micro-avg)', W) + padLeft(String(mt.tp), 5) + padLeft(String(mt.fp), 5) + padLeft(String(mt.fn), 5) +
      padLeft(pct(mt.precision), 9) + padLeft(pct(mt.recall), 9) + padLeft(pct(mt.f1), 9),
  );
  return mt;
}

function metricsCsvRows(rows: Row[], ruleIds: string[], hitsById: Map<string, string[]>): string[][] {
  const { perRule, total } = confusionByRule(rows, ruleIds, hitsById);
  const fmt = (n: number) => n.toFixed(4);
  const out: string[][] = [];
  for (const id of ruleIds) {
    const m = toMetrics(perRule.get(id));
    out.push([id, String(m.tp), String(m.fp), String(m.fn), String(m.tn), fmt(m.precision), fmt(m.recall), fmt(m.f1)]);
  }
  const mt = toMetrics(total);
  out.push(['TOTAL (micro-avg)', String(mt.tp), String(mt.fp), String(mt.fn), String(mt.tn), fmt(mt.precision), fmt(mt.recall), fmt(mt.f1)]);
  return out;
}

// detection-rate metric (สำหรับ evasion และ malicious): detected vs bypassed
function detectRate(rows: Row[], hitsById: Map<string, string[]>) {
  let detected = 0;
  let bypassed = 0;
  const bypassedFiles: { file: string; rule: string }[] = [];
  const resultRows: string[][] = [];
  for (const row of rows) {
    const hits = hitsById.get(row.id) || [];
    const ok = hits.indexOf(row.rule_id) !== -1;
    if (ok) detected += 1;
    else {
      bypassed += 1;
      bypassedFiles.push({ file: row.id, rule: row.rule_id });
    }
    resultRows.push([row.id, row.rule_id, hits.join(';'), ok ? 'DETECTED' : 'BYPASSED', hits.filter((h) => h !== row.rule_id).join(';')]);
  }
  return { detected, bypassed, total: detected + bypassed, bypassedFiles, resultRows };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main(): void {
  if (!fs.existsSync(GROUND_TRUTH)) throw new Error(`ไม่พบ ${GROUND_TRUTH}`);

  const scanner = new scannerModule.ScannerService(new auditModule.DependencyAuditService());
  const ruleIds = loadRuleIds();
  const realOrigins = loadRealOrigins();
  const malGroupOrigin = loadMalGroupOrigins();

  const diskRows = readGroundTruthV2(realOrigins);

  // ยืนยันไฟล์บนดิสก์ครบ (synthetic + real) ก่อน — malicious เช็คแยก (อาจดึงไม่ได้)
  const missing = diskRows.filter((r) => !fs.existsSync(r.absPath)).map((r) => r.id);
  if (missing.length) {
    console.error('พบไฟล์ใน ground_truth.csv ที่ไม่มีจริง ' + missing.length + ' ไฟล์:');
    for (const f of missing) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }

  let malDir: string | null = null;
  try {
    let mal: { rows: Row[]; dir: string | null } = { rows: [], dir: null };
    if (SKIP_MALICIOUS) {
      console.log('>> malicious: skipped (SKIP_MALICIOUS=1) — ไม่ดึง ไม่แตะ /tmp');
      // ลบผล malicious ของรอบก่อนใน output-v2 กันเอาไปปนกับรอบนี้
      for (const f of ['malicious-metrics.csv', 'malicious-results.csv']) {
        const fp = path.join(OUTPUT_DIR, f);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    } else {
      mal = fetchMalicious(malGroupOrigin);
    }
    malDir = mal.dir;
    const malRows = mal.rows.filter((r) => fs.existsSync(r.absPath));

    const allRows: Row[] = [...diskRows, ...malRows];

    console.log('');
    console.log('Experiment 1 (v2) — Detection effectiveness (dataset ผสมโค้ดจริง)');
    console.log('  repo root : ' + REPO_ROOT);
    console.log('  dataset   : ' + DATASET_DIR);
    console.log('  rules     : ' + ruleIds.length + ' (' + ruleIds.join(', ') + ')');
    console.log('  on-disk   : ' + diskRows.length + ' ไฟล์ (synthetic + real)');
    console.log('  malicious : ' + malRows.length + ' ไฟล์ (ดึงชั่วคราว)');

    // --- สแกนทีละไฟล์ ---
    const hitsById = new Map<string, string[]>();
    for (const row of allRows) {
      const content = fs.readFileSync(row.absPath, 'utf8');
      const findings: Finding[] = scanner.scanText(row.id, content);
      hitsById.set(row.id, Array.from(new Set(findings.map((f) => f.rule_id))).sort());
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // --- แยกกอง ---
    const mainAll = allRows.filter((r) => r.baseCat === 'positive' || r.baseCat === 'negative' || r.baseCat === 'clean');
    const mainSyn = mainAll.filter((r) => r.source === 'synthetic');
    const mainReal = mainAll.filter((r) => r.source === 'real');
    const evasionRows = allRows.filter((r) => r.baseCat === 'evasion');
    const malAll = allRows.filter((r) => r.baseCat === 'malicious');

    // ============ (1)(2)(3) ตารางหลัก 3 ขอบเขต ============
    console.log('');
    console.log('='.repeat(70));
    console.log('ตารางหลัก (positive/negative/clean) — ห้ามปรับกฎ/threshold วัดตามจริง');
    const mSyn = printMainTable('(1) SYNTHETIC เท่านั้น (เทียบ v1)', mainSyn, ruleIds, hitsById);
    const mReal = printMainTable('(2) REAL เท่านั้น (โค้ดจริง)', mainReal, ruleIds, hitsById);
    const mComb = printMainTable('(3) รวมทั้งหมด (synthetic + real)', mainAll, ruleIds, hitsById);

    writeCsv(path.join(OUTPUT_DIR, 'metrics-synthetic.csv'), ['rule_id', 'tp', 'fp', 'fn', 'tn', 'precision', 'recall', 'f1'], metricsCsvRows(mainSyn, ruleIds, hitsById));
    writeCsv(path.join(OUTPUT_DIR, 'metrics-real.csv'), ['rule_id', 'tp', 'fp', 'fn', 'tn', 'precision', 'recall', 'f1'], metricsCsvRows(mainReal, ruleIds, hitsById));
    writeCsv(path.join(OUTPUT_DIR, 'metrics-combined.csv'), ['rule_id', 'tp', 'fp', 'fn', 'tn', 'precision', 'recall', 'f1'], metricsCsvRows(mainAll, ruleIds, hitsById));

    // results ต่อไฟล์ (main รวม) + FP รายละเอียด
    const resultRows: string[][] = [];
    const fpDetails: { file: string; rule: string; source: Source; isDoc: boolean }[] = [];
    const fnDetails: { file: string; rule: string; source: Source }[] = [];
    for (const row of mainAll) {
      const hits = hitsById.get(row.id) || [];
      const shouldCatch = row.expected === 'yes';
      const caught = shouldCatch && hits.indexOf(row.rule_id) !== -1;
      const extra = hits.filter((h) => !(shouldCatch && h === row.rule_id));
      let verdict: string;
      if (shouldCatch) verdict = caught ? (extra.length ? 'TP+FP' : 'TP') : extra.length ? 'FN+FP' : 'FN';
      else verdict = extra.length ? 'FP' : 'TN';
      resultRows.push([row.id, row.source, row.baseCat, row.origin, row.rule_id, row.expected, hits.join(';'), extra.join(';'), verdict]);
      if (!shouldCatch) for (const h of extra) fpDetails.push({ file: row.id, rule: h, source: row.source, isDoc: isDocNegative(row) });
      if (shouldCatch && !caught) fnDetails.push({ file: row.id, rule: row.rule_id, source: row.source });
    }
    writeCsv(path.join(OUTPUT_DIR, 'results-main.csv'), ['filename', 'source', 'category', 'origin', 'expected_rule', 'expected', 'detected_rules', 'unexpected_rules', 'verdict'], resultRows);

    // ============ (4) แยกตามแหล่งที่มา ============
    console.log('');
    console.log('='.repeat(70));
    console.log('(4) แยกตามแหล่งที่มา (origin repo)');
    const origins = Array.from(new Set(allRows.filter((r) => r.baseCat !== 'evasion').map((r) => r.origin))).sort();
    const bySrcRows: string[][] = [];
    const Wo = 34;
    console.log(pad('origin', Wo) + padLeft('files', 7) + padLeft('TP', 5) + padLeft('FP', 5) + padLeft('FN', 5) + padLeft('TN', 5) + padLeft('det', 5) + padLeft('byp', 5));
    console.log('-'.repeat(Wo + 37));
    for (const o of origins) {
      const mainO = mainAll.filter((r) => r.origin === o);
      const malO = malAll.filter((r) => r.origin === o);
      const cm = confusionByRule(mainO, ruleIds, hitsById).total;
      const dr = detectRate(malO, hitsById);
      const files = mainO.length + malO.length;
      bySrcRows.push([o, String(files), String(cm.tp), String(cm.fp), String(cm.fn), String(cm.tn), String(dr.detected), String(dr.bypassed)]);
      console.log(pad(o, Wo) + padLeft(String(files), 7) + padLeft(String(cm.tp), 5) + padLeft(String(cm.fp), 5) + padLeft(String(cm.fn), 5) + padLeft(String(cm.tn), 5) + padLeft(String(dr.detected), 5) + padLeft(String(dr.bypassed), 5));
    }
    writeCsv(path.join(OUTPUT_DIR, 'by-source.csv'), ['origin', 'files', 'tp', 'fp', 'fn', 'tn', 'malicious_detected', 'malicious_bypassed'], bySrcRows);

    // ============ (5) evasion แยก (เหมือนเดิม) ============
    const eva = detectRate(evasionRows, hitsById);
    writeCsv(path.join(OUTPUT_DIR, 'evasion-results.csv'), ['filename', 'target_rule', 'detected_rules', 'verdict', 'cross_hits'], eva.resultRows);
    console.log('');
    console.log('='.repeat(70));
    console.log('(5) กอง EVASION (synthetic) — วัดแยก ไม่กระทบตารางหลัก');
    console.log('  ไฟล์: ' + eva.total + '  detected(กันได้): ' + eva.detected + '  bypassed(หลบสำเร็จ): ' + eva.bypassed);
    console.log('  detection rate: ' + (eva.total ? pct(eva.detected / eva.total) : '-') + '   evasion success: ' + (eva.total ? pct(eva.bypassed / eva.total) : '-'));

    // ============ (6) malicious จริง (ดึงชั่วคราว) ============
    console.log('');
    console.log('='.repeat(70));
    console.log('(6) กอง MALICIOUS จริง (webshell/ATT&CK/payload — ดึงชั่วคราว) — วัด detection rate');
    if (SKIP_MALICIOUS) {
      console.log('  malicious: skipped (SKIP_MALICIOUS=1) — ไม่มีผลกองนี้ในรอบนี้');
    } else if (malAll.length === 0) {
      console.log('  (ข้าม: ดึงไม่ได้หรือไม่มีไฟล์ — ดู warning ด้านบน)');
    } else {
      // ต่อ target_rule
      const byRule = new Map<string, Row[]>();
      for (const r of malAll) {
        if (!byRule.has(r.rule_id)) byRule.set(r.rule_id, []);
        byRule.get(r.rule_id).push(r);
      }
      const malMetricRows: string[][] = [];
      const W = 26;
      console.log(pad('target_rule', W) + padLeft('total', 7) + padLeft('detect', 8) + padLeft('bypass', 8) + padLeft('detect%', 10));
      console.log('-'.repeat(W + 33));
      for (const id of ruleIds) {
        const rs = byRule.get(id);
        if (!rs || !rs.length) continue;
        const dr = detectRate(rs, hitsById);
        malMetricRows.push([id, String(dr.total), String(dr.detected), String(dr.bypassed), (dr.detected / dr.total).toFixed(4), (dr.bypassed / dr.total).toFixed(4)]);
        console.log(pad(id, W) + padLeft(String(dr.total), 7) + padLeft(String(dr.detected), 8) + padLeft(String(dr.bypassed), 8) + padLeft(pct(dr.detected / dr.total), 10));
      }
      const drAll = detectRate(malAll, hitsById);
      malMetricRows.push(['TOTAL', String(drAll.total), String(drAll.detected), String(drAll.bypassed), (drAll.detected / drAll.total).toFixed(4), (drAll.bypassed / drAll.total).toFixed(4)]);
      console.log('-'.repeat(W + 33));
      console.log(pad('TOTAL', W) + padLeft(String(drAll.total), 7) + padLeft(String(drAll.detected), 8) + padLeft(String(drAll.bypassed), 8) + padLeft(pct(drAll.detected / drAll.total), 10));
      writeCsv(path.join(OUTPUT_DIR, 'malicious-metrics.csv'), ['target_rule', 'total', 'detected', 'bypassed', 'detection_rate', 'evasion_success_rate'], malMetricRows);
      writeCsv(path.join(OUTPUT_DIR, 'malicious-results.csv'), ['filename', 'target_rule', 'detected_rules', 'verdict', 'cross_hits'], drAll.resultRows);
    }

    // --- FP/FN สรุป + ไฟล์ FP แยกกลุ่ม ---
    const docFps = fpDetails.filter((d) => d.isDoc);
    const codeFps = fpDetails.filter((d) => !d.isDoc);
    writeCsv(path.join(OUTPUT_DIR, 'false-positives-documentation.csv'), ['filename', 'rule_id', 'source'], docFps.map((d) => [d.file, d.rule, d.source]));
    writeCsv(path.join(OUTPUT_DIR, 'false-positives-code.csv'), ['filename', 'rule_id', 'source'], codeFps.map((d) => [d.file, d.rule, d.source]));

    console.log('');
    console.log('='.repeat(70));
    console.log('สรุป micro-avg: SYNTHETIC prec ' + pct(mSyn.precision) + ' / recall ' + pct(mSyn.recall) + ' / F1 ' + pct(mSyn.f1));
    console.log('               REAL      prec ' + pct(mReal.precision) + ' / recall ' + pct(mReal.recall) + ' / F1 ' + pct(mReal.f1));
    console.log('               COMBINED  prec ' + pct(mComb.precision) + ' / recall ' + pct(mComb.recall) + ' / F1 ' + pct(mComb.f1));
    console.log('False negative (main): ' + fnDetails.length + '   False positive (main): ' + fpDetails.length + ' (doc ' + docFps.length + ' / code ' + codeFps.length + ')');
    console.log('');
    console.log('เขียนผลลง ' + OUTPUT_DIR + ' :');
    console.log('  metrics-synthetic.csv / metrics-real.csv / metrics-combined.csv');
    console.log('  results-main.csv / by-source.csv');
    console.log('  false-positives-documentation.csv / false-positives-code.csv');
    console.log('  evasion-results.csv');
    console.log(SKIP_MALICIOUS ? '  malicious: skipped — ไม่มี malicious-*.csv' : '  malicious-metrics.csv / malicious-results.csv (ถ้าดึงได้)');
  } finally {
    // ลบกอง malicious ทิ้งเสมอ แม้รันพังกลางทาง (ตามเงื่อนไข)
    if (malDir) {
      try {
        fs.rmSync(malDir, { recursive: true, force: true });
        console.log('>> ลบกอง malicious ทิ้งแล้ว: ' + malDir);
      } catch (e) {
        console.error('!! ลบ ' + malDir + ' ไม่สำเร็จ — โปรดลบเองด้วย: rm -rf "' + malDir + '"');
      }
    }
  }
}

main();
