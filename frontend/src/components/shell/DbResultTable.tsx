'use client';

import { useLang } from '@/lib/i18n';

/**
 * ตารางผลลัพธ์ของ SQL console — ใช้ร่วมกันทั้งแท็บ Tables (พรีวิวข้อมูลในตาราง) และ
 * แท็บ Query (ผลของคิวรีที่ผู้ใช้พิมพ์เอง)
 *
 * backend คืน rows เป็นอาเรย์เรียงตาม columns ไม่ใช่ object เพราะผล join มีชื่อคอลัมน์ซ้ำกันได้
 * (object จะกลืนคอลัมน์ที่ชื่อซ้ำหายไปเงียบๆ) — ตารางนี้จึงอ้างด้วย index ตลอด
 */

/** ค่าที่ยาวมาก (jsonb/text ก้อนใหญ่) ตัดก่อนวาด — ค่าเต็มยังดูได้จาก title */
const CELL_MAX = 300;

function renderCell(v: unknown): { text: string; isNull: boolean } {
  if (v === null || v === undefined) return { text: 'NULL', isNull: true };
  if (typeof v === 'object') return { text: JSON.stringify(v), isNull: false };
  return { text: String(v), isNull: false };
}

export default function DbResultTable({
  columns,
  rows,
  truncated,
  emptyLabel,
}: {
  columns: string[];
  rows: unknown[][];
  truncated?: boolean;
  emptyLabel?: string;
}) {
  const { t } = useLang();

  if (!columns.length) return null;

  return (
    <div>
      {/* ตารางผลลัพธ์กว้างได้ไม่จำกัด — ต้องเลื่อนในกรอบตัวเอง ไม่ใช่ดันทั้งหน้าให้เลื่อนแนวนอน */}
      <div className="overflow-auto rounded-[10px] border border-border-alt bg-surface">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-alt bg-page/60">
              {columns.map((c, i) => (
                <th
                  key={`${c}-${i}`}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri < rows.length - 1 ? 'border-b border-border-alt' : ''}>
                {columns.map((_, ci) => {
                  const { text, isNull } = renderCell(row[ci]);
                  return (
                    <td
                      key={ci}
                      title={text.length > CELL_MAX ? text : undefined}
                      className={`max-w-[420px] truncate px-3 py-1.5 font-mono ${
                        isNull ? 'italic text-muted-3' : 'text-ink-soft'
                      }`}
                    >
                      {text.length > CELL_MAX ? `${text.slice(0, CELL_MAX)}…` : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="px-3 py-4 text-center text-[13.5px] text-muted-3">{emptyLabel || t('dbc.noRows')}</p>
        )}
      </div>

      {truncated && (
        <p className="mt-1.5 text-[12.5px] text-muted-3">
          <i className="ph ph-scissors mr-1" />
          {t('dbc.truncatedRows')}
        </p>
      )}
    </div>
  );
}
