// 근무표 → iCalendar(.ics) 생성 스크립트 (GitHub Actions에서 1시간마다 실행)
// Supabase의 공유 데이터(app_state)를 읽어 schedule.ics(전체) 및
// 직원별 schedule-<이름>.ics 파일을 만든다. 읽기 전용 — 운영 데이터를 수정하지 않는다.
//
// 실행: node scripts/generate-ics.mjs
// 출력: 저장소 루트에 schedule.ics + ics/ 폴더(직원별)

import { writeFileSync, mkdirSync } from "node:fs";

const SUPABASE_URL = "https://seqefputbjlxjyvloywk.supabase.co";
const KEY = "sb_publishable_k8EqPOzPYr6itPaOgFYwCA_39-Zi182"; // 공개 읽기 키
const STATE_ID = "shared_schedule";

const SHIFT_LABEL = { "10pm": "10-10", "8pm": "10-8", irregular: "근무" };
function defaultRange(shiftType) {
  if (shiftType === "8pm") return [10, 20];
  if (shiftType === "irregular") return [10, 20];
  return [10, 22];
}
function toHour24(v, fallback, isEnd, startRef) {
  if (typeof v !== "number" || !isFinite(v)) return fallback;
  let h = v;
  if (isEnd && h <= startRef) h += 12;
  return h;
}
function pad(n) { return String(n).padStart(2, "0"); }
function icsEscape(s) {
  return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function kstToUtcStamp(dateStr, h) {
  const [y, mo, da] = dateStr.split("-").map(Number);
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const utc = new Date(Date.UTC(y, mo - 1, da, hh - 9, mm, 0));
  return (
    utc.getUTCFullYear() + pad(utc.getUTCMonth() + 1) + pad(utc.getUTCDate()) + "T" +
    pad(utc.getUTCHours()) + pad(utc.getUTCMinutes()) + "00Z"
  );
}

function buildIcs(db, filterName) {
  const empName = {};
  (db.employees || []).forEach((e) => { empName[e.id] = e.name; });
  const lines = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//pharmacy-schedule//KR");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push("X-WR-CALNAME:" + icsEscape(filterName ? filterName + " 근무" : "약국 근무표"));
  lines.push("X-WR-TIMEZONE:Asia/Seoul");

  function addEvent(uid, date, start, end, title) {
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + uid + "@pharmacy-schedule");
    lines.push("DTSTAMP:" + kstToUtcStamp(date, 0));
    lines.push("DTSTART:" + kstToUtcStamp(date, start));
    lines.push("DTEND:" + kstToUtcStamp(date, end));
    lines.push("SUMMARY:" + icsEscape(title));
    lines.push("END:VEVENT");
  }

  (db.schedules || []).forEach((s) => {
    if (!s.date) return;
    const nm = empName[s.pharmacistId] || "";
    if (!nm || (filterName && nm !== filterName)) return;
    const [ds, de] = defaultRange(s.shiftType);
    const start = toHour24(s.startHour, ds, false, ds);
    const end = toHour24(s.endHour, de, true, start);
    const label = SHIFT_LABEL[s.shiftType] || "근무";
    addEvent(s.id, s.date, start, end, filterName ? label : `${label} ${nm}`);
  });
  (db.staffSchedules || []).forEach((s) => {
    if (!s.date) return;
    const nm = empName[s.staffId] || "";
    if (!nm || (filterName && nm !== filterName)) return;
    const start = toHour24(s.startHour, 10, false, 10);
    const end = toHour24(s.endHour, 20.5, true, start);
    addEvent(s.id, s.date, start, end, filterName ? "직원" : `직원 ${nm}`);
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/app_state?id=eq.${encodeURIComponent(STATE_ID)}&select=data`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: "Bearer " + KEY } });
  if (!res.ok) throw new Error("Supabase fetch failed: " + res.status + " " + (await res.text()));
  const rows = await res.json();
  const db = rows?.[0]?.data;
  if (!db) throw new Error("no data");

  // 전체 근무표
  writeFileSync("schedule.ics", buildIcs(db, ""), "utf8");

  // 직원별 (재직자만, 본인 근무 구독용)
  mkdirSync("ics", { recursive: true });
  const made = [];
  (db.employees || []).forEach((e) => {
    if (!e.name || e.status === "resigned") return;
    const safe = encodeURIComponent(e.name);
    writeFileSync(`ics/${e.name}.ics`, buildIcs(db, e.name), "utf8");
    made.push(e.name);
  });

  const rxCount = (db.schedules || []).length;
  const stCount = (db.staffSchedules || []).length;
  console.log(`ICS 생성 완료: 전체(schedule.ics) rx=${rxCount} staff=${stCount}, 직원별=${made.length}명 [${made.join(", ")}]`);
}

main().catch((e) => { console.error(e); process.exit(1); });
