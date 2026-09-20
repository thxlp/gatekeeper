/**
 * Experiment 3 — วัด "ต้นทุนเวลา" ของด่านสแกน (security_scan) แบบ offline microbenchmark
 *
 * เรียก ScannerService.scanText() + GitAutomatorService.listTextFiles() ตัวจริงจาก
 * backend/src/ มาจับเวลากับชุดข้อมูล tests/detection-dataset/ ที่มีอยู่แล้ว
 * แล้วเทียบกับเวลา build+deploy จริงที่ระบบเคยเขียนไว้ใน data/usage.jsonl × data/audit.log
 *
 * ต่อยอดโครงจาก tests/detection-experiment/run-detection-test.ts (Experiment 1) —
 * รูปแบบการ require, การตั้ง GATEKEEPER_ROOT, การเขียน CSV ใช้แพทเทิร์นเดียวกัน
 *
 * ขอบเขตโดยเจตนา (อย่าขยายโดยไม่ตั้งใจ):
 *   - ไม่เรียก runPipeline / DeployPipelineService / docker / docker-socket-proxy / Postgres
 *   - ไม่ deploy, ไม่ restart service, ไม่แก้ไฟล์ใดๆ ใน data/ หรือ configs/
 *   - อ่าน data/usage.jsonl + data/audit.log **อ่านอย่างเดียว** (เพื่อเอาเวลา build+deploy จริง)
 *     และไม่เขียน accountId ลงไฟล์ผลลัพธ์ (ตามกติกาเอกสารใน docs/research/NOTES_PENTEST.md)
 *   - ไม่วัด scanDependencies() แยกเป็นเมตริกหลัก — SCA ยังเป็น stub (ตรวจแค่ว่ามี manifest ไหม)
 *     ค่าที่วัดได้จึง **ไม่ใช่** ต้นทุนของ dependency scanning จริง (มีแถวกำกับไว้ในสรุป)
 *   - เขียนผลลง tests/perf-experiment/output/ เท่านั้น
 *
 * วิธีรัน: ดู tests/perf-experiment/README.md
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

/**
 * tests/perf-experiment/ -> tests/ -> gatekeeper/
 * (ยอมให้ GATEKEEPER_ROOT ทับได้ เพื่อให้รันสำเนาสคริปต์จากที่อื่นได้ด้วย เช่นตอน smoke test
 *  นอก repo — ค่า default คือตำแหน่งจริงของไฟล์นี้ ไม่ต้องตั้ง env ก็รันได้)
 */
const REPO_ROOT = process.env.GATEKEEPER_ROOT
  ? path.resolve(process.env.GATEKEEPER_ROOT)
  : path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
const DATASET_DIR = path.join(REPO_ROOT, 'tests', 'detection-dataset');
const OUTPUT_DIR = path.join(__dirname, 'output');
const GROUND_TRUTH = path.join(DATASET_DIR, 'ground_truth.csv');
const DATA_DIR = path.join(REPO_ROOT, 'data');

/**
 * ScannerService / common/paths.ts คำนวณ CONFIGS_DIR ตอน module load จาก
 * process.env.GATEKEEPER_ROOT — ต้องตั้ง *ก่อน* require เพื่อให้รันจาก cwd ไหนก็ได้
 * (ด้วยเหตุผลเดียวกันไฟล์นี้ใช้ require() ไม่ใช่ import ซึ่งถูก hoist ขึ้นบนสุด)
 */
if (!process.env.GATEKEEPER_ROOT) {
  process.env.GATEKEEPER_ROOT = REPO_ROOT;
}

// reflect-metadata / @nestjs อยู่ใน backend/node_modules ซึ่งไม่อยู่บนเส้น resolution ของไฟล์นี้
require(require.resolve('reflect-metadata', { paths: [BACKEND_DIR] }));

// backend ไม่ได้เปิด esModuleInterop — ห้าม default-import CJS (กฎใน CLAUDE.md)
const scannerModule = require(path.join(BACKEND_DIR, 'src', 'scanner', 'scanner.service'));
const depAuditModule = require(path.join(BACKEND_DIR, 'src', 'scanner', 'dependency-audit.service'));
const automatorModule = require(path.join(BACKEND_DIR, 'src', 'webhook', 'git-automator.service'));

// ---------------------------------------------------------------------------
// config (ปรับผ่าน env ได้ ค่า default คือค่าที่ใช้รายงานในเล่ม)
// ---------------------------------------------------------------------------

const REPS = intEnv('SCAN_BENCH_REPS', 50); // รอบที่นำมาคิดสถิติ ต่อไฟล์
const WARMUP = intEnv('SCAN_BENCH_WARMUP', 5); // รอบอุ่นเครื่อง (ไม่นับ) ให้ JIT/regex cache เข้าที่
const IO_REPS = intEnv('SCAN_BENCH_IO_REPS', 20); // รอบวัด listTextFiles (เดินไฟล์ + อ่านทั้งชุด)
const SCALE_MAX = intEnv('SCAN_BENCH_SCALE_MAX', 64); // ทวีคูณสูงสุดของ input ในการทดสอบ scaling
const SCALE_REPS = intEnv('SCAN_BENCH_SCALE_REPS', 20);

function intEnv(name: string, dflt: number): number {
  const raw = process.env[name];
  if (!raw) return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) throw new Error(`${name} ต้องเป็นจำนวนเต็ม >= 1 (ได้ "${raw}")`);
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

type Category = 'positive' | 'negative' | 'clean' | 'evasion';

interface DatasetFile {
  filename: string;
  category: Category;
  content: string;
  bytes: number;
  lines: number;
  /** จำนวน rule ที่ไฟล์นี้ถูกจับได้ — regex .test() หยุดที่ match แรก จึงมีผลต่อเวลา */
  hits: number;
}

interface Stats {
  n: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
  stdev: number;
  variance: number;
  cv: number; // coefficient of variation = stdev/mean (เทียบความผันผวนข้ามไฟล์ที่เวลาต่างกันมาก)
}

// ---------------------------------------------------------------------------
// stats helpers
// ---------------------------------------------------------------------------

/** percentile แบบ nearest-rank บน array ที่ sort แล้ว (นิยามเดียวกันทุกที่ในสคริปต์นี้) */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function describe(values: number[]): Stats {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  // variance แบบ sample (n-1) — เราสุ่มรอบวัดจากประชากรของ "การรันที่เป็นไปได้ทั้งหมด"
  const variance = n > 1 ? sorted.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0;
  const stdev = Math.sqrt(variance);
  return {
    n,
    min: sorted[0],
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95: percentile(sorted, 95),
    max: sorted[n - 1],
    mean,
    stdev,
    variance,
    cv: mean === 0 ? 0 : stdev / mean,
  };
}

/** Pearson r — ใช้ดูความสัมพันธ์ระหว่างขนาด input กับเวลาสแกน */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

/** least-squares y = a + b·x — b คือ "µs ต่อ KB" ที่เอาไปพูดถึงในเล่มได้ */
function linreg(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

// ---------------------------------------------------------------------------
// csv / format helpers (แพทเทิร์นเดียวกับ Experiment 1)
// ---------------------------------------------------------------------------

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

function writeCsv(file: string, header: string[], rows: string[][]): void {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  fs.writeFileSync(file, body + '\n', 'utf8');
}

const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '');
const f4 = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : '');
const nsToUs = (ns: number) => ns / 1000;

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

// ---------------------------------------------------------------------------
// dataset
// ---------------------------------------------------------------------------

function readDataset(): DatasetFile[] {
  const lines = fs
    .readFileSync(GROUND_TRUTH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const header = lines.shift();
  if (header !== 'filename,rule_id,expected,category') {
    throw new Error(`ground_truth.csv header ไม่ตรงกับที่คาดไว้: ${header}`);
  }

  // ground_truth.csv อาจมีหลายแถวต่อไฟล์เดียว (หลายกฎ) — วัดเวลาต่อ "ไฟล์" จึง dedupe
  const seen = new Set<string>();
  const files: DatasetFile[] = [];
  const missing: string[] = [];

  for (const line of lines) {
    const cols = line.split(',');
    const filename = cols[0];
    const category = cols[3] as Category;
    if (seen.has(filename)) continue;
    seen.add(filename);

    const abs = path.join(DATASET_DIR, filename);
    if (!fs.existsSync(abs)) {
      missing.push(filename);
      continue;
    }
    const content = fs.readFileSync(abs, 'utf8');
    files.push({
      filename,
      category,
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
      lines: content.split('\n').length,
      hits: 0,
    });
  }

  if (missing.length) {
    throw new Error(
      'ground_truth.csv อ้างไฟล์ที่ไม่มีอยู่จริง ' + missing.length + ' ไฟล์: ' + missing.join(', '),
    );
  }
  return files;
}

// ---------------------------------------------------------------------------
// baseline: build+deploy จริงจาก usage.jsonl × audit.log (อ่านอย่างเดียว)
// ---------------------------------------------------------------------------

/**
 * usage.jsonl ถูกเขียนทันทีหลัง risk engine ตัดสิน ก่อนเข้า stage build
 *   (backend/src/deploy/deploy-pipeline.service.ts:341-348 → entitlement/usage-collector.service.ts:29)
 *   → ts ≈ "เวลาจบ security_scan"
 * audit.log แถว stage='decision' decision='ALLOW' ถูกเขียนหลัง deploy สำเร็จ
 *   (deploy-pipeline.service.ts:421-429) → ts ≈ "เวลาจบ production_deploy"
 * ทั้งสองแถวใช้ requestId เดียวกัน → join ได้ ผลต่าง = build + deploy (ไม่รวม scan, ไม่รวม clone)
 */
interface BaselineRow {
  requestId: string;
  feature: string;
  scanEnd: string;
  deployEnd: string;
  seconds: number;
}

function readBaseline(): { rows: BaselineRow[]; note: string } {
  const usagePath = path.join(DATA_DIR, 'usage.jsonl');
  const auditPath = process.env.AUDIT_LOG_PATH || path.join(DATA_DIR, 'audit.log');
  if (!fs.existsSync(usagePath) || !fs.existsSync(auditPath)) {
    return { rows: [], note: `ไม่พบ ${usagePath} หรือ ${auditPath} — ข้ามส่วนเทียบ baseline` };
  }

  const scanEnd = new Map<string, { ts: string; feature: string }>();
  for (const line of fs.readFileSync(usagePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      // เอาแถวแรกของ requestId นั้น (หนึ่ง pipeline เขียน recordUsage ครั้งเดียว)
      if (e.requestId && !scanEnd.has(e.requestId)) {
        scanEnd.set(e.requestId, { ts: e.ts, feature: e.feature || e.stage || '' });
      }
    } catch {
      /* บรรทัดเสียข้ามไป — เหมือน AuditService.readAll() ที่ข้ามทีละบรรทัด */
    }
  }

  const rows: BaselineRow[] = [];
  for (const line of fs.readFileSync(auditPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.stage !== 'decision' || e.decision !== 'ALLOW') continue;
    const start = scanEnd.get(e.requestId);
    if (!start) continue;
    const seconds = (Date.parse(e.ts) - Date.parse(start.ts)) / 1000;
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    // ไม่เขียน accountId/appId ลงผลลัพธ์ — requestId เป็น uuid สุ่มที่ไม่ผูกตัวบุคคล
    rows.push({ requestId: e.requestId, feature: start.feature, scanEnd: start.ts, deployEnd: e.ts, seconds });
  }

  rows.sort((a, b) => Date.parse(a.deployEnd) - Date.parse(b.deployEnd));
  return { rows, note: '' };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const scanner = new scannerModule.ScannerService(new depAuditModule.DependencyAuditService());
  const automator = new automatorModule.GitAutomatorService();
  const files = readDataset();

  console.log('Experiment 3 — Performance overhead ของด่าน security_scan (offline microbenchmark)');
  console.log('  repo root : ' + REPO_ROOT);
  console.log('  dataset   : ' + DATASET_DIR + ' (' + files.length + ' ไฟล์)');
  console.log('  node      : ' + process.version + '  platform: ' + process.platform);
  console.log('  reps      : warmup ' + WARMUP + ' + measured ' + REPS + ' รอบต่อไฟล์');
  console.log('  io reps   : ' + IO_REPS + ' (listTextFiles ทั้งชุด)');
  console.log('');

  // --- 0) hits ต่อไฟล์ (ไว้อธิบายผล — regex .test() หยุดที่ match แรก) ------
  for (const f of files) {
    const findings = scanner.scanText(f.filename, f.content);
    f.hits = new Set(findings.map((x: any) => x.rule_id)).size;
  }

  // --- 1) warmup ----------------------------------------------------------
  for (let r = 0; r < WARMUP; r++) {
    for (const f of files) scanner.scanText(f.filename, f.content);
  }

  // --- 2) วัดจริง: วนรอบเป็นวงนอก ไฟล์เป็นวงใน -----------------------------
  // (สลับลำดับแบบนี้เพื่อให้ผลของ GC / ความถี่ CPU ที่แกว่งช้าๆ กระจายตัวข้ามทุกไฟล์
  //  เท่ากัน ไม่ไปกองอยู่กับไฟล์ที่เผอิญถูกวัดตอนเครื่องกำลังยุ่ง)
  const samples = new Map<string, number[]>();
  for (const f of files) samples.set(f.filename, []);
  const roundTotalNs: number[] = [];

  for (let r = 0; r < REPS; r++) {
    let total = 0;
    for (const f of files) {
      const t0 = process.hrtime.bigint();
      scanner.scanText(f.filename, f.content);
      const t1 = process.hrtime.bigint();
      const ns = Number(t1 - t0);
      samples.get(f.filename).push(ns);
      total += ns;
    }
    roundTotalNs.push(total);
  }

  // --- 3) วัด I/O ของด่านสแกน: listTextFiles() ตัวจริง --------------------
  // ในโค้ดจริง stage security_scan รวมการเดินไฟล์ + อ่านทุกไฟล์เข้า memory ด้วย
  // (deploy-pipeline.service.ts:332 → webhook/git-automator.service.ts:150-178)
  // ต้นทุนส่วนนี้เกิดเพราะมีด่านสแกน จึงต้องนับรวมในเลข overhead
  const ioNs: number[] = [];
  let ioFileCount = 0;
  let ioBytes = 0;
  for (let r = 0; r < IO_REPS; r++) {
    const t0 = process.hrtime.bigint();
    const scanned = automator.listTextFiles(DATASET_DIR);
    const t1 = process.hrtime.bigint();
    ioNs.push(Number(t1 - t0));
    ioFileCount = scanned.length;
    ioBytes = scanned.reduce((a: number, s: any) => a + Buffer.byteLength(s.content, 'utf8'), 0);
  }
  const ioStats = describe(ioNs);

  // --- 4) scaling: input ใหญ่ขึ้นเป็นทวีคูณ -------------------------------
  // ไฟล์ในชุดข้อมูลเล็ก (ระดับ KB) — ทำซ้ำเนื้อหาเพื่อกวาดขนาดหลาย decade
  // แล้วดูว่าเวลาต่อ KB คงที่ไหม (regex เป็น linear scan ควรคงที่ ถ้าไม่คงที่ต้องอธิบาย)
  const scaleSeeds = pickScaleSeeds(files);
  const scaleRows: string[][] = [];
  for (const seed of scaleSeeds) {
    for (let k = 1; k <= SCALE_MAX; k *= 2) {
      const content = seed.content.repeat(k);
      const bytes = Buffer.byteLength(content, 'utf8');
      const times: number[] = [];
      for (let r = 0; r < SCALE_REPS; r++) {
        const t0 = process.hrtime.bigint();
        scanner.scanText(seed.filename, content);
        const t1 = process.hrtime.bigint();
        times.push(Number(t1 - t0));
      }
      const s = describe(times);
      scaleRows.push([
        seed.filename,
        seed.category,
        String(k),
        String(bytes),
        f3(nsToUs(s.median)),
        f3(nsToUs(s.p95)),
        f4(nsToUs(s.median) / (bytes / 1024)),
      ]);
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // --- 5) experiment3-timing.csv : หนึ่งแถวต่อหนึ่งไฟล์ --------------------
  const perFile = files.map((f) => ({ f, s: describe(samples.get(f.filename)) }));
  writeCsv(
    path.join(OUTPUT_DIR, 'experiment3-timing.csv'),
    [
      'filename',
      'category',
      'bytes',
      'lines',
      'rules_hit',
      'reps',
      'median_us',
      'p95_us',
      'mean_us',
      'stdev_us',
      'variance_us2',
      'cv',
      'min_us',
      'max_us',
      'us_per_kb_median',
    ],
    perFile.map(({ f, s }) => [
      f.filename,
      f.category,
      String(f.bytes),
      String(f.lines),
      String(f.hits),
      String(s.n),
      f3(nsToUs(s.median)),
      f3(nsToUs(s.p95)),
      f3(nsToUs(s.mean)),
      f3(nsToUs(s.stdev)),
      f4(nsToUs(s.stdev) * nsToUs(s.stdev)),
      f4(s.cv),
      f3(nsToUs(s.min)),
      f3(nsToUs(s.max)),
      f4(nsToUs(s.median) / (f.bytes / 1024)),
    ]),
  );

  writeCsv(
    path.join(OUTPUT_DIR, 'experiment3-scaling.csv'),
    ['seed_file', 'category', 'repeat_factor', 'bytes', 'median_us', 'p95_us', 'us_per_kb_median'],
    scaleRows,
  );

  // --- 6) baseline จาก log จริง ------------------------------------------
  const baseline = readBaseline();
  if (baseline.rows.length) {
    writeCsv(
      path.join(OUTPUT_DIR, 'experiment3-baseline.csv'),
      ['request_id', 'feature', 'scan_end_ts', 'deploy_end_ts', 'build_deploy_seconds'],
      baseline.rows.map((r) => [r.requestId, r.feature, r.scanEnd, r.deployEnd, f3(r.seconds)]),
    );
  }

  // --- 7) สถิติรวม + overhead -------------------------------------------
  const totalStats = describe(roundTotalNs); // เวลาสแกน "ทั้งชุด" ต่อรอบ (regex ล้วน)
  const datasetBytes = files.reduce((a, f) => a + f.bytes, 0);
  const datasetLines = files.reduce((a, f) => a + f.lines, 0);

  // ต้นทุนด่านสแกนของ "repo สังเคราะห์ = ชุดข้อมูลทั้งกอง" = I/O + regex
  const scanStageMs = (ioStats.median + totalStats.median) / 1e6;

  const bySize = perFile.map(({ f, s }) => ({ kb: f.bytes / 1024, us: nsToUs(s.median), lines: f.lines }));
  const rBytes = pearson(bySize.map((x) => x.kb), bySize.map((x) => x.us));
  const rLines = pearson(bySize.map((x) => x.lines), bySize.map((x) => x.us));
  const fit = linreg(bySize.map((x) => x.kb), bySize.map((x) => x.us));

  const baseStats = baseline.rows.length ? describe(baseline.rows.map((r) => r.seconds)) : null;
  // overhead % = ต้นทุนด่านสแกน / เวลาที่เหลือของ pipeline (build+deploy = baseline ที่ไม่มีสแกน)
  const overheadMedian = baseStats ? (scanStageMs / 1000 / baseStats.median) * 100 : NaN;
  const overheadP95Worst = baseStats
    ? ((ioStats.p95 + totalStats.p95) / 1e6 / 1000 / baseStats.min) * 100
    : NaN;

  const summary: [string, string][] = [
    ['node_version', process.version],
    ['platform', process.platform + ' ' + process.arch],
    ['cpus', String(require('os').cpus().length) + ' × ' + (require('os').cpus()[0]?.model || 'unknown')],
    ['measured_at', new Date().toISOString()],
    ['dataset_files', String(files.length)],
    ['dataset_bytes', String(datasetBytes)],
    ['dataset_lines', String(datasetLines)],
    ['reps_per_file', String(REPS)],
    ['warmup_rounds', String(WARMUP)],
    ['samples_total', String(files.length * REPS)],
    ['scan_per_file_median_us', f3(nsToUs(describe(perFile.map((x) => x.s.median)).median))],
    ['scan_per_file_p95_us', f3(nsToUs(describe(perFile.map((x) => x.s.p95)).p95))],
    ['scan_dataset_median_ms', f3(totalStats.median / 1e6)],
    ['scan_dataset_p95_ms', f3(totalStats.p95 / 1e6)],
    ['scan_dataset_cv', f4(totalStats.cv)],
    ['io_listtextfiles_files', String(ioFileCount)],
    ['io_listtextfiles_bytes', String(ioBytes)],
    ['io_listtextfiles_median_ms', f3(ioStats.median / 1e6)],
    ['io_listtextfiles_p95_ms', f3(ioStats.p95 / 1e6)],
    ['scan_stage_total_median_ms', f3(scanStageMs)],
    ['throughput_mb_per_s', f3(datasetBytes / 1024 / 1024 / (totalStats.median / 1e9))],
    ['pearson_r_bytes_vs_time', f4(rBytes)],
    ['pearson_r_lines_vs_time', f4(rLines)],
    ['fit_us_per_kb', f4(fit.b)],
    ['fit_intercept_us', f4(fit.a)],
    ['baseline_source', baseline.rows.length ? 'data/usage.jsonl × data/audit.log (join requestId)' : baseline.note],
    ['baseline_n', baseStats ? String(baseStats.n) : '0'],
    ['baseline_build_deploy_median_s', baseStats ? f3(baseStats.median) : ''],
    ['baseline_build_deploy_min_s', baseStats ? f3(baseStats.min) : ''],
    ['baseline_build_deploy_p95_s', baseStats ? f3(baseStats.p95) : ''],
    ['overhead_pct_median_case', Number.isFinite(overheadMedian) ? f4(overheadMedian) : ''],
    ['overhead_pct_worst_case', Number.isFinite(overheadP95Worst) ? f4(overheadP95Worst) : ''],
    ['sca_note', 'scanDependencies() ยังเป็น stub — ตัวเลขนี้ไม่ใช่ต้นทุนของ dependency scanning จริง'],
  ];

  writeCsv(
    path.join(OUTPUT_DIR, 'experiment3-summary.csv'),
    ['metric', 'value'],
    summary.map(([k, v]) => [k, v]),
  );

  writeSummaryMarkdown(summary, perFile, baseStats, scanStageMs, overheadMedian);

  // --- 8) พิมพ์สรุปลง console -------------------------------------------
  console.log('ต้นทุนด่านสแกน (ชุดข้อมูลทั้งกองเป็น repo สังเคราะห์)');
  console.log('  regex scanText ทั้งชุด : median ' + f3(totalStats.median / 1e6) + ' ms  p95 ' + f3(totalStats.p95 / 1e6) + ' ms  CV ' + f4(totalStats.cv));
  console.log('  listTextFiles (I/O)    : median ' + f3(ioStats.median / 1e6) + ' ms  p95 ' + f3(ioStats.p95 / 1e6) + ' ms');
  console.log('  รวมเป็นต้นทุน stage     : ' + f3(scanStageMs) + ' ms  (' + files.length + ' ไฟล์ / ' + datasetBytes + ' bytes)');
  console.log('  throughput             : ' + f3(datasetBytes / 1024 / 1024 / (totalStats.median / 1e9)) + ' MB/s');
  console.log('');
  console.log('ความสัมพันธ์กับขนาด input');
  console.log('  Pearson r (KB vs µs)   : ' + f4(rBytes) + '   (บรรทัด vs µs: ' + f4(rLines) + ')');
  console.log('  least squares          : ' + f4(fit.b) + ' µs/KB + ' + f4(fit.a) + ' µs');
  console.log('');
  if (baseStats) {
    console.log('baseline build+deploy จาก log จริง (n=' + baseStats.n + ')');
    console.log('  median ' + f3(baseStats.median) + ' s   min ' + f3(baseStats.min) + ' s   p95 ' + f3(baseStats.p95) + ' s');
    console.log('  >> overhead ของด่านสแกน = ' + f4(overheadMedian) + ' % ของเวลา build+deploy (กรณีกลาง)');
    console.log('  >> กรณีแย่สุด (scan p95 / build+deploy ที่เร็วสุด) = ' + f4(overheadP95Worst) + ' %');
  } else {
    console.log('baseline: ' + baseline.note);
  }
  console.log('');

  // ตารางย่อ 5 ไฟล์ที่ช้าสุด — ไว้ตรวจว่าเวลาที่โผล่มาสูงมีเหตุผล (ขนาด/จำนวนกฎที่ match)
  const slowest = perFile.slice().sort((a, b) => b.s.median - a.s.median).slice(0, 5);
  console.log('5 ไฟล์ที่สแกนช้าสุด (median)');
  console.log('  ' + pad('file', 44) + padLeft('bytes', 8) + padLeft('hits', 6) + padLeft('median µs', 12) + padLeft('p95 µs', 10));
  for (const { f, s } of slowest) {
    console.log(
      '  ' + pad(f.filename, 44) + padLeft(String(f.bytes), 8) + padLeft(String(f.hits), 6) +
        padLeft(f3(nsToUs(s.median)), 12) + padLeft(f3(nsToUs(s.p95)), 10),
    );
  }
  console.log('');
  console.log('เขียนผลแล้ว:');
  for (const fn of ['experiment3-timing.csv', 'experiment3-scaling.csv', 'experiment3-baseline.csv', 'experiment3-summary.csv', 'experiment3-summary.md']) {
    const p = path.join(OUTPUT_DIR, fn);
    if (fs.existsSync(p)) console.log('  ' + p);
  }
}

/** เลือกไฟล์ต้นแบบของการทดสอบ scaling: ไฟล์ใหญ่สุดของกอง clean และของกอง positive */
function pickScaleSeeds(files: DatasetFile[]): DatasetFile[] {
  const pick = (cat: Category) =>
    files.filter((f) => f.category === cat).sort((a, b) => b.bytes - a.bytes)[0];
  return [pick('clean'), pick('positive')].filter((f) => f);
}

function writeSummaryMarkdown(
  summary: [string, string][],
  perFile: { f: DatasetFile; s: Stats }[],
  baseStats: Stats | null,
  scanStageMs: number,
  overheadMedian: number,
): void {
  const get = (k: string) => (summary.find((s) => s[0] === k) || ['', ''])[1];
  const byCat = new Map<string, number[]>();
  for (const { f, s } of perFile) {
    if (!byCat.has(f.category)) byCat.set(f.category, []);
    byCat.get(f.category).push(nsToUs(s.median));
  }

  const lines: string[] = [];
  lines.push('# Experiment 3 — ผลการวัด (สร้างโดย run-scan-benchmark.ts)');
  lines.push('');
  lines.push('> ไฟล์นี้ถูกเขียนใหม่ทุกครั้งที่รันสคริปต์ — อย่าแก้มือ');
  lines.push('');
  lines.push('วัดเมื่อ **' + get('measured_at') + '** บน ' + get('platform') + ' / node ' + get('node_version'));
  lines.push('CPU: ' + get('cpus'));
  lines.push('');
  lines.push('## วิธีวัด');
  lines.push('');
  lines.push('- เรียก `ScannerService.scanText()` ตัวจริง (`backend/src/scanner/scanner.service.ts:33-63`) ต่อไฟล์');
  lines.push('- warmup ' + get('warmup_rounds') + ' รอบ แล้ววัด ' + get('reps_per_file') + ' รอบต่อไฟล์ (รวม ' + get('samples_total') + ' ตัวอย่าง) วนรอบเป็นวงนอก');
  lines.push('- จับเวลาด้วย `process.hrtime.bigint()` (ความละเอียดระดับ ns)');
  lines.push('- วัด I/O ของด่านสแกนแยก: `GitAutomatorService.listTextFiles()` ตัวจริง (`backend/src/webhook/git-automator.service.ts:150-178`) ' + get('io_listtextfiles_files') + ' ไฟล์');
  lines.push('- **ไม่แตะ production**: ไม่เรียก `runPipeline`, ไม่ใช้ docker/Postgres, ไม่ deploy; อ่าน `data/usage.jsonl` + `data/audit.log` อย่างเดียว');
  lines.push('');
  lines.push('## ผลหลัก');
  lines.push('');
  lines.push('| เมตริก | ค่า |');
  lines.push('|---|---|');
  const show = [
    ['ไฟล์ในชุดข้อมูล', get('dataset_files') + ' ไฟล์ / ' + get('dataset_bytes') + ' bytes / ' + get('dataset_lines') + ' บรรทัด'],
    ['scanText ต่อไฟล์ (median ของ median)', get('scan_per_file_median_us') + ' µs'],
    ['scanText ต่อไฟล์ (p95)', get('scan_per_file_p95_us') + ' µs'],
    ['scanText ทั้งชุด', get('scan_dataset_median_ms') + ' ms (p95 ' + get('scan_dataset_p95_ms') + ' ms, CV ' + get('scan_dataset_cv') + ')'],
    ['listTextFiles (เดินไฟล์ + อ่าน)', get('io_listtextfiles_median_ms') + ' ms (p95 ' + get('io_listtextfiles_p95_ms') + ' ms)'],
    ['**ต้นทุนด่านสแกนรวม**', '**' + get('scan_stage_total_median_ms') + ' ms**'],
    ['throughput (regex)', get('throughput_mb_per_s') + ' MB/s'],
    ['Pearson r (ขนาด vs เวลา)', get('pearson_r_bytes_vs_time') + ' (บรรทัด: ' + get('pearson_r_lines_vs_time') + ')'],
    ['least squares', get('fit_us_per_kb') + ' µs/KB + ' + get('fit_intercept_us') + ' µs'],
  ];
  for (const [k, v] of show) lines.push('| ' + k + ' | ' + v + ' |');
  lines.push('');
  lines.push('## เวลา median ต่อไฟล์ แยกตามกองข้อมูล');
  lines.push('');
  lines.push('| category | ไฟล์ | median µs | p95 µs |');
  lines.push('|---|---|---|---|');
  for (const [cat, vals] of Array.from(byCat.entries()).sort()) {
    const s = describe(vals);
    lines.push('| ' + cat + ' | ' + vals.length + ' | ' + f3(s.median) + ' | ' + f3(s.p95) + ' |');
  }
  lines.push('');
  lines.push('> หมายเหตุการอ่านผล: `RegExp.test()` หยุดที่ match แรก (`scanner.service.ts:37-38`, `:50-51`)');
  lines.push('> ไฟล์ที่ "สะอาด" จึงต้องถูกไล่ทุกกฎจนจบไฟล์ และมักช้ากว่าไฟล์ที่มี secret ชัดๆ —');
  lines.push('> เวลาที่แย่ที่สุดของด่านสแกนคือตอนโค้ดไม่มีปัญหา ไม่ใช่ตอนเจอช่องโหว่');
  lines.push('');
  if (baseStats) {
    lines.push('## เทียบกับเวลา build+deploy จริง (baseline)');
    lines.push('');
    lines.push('แหล่งข้อมูล: ' + get('baseline_source') + ' — n = **' + baseStats.n + '** deploy ที่ ALLOW');
    lines.push('');
    lines.push('| เมตริก | ค่า |');
    lines.push('|---|---|');
    lines.push('| build+deploy median | ' + f3(baseStats.median) + ' s |');
    lines.push('| build+deploy min | ' + f3(baseStats.min) + ' s |');
    lines.push('| build+deploy p95 | ' + f3(baseStats.p95) + ' s |');
    lines.push('| **overhead ของด่านสแกน (กรณีกลาง)** | **' + f4(overheadMedian) + ' %** |');
    lines.push('| overhead กรณีแย่สุด (scan p95 / build+deploy เร็วสุด) | ' + get('overhead_pct_worst_case') + ' % |');
    lines.push('');
    lines.push('นิยาม: `overhead % = ต้นทุนด่านสแกน (' + f3(scanStageMs) + ' ms) ÷ เวลา build+deploy × 100`');
    lines.push('ใช้ build+deploy เป็น baseline ได้เพราะทุก stage ใน `runPipeline` รันแบบ blocking ต่อกัน');
    lines.push('ไม่มีงานคู่ขนาน (`backend/src/deploy/deploy-pipeline.service.ts:324-419`) — ถอดด่านสแกนออก');
    lines.push('เวลาก็ลดลงเท่ากับต้นทุนของมันพอดี จึงไม่ต้องปิดด่านสแกนบน production เพื่อวัด');
    lines.push('');
  } else {
    lines.push('## baseline');
    lines.push('');
    lines.push(get('baseline_source'));
    lines.push('');
  }
  lines.push('## ข้อจำกัดที่ต้องเขียนกำกับในเล่ม');
  lines.push('');
  lines.push('1. **SCA ยังเป็น stub** — `scanDependencies()` ตรวจแค่ว่ามีไฟล์ manifest ไหม');
  lines.push('   (`backend/src/scanner/dependency-audit.service.ts:21-38`) ตัวเลขนี้จึงไม่ใช่ต้นทุนของ');
  lines.push('   dependency scanning จริง ถ้าผูก Trivy/OSV เข้ามาต้นทุนจะเปลี่ยนไปทั้งอันดับ');
  lines.push('2. **ชุดข้อมูลไม่ใช่ repo จริง** — ' + get('dataset_files') + ' ไฟล์เล็กที่ออกแบบมาวัด detection');
  lines.push('   ตัวเลข "ต้นทุนรวม" จึงเป็นของ repo สังเคราะห์ขนาด ' + get('dataset_bytes') + ' bytes');
  lines.push('   ให้ใช้ค่า µs/KB + throughput ในการประมาณ repo ขนาดอื่น');
  lines.push('3. **baseline มาจาก log ของ production ที่ผ่านมา** ไม่ได้ควบคุมชนิด/ขนาดโปรเจกต์');
  lines.push('   จึงกระจายตัวสูง (min ' + (baseStats ? f3(baseStats.min) : '-') + ' s ถึง p95 ' + (baseStats ? f3(baseStats.p95) : '-') + ' s)');
  lines.push('   — รายงานเป็นช่วง ไม่ใช่ตัวเลขเดียว');
  lines.push('4. เครื่องที่วัดเป็นเครื่องเดียวกับที่รัน production (2 GB RAM) — งานอื่นบนเครื่องรบกวนได้');
  lines.push('   ดูคอลัมน์ `cv` ใน `experiment3-timing.csv` ประกอบเสมอ');
  lines.push('');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'experiment3-summary.md'), lines.join('\n') + '\n', 'utf8');
}

main();
