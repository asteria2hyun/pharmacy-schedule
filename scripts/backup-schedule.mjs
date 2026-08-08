// 근무표 백업 스크립트 (GitHub Actions에서 매일 실행)
// Supabase 공유 데이터를 읽어 두 곳에 저장한다.
//   1) backup/schedule-latest.json         : 항상 최신 1개(덮어쓰기)
//   2) backup/history/schedule-<날짜>.json  : 그날 하루치 스냅샷(날짜별로 보관)
// 비밀번호(authAccounts)는 제외한다. 읽기 전용 — 운영 데이터를 수정하지 않는다.
//
// 왜 이렇게 하나:
//   예전에는 하나의 파일에만 덮어써서, 잘못된 상태가 저장되면 직전 정상본이 사라졌다.
//   이제 매일 날짜별로 남기고 최근 30일치를 보관하므로, 문제를 나중에 알아채도
//   최대 한 달 전까지의 정상본으로 되돌릴 수 있다. (오래된 것은 자동 정리해 파일이 무한정 쌓이지 않음)
//
// 실행: node scripts/backup-schedule.mjs

import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";

const SUPABASE_URL = "https://seqefputbjlxjyvloywk.supabase.co";
const KEY = "sb_publishable_k8EqPOzPYr6itPaOgFYwCA_39-Zi182"; // 공개 읽기 키
const STATE_ID = "shared_schedule";
const KEEP_DAYS = 30; // 날짜별 스냅샷 보관 일수

// 한국 시간(KST) 기준 오늘 날짜 문자열(YYYY-MM-DD)을 만든다.
function koreaDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// history 폴더에서 오래된(보관 일수 초과) 스냅샷을 지운다.
function pruneOldHistory(historyDir) {
  let files;
  try {
    files = readdirSync(historyDir);
  } catch {
    return 0;
  }
  const snapshots = files
    .filter((name) => /^schedule-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort(); // 이름이 날짜라서 사전순 = 날짜순
  const removeCount = Math.max(0, snapshots.length - KEEP_DAYS);
  for (let i = 0; i < removeCount; i += 1) {
    try {
      unlinkSync(`${historyDir}/${snapshots[i]}`);
    } catch {
      /* 무시 */
    }
  }
  return removeCount;
}

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

  const text = JSON.stringify(backup, null, 2);

  // 1) 최신본(항상 같은 파일)
  mkdirSync("backup", { recursive: true });
  writeFileSync("backup/schedule-latest.json", text, "utf8");

  // 2) 날짜별 스냅샷(하루 1개) + 오래된 것 정리
  const historyDir = "backup/history";
  mkdirSync(historyDir, { recursive: true });
  const today = koreaDateString();
  writeFileSync(`${historyDir}/schedule-${today}.json`, text, "utf8");
  const pruned = pruneOldHistory(historyDir);

  console.log(
    "백업 완료: version=" + backup.sourceVersion +
    " 약사=" + backup.counts.schedules +
    " 직원=" + backup.counts.staffSchedules +
    " (오늘본=" + today + ", 정리=" + pruned + "개)",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
