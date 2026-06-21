// 근무표 백업 스크립트 (GitHub Actions에서 주1회 실행)
// Supabase 공유 데이터를 읽어 backup/schedule-latest.json 하나에 '덮어쓰기' 저장한다.
// 비밀번호(authAccounts)는 제외한다. 읽기 전용 — 운영 데이터를 수정하지 않는다.
//
// 실행: node scripts/backup-schedule.mjs
// 출력: backup/schedule-latest.json (항상 같은 파일, 여러 개 안 쌓임)

import { writeFileSync, mkdirSync } from "node:fs";

const SUPABASE_URL = "https://seqefputbjlxjyvloywk.supabase.co";
const KEY = "sb_publishable_k8EqPOzPYr6itPaOgFYwCA_39-Zi182"; // 공개 읽기 키
const STATE_ID = "shared_schedule";

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/app_state?id=eq.${encodeURIComponent(STATE_ID)}&select=data,updated_at,version`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: "Bearer " + KEY } });
  if (!res.ok) throw new Error("Supabase fetch 실패: " + res.status + " " + (await res.text()));
  const rows = await res.json();
  const row = rows?.[0];
  if (!row?.data) throw new Error("데이터 없음");

  const d = row.data;
  // 비밀번호(authAccounts)는 백업에서 제외. 근무표·직원·교환·공휴일 등만 보관.
  const { authAccounts, ...safe } = d;

  const backup = {
    backedUpAt: new Date().toISOString(),
    sourceVersion: row.version ?? null,
    sourceUpdatedAt: row.updated_at ?? null,
    note: "비밀번호(authAccounts) 제외. 복원 시 비번은 관리자가 초기화.",
    counts: {
      employees: (safe.employees || []).length,
      schedules: (safe.schedules || []).length,
      staffSchedules: (safe.staffSchedules || []).length,
      swapRequests: (safe.swapRequests || []).length,
      holidays: (safe.holidays || []).length,
    },
    data: safe,
  };

  mkdirSync("backup", { recursive: true });
  writeFileSync("backup/schedule-latest.json", JSON.stringify(backup, null, 2), "utf8");
  console.log(
    "백업 완료(schedule-latest.json): version=" + backup.sourceVersion +
    " 약사=" + backup.counts.schedules +
    " 직원=" + backup.counts.staffSchedules,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
