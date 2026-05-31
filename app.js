(() => {
  const STORAGE_KEY = "pharmacy-schedule-mvp-v12";
  const SESSION_KEY = "pharmacy-schedule-session-v12";
  const LEGACY_INITIAL_PASSWORD = "1".repeat(4);
  const ADMIN_PASSWORD = "tndnjs1!2@";
  const SUPABASE_URL = "https://seqefputbjlxjyvloywk.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_k8EqPOzPYr6itPaOgFYwCA_39-Zi182";
  const SUPABASE_STATE_ID = "shared_schedule";
  const REMOTE_SYNC_INTERVAL_MS = 30000;
  const SHARED_STATE_KEYS = [
    "employees",
    "schedules",
    "staffSchedules",
    "swapRequests",
    "overseasSchedules",
    "holidays",
    "authAccounts",
    "deletedScheduleSeedIds",
    "deletedStaffScheduleSeedIds",
  ];

  const SHIFT_META = {
    "10pm": { label: "10-10", detail: "10시 마감 · 12시간", className: "ten", hours: 12 },
    "8pm": { label: "10-8", detail: "8시 마감 · 10시간", className: "eight", hours: 10 },
    irregular: { label: "비정규", detail: "시간 직접 입력", className: "irregular", hours: 0 },
  };
  const STAFF_SHIFT_META = { label: "직원(10-8:30)", hours: 10.5 };
  const SHIFT_ORDER = ["10pm", "8pm"];
  const STATUS_LABELS = {
    active: "재직중",
    resigned: "퇴사",
  };
  const ROLE_LABELS = {
    admin: "관리자",
    pharmacist: "근무약사",
    staff: "직원",
  };
  const STAFF_TYPE_LABELS = {
    staff1: "직원1",
    staff2: "직원2",
  };
  const HOLIDAY_SOURCES = {
    seed: "기본값",
    manual: "관리자 입력",
    api: "공공데이터 API",
    import: "가져오기",
  };
  const SEED_MONTH = "2026-06";
  const PHARMACIST_RATE_PRESETS = {
    "emp-minji": 32000,
    "emp-juna": 35000,
    "emp-juyeon": 27000,
    "emp-jaehee": 32000,
    "emp-yeongju": 32000,
    "emp-hyeonju": 28000,
  };
  const LOGIN_ID_OVERRIDES = {
    "emp-bae": "swstarp",
    "emp-yeongju": "youngju",
    "emp-juna": "junah",
    "emp-juyeon": "jooyeon",
  };
  const ASSIGNED_INITIAL_PASSWORDS = {
    "emp-juna": "4827",
    "emp-juyeon": "7394",
    "emp-jaehee": "2658",
    "emp-minji": "9146",
    "emp-yeongju": "6372",
    "emp-hyeonju": "5283",
    "emp-subin": "8461",
    "emp-yuri": "1937",
    "emp-hyojin": "7526",
    "emp-sohyun": "3849",
    "emp-old": "6195",
  };
  const EMPLOYEE_HIRE_DATES = {
    "emp-juna": "2026-03-01",
    "emp-juyeon": "2024-08-10",
    "emp-jaehee": "2024-05-14",
    "emp-minji": "2024-08-20",
    "emp-yeongju": "2024-12-05",
    "emp-hyeonju": "2026-03-01",
    "emp-subin": "2024-11-01",
    "emp-hyojin": "2025-11-14",
    "emp-sohyun": "2025-12-04",
  };
  const SUBIN_LEAVE_SETUP = {
    leaveCycleStartDate: "2025-11-01",
    leaveDates: ["2025-11-07", "2026-03-09", "2026-03-30", "2026-05-25"],
  };
  const VIEWER_LOGIN = {
    loginId: "1111",
    password: "1111",
  };
  const OBSERVER_USER = {
    id: "__observer__",
    name: "옵저버",
    loginId: VIEWER_LOGIN.loginId,
    password: VIEWER_LOGIN.password,
    role: "observer",
    status: "active",
    mustChangePassword: false,
    viewOnly: true,
  };
  // 옵저버 전용 가짜 급여 통계. 실제 직원 급여를 노출하지 않으려고 그럴듯한 고정 샘플값을 쓴다.
  const OBSERVER_SALARY_STATS = {
    totalCount: 12,
    tenCount: 8,
    eightCount: 4,
    staffCount: 0,
    totalHours: 136,
    weekdayHours: 96,
    weekendHours: 40,
    weekdayPay: 3072000,
    weekendPay: 1480000,
    fixedPay: 0,
    totalPay: 4552000,
  };

  const app = document.querySelector("#app");
  let salaryStatsCache = new Map();
  let monthlyPayCache = new Map();
  let assignmentsCache = new Map();
  let lastStoredSnapshot = "";
  let remoteSyncReady = false;
  let remoteSyncInFlight = false;
  let remoteSyncTimer = null;
  let remotePollTimer = null;
  let remoteSyncStatus = "연결중";
  let remoteSyncErrorShown = false;
  let lastRemoteUpdatedAt = "";
  let lastRemotePayloadSnapshot = "";
  let pendingRemotePayloadSnapshot = "";
  let pendingAuthPublish = false;
  let db = loadDb();
  let session = loadSession();
  let currentTab = "calendar";
  let monthCursor = getInitialMonthCursor();
  let adminSelectedDate = `${monthCursor}-01`;
  let selectedEmployeeId = "";
  let selectedSwapTargetEmployeeId = "";
  let toast = "";
  let toastTimer = null;
  let issuedPasswordNotice = "";
  let shouldFocusTodayAfterRender = true;

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  window.addEventListener("storage", handleStorageSync);
  window.addEventListener("focus", () => {
    syncDbFromStorage();
    refreshRemoteScheduleState();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncDbFromStorage();
      refreshRemoteScheduleState();
    }
  });

  render();
  initRemoteScheduleSync();

  function loadDb() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const initial = normalizeDb(createInitialData());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      return normalizeDb(JSON.parse(stored));
    } catch {
      const initial = normalizeDb(createInitialData());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
  }

  function normalizeDb(value, shouldPersist = true) {
    const base = value && typeof value === "object" ? value : createInitialData();
    const previousSchemaVersion = Number(base.schemaVersion || 0);
    base.schemaVersion = 20;
    base.meta = {
      storageScope: "browser",
      ...(base.meta || {}),
    };
    base.settings = {
      ...(base.settings || {}),
      defaultMonth: getKoreaMonthKey(),
    };
    base.employees = Array.isArray(base.employees) ? base.employees : [];
    base.schedules = Array.isArray(base.schedules) ? base.schedules : [];
    base.staffSchedules = Array.isArray(base.staffSchedules) ? base.staffSchedules : [];
    base.swapRequests = Array.isArray(base.swapRequests) ? base.swapRequests : [];
    base.overseasSchedules = normalizeOverseasSchedules(base.overseasSchedules);
    base.holidays = Array.isArray(base.holidays) ? base.holidays : [];
    base.authAccounts = normalizeAuthAccounts(base.authAccounts);
    base.auditLogs = Array.isArray(base.auditLogs) ? base.auditLogs : [];
    base.deletedScheduleSeedIds = uniqueStrings(base.deletedScheduleSeedIds);
    base.deletedStaffScheduleSeedIds = uniqueStrings(base.deletedStaffScheduleSeedIds);
    base.employees = base.employees.map((employee) => {
      const normalized = {
        weekdayHourlyRate: Number(employee.weekdayHourlyRate || employee.shiftRate8pm / 10 || 10000),
        weekendHourlyRate: Number(employee.weekendHourlyRate || employee.shiftRate10pm / 12 || 12000),
        salaryType: employee.salaryType || "hourly",
        monthlySalary: Number(employee.monthlySalary || 0),
        leaveAllowance: Number(employee.leaveAllowance || 0),
        leaveDates: Array.isArray(employee.leaveDates) ? employee.leaveDates : [],
        leaveCycleStartDate: employee.leaveCycleStartDate || "",
        hireDate: employee.hireDate || "",
        firstWorkStartDate: employee.firstWorkStartDate || "",
        lastModifiedStartDate: employee.lastModifiedStartDate || "",
        workStartDate: employee.workStartDate || "",
        workWeekdays: Array.isArray(employee.workWeekdays) ? employee.workWeekdays.map(Number) : [],
        workStartHour: Number.isFinite(Number(employee.workStartHour)) ? Number(employee.workStartHour) : 10,
        workEndHour: Number.isFinite(Number(employee.workEndHour)) ? Number(employee.workEndHour) : 8.5,
        resignationDate: employee.resignationDate || "",
        salaryEffectiveDate: employee.salaryEffectiveDate || "",
        salaryChanges: Array.isArray(employee.salaryChanges) ? employee.salaryChanges : [],
        status: "active",
        ...employee,
      };
      if (LOGIN_ID_OVERRIDES[normalized.id]) {
        normalized.loginId = LOGIN_ID_OVERRIDES[normalized.id];
      }
      if (previousSchemaVersion < 15 && ASSIGNED_INITIAL_PASSWORDS[normalized.id] && !normalized.password) {
        normalized.password = ASSIGNED_INITIAL_PASSWORDS[normalized.id];
      }
      if (previousSchemaVersion < 16 && normalized.id === "emp-bae") {
        if (!normalized.password || normalized.password === LEGACY_INITIAL_PASSWORD) normalized.password = ADMIN_PASSWORD;
        normalized.mustChangePassword = false;
      }
      if (previousSchemaVersion < 17) {
        applyEmployeeSeedDetails(normalized);
      }
      applyEmployeeAuthAccount(normalized, base.authAccounts[normalized.id]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.salaryEffectiveDate || "") || normalized.salaryEffectiveDate === "0000-00-00") {
        normalized.salaryEffectiveDate = "";
      }
      normalized.staffType = normalized.role === "staff" ? normalized.staffType || getDefaultStaffType(normalized) : "";
      normalized.workPatterns = normalizeWorkPatterns(normalized);
      normalized.salaryChanges = normalizeSalaryChanges(normalized);
      if (!normalized.workStartDate && !normalized.workPatterns.length) {
        const preset = getDefaultEmployeeWorkPatternPreset(normalized.id);
        if (preset) {
          normalized.workStartDate = preset.startDate;
          normalized.workPatterns = preset.patterns;
          normalized.workWeekdays = preset.patterns.map((pattern) => pattern.weekday);
          normalized.workStartHour = preset.patterns[0]?.startHour ?? 10;
          normalized.workEndHour = preset.patterns[0]?.endHour ?? (normalized.role === "staff" ? 8.5 : 8);
        }
      }
      const actualFirstWorkDate = findFirstEmployeeWorkDate(normalized.id, base);
      normalized.firstWorkStartDate = minDate(normalized.firstWorkStartDate, actualFirstWorkDate) || normalized.workStartDate || "";
      normalized.hireDate = normalized.hireDate || normalized.firstWorkStartDate || normalized.workStartDate || "";
      normalized.lastModifiedStartDate =
        normalized.lastModifiedStartDate || normalized.workStartDate || normalized.salaryEffectiveDate || normalized.firstWorkStartDate || "";
      normalized.mustChangePassword =
        typeof normalized.mustChangePassword === "boolean"
          ? normalized.mustChangePassword
          : normalized.password === LEGACY_INITIAL_PASSWORD && normalized.status === "active";
      if (normalized.id === "emp-bae") {
        normalized.mustChangePassword = false;
      }
      if (
        ASSIGNED_INITIAL_PASSWORDS[normalized.id] &&
        normalized.password &&
        normalized.password !== ASSIGNED_INITIAL_PASSWORDS[normalized.id]
      ) {
        normalized.mustChangePassword = false;
      }
      return normalized;
    });
    applyScheduledResignations(base, false);
    if (previousSchemaVersion < 9) {
      base.employees = base.employees.map(applyCurrentPharmacistRatePreset);
    }
    if (previousSchemaVersion < 10) {
      base.employees = base.employees.map(applyCurrentAdminRatePreset);
    }
    base.holidays = base.holidays.map((holiday) => ({
      id: holiday.id || makeId("holiday"),
      source: holiday.source || "manual",
      updatedAt: holiday.updatedAt || nowIso(),
      ...holiday,
    }));
    ensureMonthData("2026-05", base, false, { preserveExisting: true });
    ensureMonthData("2026-07", base, false, { preserveExisting: true });
    removeSchedulesAfterResignations(base);
    base.employees = base.employees.map((employee) => {
      employee.firstWorkStartDate = minDate(employee.firstWorkStartDate, findFirstEmployeeWorkDate(employee.id, base), employee.workStartDate);
      employee.hireDate = employee.hireDate || employee.firstWorkStartDate || employee.workStartDate || "";
      employee.lastModifiedStartDate =
        employee.lastModifiedStartDate || employee.workStartDate || employee.salaryEffectiveDate || employee.firstWorkStartDate || "";
      return employee;
    });
    if (shouldPersist) saveDb(base);
    return base;
  }

  function saveDb(nextDb = db, options = {}) {
    clearComputedCaches();
    nextDb.meta = {
      storageScope: "browser",
      ...(nextDb.meta || {}),
      lastSavedAt: nowIso(),
    };
    lastStoredSnapshot = JSON.stringify(nextDb);
    localStorage.setItem(STORAGE_KEY, lastStoredSnapshot);
    if (!options.skipRemote && remoteSyncReady) {
      const sharedSnapshot = getSharedStateSnapshot(nextDb);
      if (sharedSnapshot !== lastRemotePayloadSnapshot) {
        scheduleRemoteScheduleSave(sharedSnapshot);
      }
    }
  }

  function clearComputedCaches() {
    salaryStatsCache = new Map();
    monthlyPayCache = new Map();
    assignmentsCache = new Map();
  }

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)));
  }

  function normalizeAuthAccounts(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([employeeId, auth]) => employeeId && auth && typeof auth === "object" && typeof auth.password === "string")
        .map(([employeeId, auth]) => [
          employeeId,
          {
            password: String(auth.password || ""),
            mustChangePassword: Boolean(auth.mustChangePassword),
            updatedAt: auth.updatedAt || "",
          },
        ]),
    );
  }

  function normalizeOverseasSchedules(value = []) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const startDate = /^\d{4}-\d{2}-\d{2}$/.test(item.startDate || "") ? item.startDate : "";
        const endDate = /^\d{4}-\d{2}-\d{2}$/.test(item.endDate || "") ? item.endDate : startDate;
        return {
          id: item.id || makeId("overseas"),
          employeeId: item.employeeId || "",
          startDate,
          endDate: endDate && startDate && endDate < startDate ? startDate : endDate,
          memo: String(item.memo || "").trim(),
          createdAt: item.createdAt || nowIso(),
          updatedAt: item.updatedAt || item.createdAt || nowIso(),
        };
      })
      .filter((item) => item.employeeId && item.startDate && item.endDate);
  }

  function getAuthAccountsSnapshot(authAccounts = {}) {
    const normalized = normalizeAuthAccounts(authAccounts);
    return JSON.stringify(Object.keys(normalized).sort().map((employeeId) => [employeeId, normalized[employeeId]]));
  }

  function mergeAuthAccounts(localAuth = {}, remoteAuth = {}) {
    const merged = normalizeAuthAccounts(localAuth);
    Object.entries(normalizeAuthAccounts(remoteAuth)).forEach(([employeeId, auth]) => {
      const current = merged[employeeId];
      if (!current || !current.updatedAt || !auth.updatedAt || auth.updatedAt >= current.updatedAt) {
        merged[employeeId] = auth;
      }
    });
    return merged;
  }

  function applyEmployeeAuthAccount(employee, auth) {
    if (!employee || !auth?.password) return employee;
    const localUpdatedAt = employee.passwordUpdatedAt || "";
    const remoteUpdatedAt = auth.updatedAt || "";
    if (!employee.password || !localUpdatedAt || !remoteUpdatedAt || remoteUpdatedAt >= localUpdatedAt) {
      employee.password = auth.password;
      employee.mustChangePassword = Boolean(auth.mustChangePassword);
      employee.passwordUpdatedAt = remoteUpdatedAt || localUpdatedAt || nowIso();
    }
    return employee;
  }

  function setEmployeeAuth(employee, password, mustChangePassword) {
    if (!employee?.id || !password) return;
    const updatedAt = nowIso();
    employee.password = password;
    employee.mustChangePassword = Boolean(mustChangePassword);
    employee.passwordUpdatedAt = updatedAt;
    db.authAccounts = normalizeAuthAccounts(db.authAccounts);
    db.authAccounts[employee.id] = {
      password,
      mustChangePassword: Boolean(mustChangePassword),
      updatedAt,
    };
    pendingAuthPublish = true;
  }

  function syncAuthAccountFromEmployee(employee) {
    if (!employee?.id || !employee.password) return false;
    db.authAccounts = normalizeAuthAccounts(db.authAccounts);
    const existing = db.authAccounts[employee.id];
    if (
      existing &&
      existing.password === employee.password &&
      existing.mustChangePassword === Boolean(employee.mustChangePassword)
    ) {
      return false;
    }
    const updatedAt = employee.passwordUpdatedAt || nowIso();
    employee.passwordUpdatedAt = updatedAt;
    db.authAccounts[employee.id] = {
      password: employee.password,
      mustChangePassword: Boolean(employee.mustChangePassword),
      updatedAt,
    };
    pendingAuthPublish = true;
    return true;
  }

  function loadSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
    } catch {
      return null;
    }
  }

  function getInitialMonthCursor() {
    return getKoreaMonthKey();
  }

  function saveSession(nextSession) {
    session = nextSession;
    if (nextSession) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  function handleStorageSync(event) {
    if (event.key && event.key !== STORAGE_KEY) return;
    syncDbFromStorage();
  }

  function syncDbFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      if (stored === lastStoredSnapshot) return;
      db = normalizeDb(JSON.parse(stored), false);
      lastStoredSnapshot = stored;
      clearComputedCaches();
      render();
    } catch {
      // Keep the current in-memory data if another tab is mid-write.
    }
  }

  async function initRemoteScheduleSync() {
    if (!isRemoteSyncConfigured()) {
      remoteSyncStatus = "로컬저장";
      render();
      return;
    }
    remoteSyncStatus = "공유연결중";
    render();
    try {
      const row = await fetchRemoteScheduleRow();
      if (row && hasRemoteSharedState(row.data)) {
        applyRemoteSharedState(row.data);
        lastRemoteUpdatedAt = row.updated_at || "";
        lastRemotePayloadSnapshot = getSharedDataSnapshot(row.data);
        saveDb(db, { skipRemote: true });
        lastRemotePayloadSnapshot = getSharedStateSnapshot(db);
      } else {
        lastRemotePayloadSnapshot = getSharedStateSnapshot(db);
        await pushRemoteScheduleState(true);
      }
      remoteSyncReady = true;
      if (pendingAuthPublish) {
        scheduleRemoteScheduleSave(getSharedStateSnapshot(db));
      }
      remoteSyncStatus = "공유중";
      startRemoteSchedulePolling();
      render();
    } catch (error) {
      remoteSyncReady = false;
      remoteSyncStatus = "공유확인";
      console.warn("Supabase schedule sync failed", error);
      render();
      if (!remoteSyncErrorShown) {
        remoteSyncErrorShown = true;
        showToast("Supabase 공유 연결을 확인해주세요.");
      }
    }
  }

  function isRemoteSyncConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && window.fetch);
  }

  function getSupabaseHeaders(extra = {}) {
    return {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      ...extra,
    };
  }

  async function fetchRemoteScheduleRow() {
    const url = `${SUPABASE_URL}/rest/v1/app_state?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}&select=id,data,updated_at`;
    const response = await fetch(url, {
      headers: getSupabaseHeaders({ Accept: "application/json" }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function upsertRemoteScheduleRow(payload) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_state?on_conflict=id`, {
      method: "POST",
      headers: getSupabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify({
        id: SUPABASE_STATE_ID,
        data: payload,
        updated_at: nowIso(),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  function scheduleRemoteScheduleSave(snapshot = getSharedStateSnapshot(db)) {
    if (!remoteSyncReady) return;
    pendingRemotePayloadSnapshot = snapshot;
    clearTimeout(remoteSyncTimer);
    remoteSyncTimer = setTimeout(() => {
      remoteSyncTimer = null;
      pushRemoteScheduleState(false);
    }, 700);
  }

  async function pushRemoteScheduleState(force = false) {
    if (!force && (!remoteSyncReady || remoteSyncInFlight)) return;
    if (!isRemoteSyncConfigured()) return;
    const snapshot = pendingRemotePayloadSnapshot || getSharedStateSnapshot(db);
    remoteSyncInFlight = true;
    remoteSyncStatus = "저장중";
    try {
      const payload = extractSharedState(db);
      const row = await upsertRemoteScheduleRow(payload);
      lastRemoteUpdatedAt = row?.updated_at || payload.savedAt || nowIso();
      lastRemotePayloadSnapshot = snapshot;
      pendingRemotePayloadSnapshot = "";
      pendingAuthPublish = false;
      remoteSyncReady = true;
      remoteSyncStatus = "공유중";
      remoteSyncErrorShown = false;
      render();
    } catch (error) {
      remoteSyncStatus = "공유확인";
      console.warn("Supabase schedule save failed", error);
      if (!remoteSyncErrorShown) {
        remoteSyncErrorShown = true;
        showToast("근무표 공유 저장을 확인해주세요.");
      } else {
        render();
      }
    } finally {
      remoteSyncInFlight = false;
    }
  }

  function startRemoteSchedulePolling() {
    clearInterval(remotePollTimer);
    remotePollTimer = setInterval(() => {
      if (!document.hidden) refreshRemoteScheduleState();
    }, REMOTE_SYNC_INTERVAL_MS);
  }

  async function refreshRemoteScheduleState() {
    if (!remoteSyncReady || remoteSyncInFlight || remoteSyncTimer || pendingRemotePayloadSnapshot) return;
    try {
      const row = await fetchRemoteScheduleRow();
      if (!row || !hasRemoteSharedState(row.data)) return;
      const snapshot = getSharedDataSnapshot(row.data);
      if (snapshot === lastRemotePayloadSnapshot && row.updated_at === lastRemoteUpdatedAt) return;
      applyRemoteSharedState(row.data);
      lastRemoteUpdatedAt = row.updated_at || "";
      lastRemotePayloadSnapshot = snapshot;
      saveDb(db, { skipRemote: true });
      remoteSyncStatus = "공유중";
      remoteSyncErrorShown = false;
      render();
    } catch (error) {
      remoteSyncStatus = "공유확인";
      console.warn("Supabase schedule refresh failed", error);
      render();
    }
  }

  function extractSharedState(source = db) {
    return {
      sharedVersion: 1,
      savedAt: nowIso(),
      ...cloneSharedStateCore(source),
    };
  }

  function getSharedStateSnapshot(source = db) {
    return getSharedDataSnapshot(source);
  }

  function getSharedDataSnapshot(data) {
    return JSON.stringify(cloneSharedStateCore(data));
  }

  function cloneSharedStateCore(source = {}) {
    return JSON.parse(
      JSON.stringify({
        employees: Array.isArray(source.employees) ? source.employees.map(cloneEmployeeForSharedState) : [],
        schedules: Array.isArray(source.schedules) ? source.schedules : [],
        staffSchedules: Array.isArray(source.staffSchedules) ? source.staffSchedules : [],
        swapRequests: Array.isArray(source.swapRequests) ? source.swapRequests : [],
        overseasSchedules: normalizeOverseasSchedules(source.overseasSchedules),
        holidays: Array.isArray(source.holidays) ? source.holidays : [],
        authAccounts: normalizeAuthAccounts(source.authAccounts),
        deletedScheduleSeedIds: uniqueStrings(source.deletedScheduleSeedIds),
        deletedStaffScheduleSeedIds: uniqueStrings(source.deletedStaffScheduleSeedIds),
      }),
    );
  }

  function cloneEmployeeForSharedState(employee = {}) {
    const { password, mustChangePassword, passwordUpdatedAt, ...sharedEmployee } = employee || {};
    return sharedEmployee;
  }

  function mergeRemoteEmployees(remoteEmployees = []) {
    const localEmployeesById = new Map((db.employees || []).map((employee) => [employee.id, employee]));
    return remoteEmployees.map((remoteEmployee) => {
      const localEmployee = localEmployeesById.get(remoteEmployee.id);
      const auth = db.authAccounts?.[remoteEmployee.id];
      const fallbackPassword =
        remoteEmployee.id === "emp-bae"
          ? ADMIN_PASSWORD
          : ASSIGNED_INITIAL_PASSWORDS[remoteEmployee.id] || LEGACY_INITIAL_PASSWORD;
      const password = localEmployee?.password || fallbackPassword;
      const passwordUpdatedAt = localEmployee?.passwordUpdatedAt || "";
      let mustChangePassword =
        typeof localEmployee?.mustChangePassword === "boolean"
          ? localEmployee.mustChangePassword
          : remoteEmployee.id === "emp-bae"
            ? false
            : true;
      const mergedEmployee = {
        ...(localEmployee || {}),
        ...remoteEmployee,
        password,
        mustChangePassword,
        passwordUpdatedAt,
      };
      applyEmployeeAuthAccount(mergedEmployee, auth);
      if (remoteEmployee.id === "emp-bae") {
        mergedEmployee.mustChangePassword = false;
      }
      if (ASSIGNED_INITIAL_PASSWORDS[remoteEmployee.id] && mergedEmployee.password !== ASSIGNED_INITIAL_PASSWORDS[remoteEmployee.id]) {
        mergedEmployee.mustChangePassword = false;
      }
      return mergedEmployee;
    });
  }

  function hasRemoteSharedState(data) {
    return Boolean(
      data &&
        SHARED_STATE_KEYS.some((key) =>
          key === "authAccounts" ? data[key] && typeof data[key] === "object" && !Array.isArray(data[key]) : Array.isArray(data[key]),
        ),
    );
  }

  function applyRemoteSharedState(shared) {
    const nextShared = cloneSharedStateCore(shared);
    const remoteAuthAccounts = normalizeAuthAccounts(nextShared.authAccounts);
    const mergedAuthAccounts = mergeAuthAccounts(db.authAccounts, remoteAuthAccounts);
    if (getAuthAccountsSnapshot(mergedAuthAccounts) !== getAuthAccountsSnapshot(remoteAuthAccounts)) {
      pendingAuthPublish = true;
    }
    db.authAccounts = mergedAuthAccounts;
    if (Array.isArray(shared.employees)) {
      db.employees = mergeRemoteEmployees(nextShared.employees);
    }
    ["schedules", "staffSchedules", "swapRequests", "overseasSchedules", "holidays", "deletedScheduleSeedIds", "deletedStaffScheduleSeedIds"].forEach((key) => {
      if (Array.isArray(shared[key])) db[key] = nextShared[key];
    });
    db = normalizeDb(db, false);
    clearComputedCaches();
    removeSchedulesAfterResignations(db);
    ensureMonthData(monthCursor, db, false, { preserveExisting: true });
  }

  function createInitialData() {
    const monthKey = SEED_MONTH;
    const year = Number(monthKey.slice(0, 4));
    const employees = [
      {
        id: "emp-bae",
        name: "배주성",
        loginId: "swstarp",
        password: ADMIN_PASSWORD,
        role: "admin",
        status: "active",
        mustChangePassword: false,
        salaryType: "hourly",
        weekdayHourlyRate: 25000,
        weekendHourlyRate: 25000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-juna",
        name: "최준아",
        loginId: "junah",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-juna"],
        role: "pharmacist",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 35000,
        weekendHourlyRate: 40000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-juyeon",
        name: "황주연",
        loginId: "jooyeon",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-juyeon"],
        role: "pharmacist",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 27000,
        weekendHourlyRate: 32000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-jaehee",
        name: "박재희",
        loginId: "jaehee",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-jaehee"],
        role: "pharmacist",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 32000,
        weekendHourlyRate: 37000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-minji",
        name: "송민지",
        loginId: "minji",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-minji"],
        role: "pharmacist",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 32000,
        weekendHourlyRate: 37000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-yeongju",
        name: "원영주",
        loginId: "youngju",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-yeongju"],
        role: "pharmacist",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 32000,
        weekendHourlyRate: 37000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-hyeonju",
        name: "이현주",
        loginId: "hyeonju",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-hyeonju"],
        role: "pharmacist",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 28000,
        weekendHourlyRate: 33000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-subin",
        name: "김수빈",
        loginId: "subin",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-subin"],
        role: "staff",
        staffType: "staff1",
        status: "active",
        mustChangePassword: true,
        salaryType: "fixed",
        weekdayHourlyRate: 0,
        weekendHourlyRate: 0,
        monthlySalary: 2700000,
        leaveAllowance: 15,
        leaveDates: [],
      },
      {
        id: "emp-yuri",
        name: "유리구슬",
        loginId: "yuri",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-yuri"],
        role: "staff",
        staffType: "staff2",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 15000,
        weekendHourlyRate: 15000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-hyojin",
        name: "윤효진",
        loginId: "hyojin",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-hyojin"],
        role: "staff",
        staffType: "staff2",
        status: "active",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 12000,
        weekendHourlyRate: 12000,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-sohyun",
        name: "박소현",
        loginId: "sohyun",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-sohyun"],
        role: "staff",
        staffType: "staff2",
        status: "active",
        mustChangePassword: true,
        salaryType: "fixed",
        weekdayHourlyRate: 0,
        weekendHourlyRate: 0,
        monthlySalary: 1400000,
        leaveAllowance: 0,
        leaveDates: [],
      },
      {
        id: "emp-old",
        name: "퇴사자",
        loginId: "old",
        password: ASSIGNED_INITIAL_PASSWORDS["emp-old"],
        role: "pharmacist",
        status: "resigned",
        mustChangePassword: true,
        salaryType: "hourly",
        weekdayHourlyRate: 8700,
        weekendHourlyRate: 9800,
        monthlySalary: 0,
        leaveAllowance: 0,
        leaveDates: [],
      },
    ];
    employees.forEach(applyEmployeeSeedDetails);
    const holidays = createHolidaySeed(year);
    const schedules = createMay2026Schedules().concat(createJune2026Schedules(), createJuly2026Schedules());
    const staffSchedules = createMay2026StaffSchedules().concat(createJune2026StaffSchedules(), createJuly2026StaffSchedules());
    return {
      schemaVersion: 20,
      settings: {
        defaultMonth: monthKey,
      },
      employees,
      schedules,
      staffSchedules,
      swapRequests: [],
      overseasSchedules: [],
      holidays,
      auditLogs: [
        {
          id: makeId("log"),
          actorId: "system",
          message: "2026년 5월, 6월, 7월 사진 기준 근무표 데이터가 생성되었습니다.",
          createdAt: nowIso(),
        },
      ],
      deletedScheduleSeedIds: [],
      deletedStaffScheduleSeedIds: [],
    };
  }

  function applyEmployeeSeedDetails(employee) {
    const hireDate = EMPLOYEE_HIRE_DATES[employee.id];
    if (hireDate) {
      employee.hireDate = hireDate;
      employee.firstWorkStartDate = minDate(employee.firstWorkStartDate, hireDate) || hireDate;
    }
    if (employee.id === "emp-subin") {
      employee.leaveAllowance = 15;
      employee.leaveCycleStartDate = SUBIN_LEAVE_SETUP.leaveCycleStartDate;
      employee.leaveDates = mergeDateLists(employee.leaveDates, SUBIN_LEAVE_SETUP.leaveDates);
    }
    return employee;
  }

  function mergeDateLists(...lists) {
    return Array.from(
      new Set(
        lists
          .flatMap((list) => (Array.isArray(list) ? list : []))
          .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date || ""))
      )
    ).sort();
  }

  function createHolidaySeed(year) {
    const fixed = [
      ["01-01", "신정"],
      ["03-01", "삼일절"],
      ["05-05", "어린이날"],
      ["06-06", "현충일"],
      ["08-15", "광복절"],
      ["10-03", "개천절"],
      ["10-09", "한글날"],
      ["12-25", "성탄절"],
    ];
    const holidays = fixed.map(([day, name]) => holidaySeed(`${year}-${day}`, name));
    const yearSpecific = {
      2026: [
        ["2026-02-16", "설날 연휴"],
        ["2026-02-17", "설날"],
        ["2026-02-18", "설날 연휴"],
        ["2026-03-02", "삼일절 대체공휴일"],
        ["2026-05-01", "노동절"],
        ["2026-05-24", "부처님오신날"],
        ["2026-05-25", "부처님오신날 대체공휴일"],
        ["2026-06-03", "전국동시지방선거일"],
        ["2026-07-17", "제헌절"],
        ["2026-08-17", "광복절 대체공휴일"],
        ["2026-09-24", "추석 연휴"],
        ["2026-09-25", "추석"],
        ["2026-09-26", "추석 연휴"],
        ["2026-10-05", "개천절 대체공휴일"],
      ],
    };
    return holidays
      .concat((yearSpecific[year] || []).map(([date, name]) => holidaySeed(date, name)))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function holidaySeed(date, name) {
    return {
      id: `holiday-${date}`,
      date,
      name,
      source: "seed",
      externalId: "",
      updatedAt: nowIso(),
    };
  }

  function createMay2026Schedules() {
    const e = {
      bae: "emp-bae",
      juna: "emp-juna",
      juyeon: "emp-juyeon",
      jaehee: "emp-jaehee",
      minji: "emp-minji",
      yeongju: "emp-yeongju",
      hyeonju: "emp-hyeonju",
    };
    const rows = [
      ["2026-05-01", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-05-02", [["10pm", e.juna], ["10pm", e.juyeon], ["8pm", e.jaehee]]],
      ["2026-05-03", [["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-05-04", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-05-05", [["8pm", e.bae], ["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.minji]]],
      ["2026-05-06", [["8pm", e.bae], ["8pm", e.juyeon], ["10pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-05-07", [["8pm", e.bae, 11, 6], ["10pm", e.juna], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-05-08", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-05-09", [["10pm", e.juna], ["10pm", e.juyeon], ["8pm", e.jaehee]]],
      ["2026-05-10", [["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-05-11", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-05-12", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.minji]]],
      ["2026-05-13", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-05-14", [["10pm", e.juyeon], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-05-15", [["8pm", e.bae, 11, 8], ["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-05-16", [["8pm", e.bae], ["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-05-17", [["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-05-18", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-05-19", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-05-20", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-05-21", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-05-22", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-05-23", [["10pm", e.juna], ["10pm", e.juyeon], ["8pm", e.jaehee]]],
      ["2026-05-24", [["8pm", e.bae], ["10pm", e.juna], ["10pm", e.minji], ["8pm", e.hyeonju]]],
      ["2026-05-25", [["8pm", e.bae], ["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.minji], ["8pm", e.hyeonju]]],
      ["2026-05-26", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-05-27", [["8pm", e.juna], ["10pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-05-28", [["8pm", e.bae], ["10pm", e.juna], ["10pm", e.minji]]],
      ["2026-05-29", [["10pm", e.juna], ["10pm", e.jaehee], ["8pm", e.hyeonju]]],
      ["2026-05-30", [["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-05-31", [["10pm", e.bae], ["8pm", e.juna], ["10pm", e.minji]]],
    ];
    return createScheduleRecords(rows);
  }

  function createMay2026StaffSchedules() {
    const staff = {
      subin: "emp-subin",
      yuri: "emp-yuri",
      hyojin: "emp-hyojin",
      sohyun: "emp-sohyun",
    };
    const rows = createWeekdaySubinStaffRows("2026-05").concat([
      { date: "2026-05-01", staffIds: [staff.sohyun] },
      { date: "2026-05-02", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-05-03", staffIds: [staff.yuri, staff.hyojin] },
      { date: "2026-05-07", staffIds: [staff.sohyun] },
      { date: "2026-05-08", staffIds: [staff.sohyun] },
      { date: "2026-05-09", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-05-10", staffIds: [staff.yuri, staff.hyojin] },
      { date: "2026-05-16", staffIds: [staff.hyojin] },
      { date: "2026-05-17", staffIds: [staff.yuri, staff.hyojin] },
      { date: "2026-05-21", staffIds: [staff.sohyun] },
      { date: "2026-05-22", staffIds: [staff.sohyun] },
      { date: "2026-05-23", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-05-24", staffIds: [staff.hyojin] },
      { date: "2026-05-28", staffIds: [staff.sohyun] },
      { date: "2026-05-29", staffIds: [staff.sohyun] },
      { date: "2026-05-30", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-05-31", staffIds: [staff.yuri, staff.hyojin] },
    ]);
    return createStaffScheduleRecords(mergeStaffRows(rows));
  }

  function createJune2026Schedules() {
    const e = {
      bae: "emp-bae",
      juna: "emp-juna",
      juyeon: "emp-juyeon",
      jaehee: "emp-jaehee",
      minji: "emp-minji",
      yeongju: "emp-yeongju",
      hyeonju: "emp-hyeonju",
    };
    const rows = [
      ["2026-06-01", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.hyeonju]]],
      ["2026-06-02", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.minji]]],
      ["2026-06-03", [["8pm", e.bae], ["8pm", e.juyeon], ["10pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-06-04", [["10pm", e.juna], ["8pm", e.minji], ["10pm", e.hyeonju]]],
      ["2026-06-05", [["10pm", e.juna], ["10pm", e.jaehee], ["8pm", e.yeongju]]],
      ["2026-06-06", [["10pm", e.bae], ["10pm", e.juna], ["8pm", e.jaehee]]],
      ["2026-06-07", [["8pm", e.bae], ["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-06-08", [["10pm", e.bae], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-06-09", [["10pm", e.juna], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-06-10", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-06-11", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-06-12", [["10pm", e.juna], ["10pm", e.jaehee], ["8pm", e.yeongju]]],
      ["2026-06-13", [["10pm", e.bae], ["10pm", e.juna], ["8pm", e.jaehee]]],
      ["2026-06-14", [["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-06-15", [["10pm", e.bae], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-06-16", [["10pm", e.juna], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-06-17", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-06-18", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-06-19", [["10pm", e.juna], ["10pm", e.jaehee], ["8pm", e.hyeonju]]],
      ["2026-06-20", [["10pm", e.juna], ["8pm", e.jaehee]]],
      ["2026-06-21", [["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-06-22", [["10pm", e.bae], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-06-23", [["10pm", e.juna], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-06-24", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-06-25", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-06-26", [["10pm", e.juna], ["10pm", e.jaehee], ["8pm", e.hyeonju]]],
      ["2026-06-27", [["10pm", e.bae], ["8pm", e.jaehee], ["10pm", e.yeongju]]],
      ["2026-06-28", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.hyeonju]]],
      ["2026-06-29", [["10pm", e.bae], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-06-30", [["10pm", e.bae], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
    ];
    return rows.flatMap(([date, shifts]) =>
      shifts.map(([shiftType, pharmacistId], index) => ({
        id: `sch-${date}-${shiftType}-${index}`,
        date,
        shiftType,
        pharmacistId,
      })),
    );
  }

  function createJune2026StaffSchedules() {
    const staff = {
      subin: "emp-subin",
      yuri: "emp-yuri",
      hyojin: "emp-hyojin",
      sohyun: "emp-sohyun",
    };
    const weekendPairs = [
      [6, [staff.hyojin, staff.sohyun]],
      [7, [staff.hyojin, staff.sohyun]],
      [13, [staff.hyojin, staff.sohyun]],
      [14, [staff.yuri, staff.hyojin]],
      [20, [staff.hyojin, staff.sohyun]],
      [21, [staff.yuri, staff.hyojin]],
      [27, [staff.hyojin, staff.sohyun]],
      [28, [staff.yuri, staff.hyojin]],
    ];
    const rows = [];
    for (let day = 1; day <= 30; day += 1) {
      const date = `2026-06-${pad(day)}`;
      const weekday = getWeekday(2026, 6, day);
      if (weekday >= 1 && weekday <= 5) {
        rows.push({ date, staffIds: [staff.subin] });
      }
    }
    weekendPairs.forEach(([day, staffIds]) => {
      rows.push({ date: `2026-06-${pad(day)}`, staffIds });
    });
    return rows.flatMap((row) =>
      row.staffIds.map((staffId, index) => ({
        id: `staff-${row.date}-${index}`,
        date: row.date,
        staffId,
        hours: staffId === staff.sohyun ? 9.5 : 10.5,
      })),
    );
  }

  function createJuly2026Schedules() {
    const e = {
      bae: "emp-bae",
      juna: "emp-juna",
      juyeon: "emp-juyeon",
      jaehee: "emp-jaehee",
      minji: "emp-minji",
      yeongju: "emp-yeongju",
      hyeonju: "emp-hyeonju",
    };
    const rows = [
      ["2026-07-01", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-07-02", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-07-03", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-07-04", [["10pm", e.juna], ["10pm", e.juyeon], ["8pm", e.yeongju]]],
      ["2026-07-05", [["10pm", e.jaehee], ["10pm", e.minji], ["8pm", e.hyeonju]]],
      ["2026-07-06", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-07-07", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-07-08", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-07-09", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-07-10", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-07-11", [["10pm", e.juna], ["8pm", e.jaehee], ["10pm", e.yeongju]]],
      ["2026-07-12", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.hyeonju]]],
      ["2026-07-13", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-07-14", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-07-15", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-07-16", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-07-17", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-07-18", [["10pm", e.juna], ["10pm", e.juyeon], ["8pm", e.jaehee]]],
      ["2026-07-19", [["8pm", e.bae], ["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-07-20", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-07-21", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-07-22", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-07-23", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-07-24", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
      ["2026-07-25", [["10pm", e.juna], ["10pm", e.juyeon], ["8pm", e.jaehee]]],
      ["2026-07-26", [["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-07-27", [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]]],
      ["2026-07-28", [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.hyeonju]]],
      ["2026-07-29", [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]]],
      ["2026-07-30", [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]]],
      ["2026-07-31", [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]]],
    ];
    return createScheduleRecords(rows);
  }

  function createJuly2026StaffSchedules() {
    const staff = {
      subin: "emp-subin",
      yuri: "emp-yuri",
      hyojin: "emp-hyojin",
      sohyun: "emp-sohyun",
    };
    const rows = createWeekdaySubinStaffRows("2026-07").concat([
      { date: "2026-07-02", staffIds: [staff.sohyun] },
      { date: "2026-07-03", staffIds: [staff.sohyun] },
      { date: "2026-07-04", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-07-05", staffIds: [staff.yuri, staff.hyojin] },
      { date: "2026-07-09", staffIds: [staff.sohyun] },
      { date: "2026-07-10", staffIds: [staff.sohyun] },
      { date: "2026-07-11", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-07-12", staffIds: [staff.yuri, staff.hyojin] },
      { date: "2026-07-16", staffIds: [staff.sohyun] },
      { date: "2026-07-17", staffIds: [staff.sohyun] },
      { date: "2026-07-18", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-07-19", staffIds: [staff.hyojin] },
      { date: "2026-07-23", staffIds: [staff.sohyun] },
      { date: "2026-07-24", staffIds: [staff.sohyun] },
      { date: "2026-07-25", staffIds: [staff.hyojin, staff.sohyun] },
      { date: "2026-07-26", staffIds: [staff.yuri, staff.hyojin] },
      { date: "2026-07-30", staffIds: [staff.sohyun] },
      { date: "2026-07-31", staffIds: [staff.sohyun] },
    ]);
    return createStaffScheduleRecords(mergeStaffRows(rows));
  }

  function createMonthlyTemplateSchedules(monthKey) {
    const e = {
      juna: "emp-juna",
      juyeon: "emp-juyeon",
      jaehee: "emp-jaehee",
      minji: "emp-minji",
      yeongju: "emp-yeongju",
      hyeonju: "emp-hyeonju",
    };
    const template = {
      0: [["10pm", e.minji], ["10pm", e.yeongju], ["8pm", e.hyeonju]],
      1: [["10pm", e.juyeon], ["10pm", e.minji], ["8pm", e.yeongju], ["8pm", e.hyeonju]],
      2: [["10pm", e.juyeon], ["8pm", e.jaehee], ["10pm", e.hyeonju]],
      3: [["10pm", e.jaehee], ["8pm", e.yeongju], ["10pm", e.hyeonju]],
      4: [["10pm", e.juna], ["10pm", e.minji], ["8pm", e.yeongju]],
      5: [["10pm", e.juna], ["8pm", e.juyeon], ["10pm", e.jaehee]],
      6: [["10pm", e.juna], ["10pm", e.juyeon], ["8pm", e.jaehee]],
    };
    const [year, month] = monthKey.split("-").map(Number);
    const rows = [];
    for (let day = 1; day <= getDaysInMonth(year, month); day += 1) {
      const date = toDateString(year, month, day);
      rows.push([date, template[getWeekday(year, month, day)]]);
    }
    return createScheduleRecords(rows);
  }

  function createMonthlyTemplateStaffSchedules(monthKey) {
    const staff = {
      subin: "emp-subin",
      yuri: "emp-yuri",
      hyojin: "emp-hyojin",
      sohyun: "emp-sohyun",
    };
    const [year, month] = monthKey.split("-").map(Number);
    const rows = createWeekdaySubinStaffRows(monthKey);
    for (let day = 1; day <= getDaysInMonth(year, month); day += 1) {
      const date = toDateString(year, month, day);
      const weekday = getWeekday(year, month, day);
      if ([4, 5].includes(weekday)) rows.push({ date, staffIds: [staff.sohyun] });
      if (weekday === 6) rows.push({ date, staffIds: [staff.hyojin, staff.sohyun] });
      if (weekday === 0) rows.push({ date, staffIds: [staff.yuri, staff.hyojin] });
    }
    return createStaffScheduleRecords(mergeStaffRows(rows));
  }

  function createWeekdaySubinStaffRows(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const rows = [];
    for (let day = 1; day <= getDaysInMonth(year, month); day += 1) {
      const date = toDateString(year, month, day);
      const weekday = getWeekday(year, month, day);
      if (weekday >= 1 && weekday <= 5) rows.push({ date, staffIds: ["emp-subin"] });
    }
    return rows;
  }

  function createScheduleRecords(rows) {
    return rows.flatMap(([date, shifts]) =>
      shifts.map(([shiftType, pharmacistId, startHour, endHour], index) => ({
        id: `sch-${date}-${shiftType}-${index}`,
        date,
        shiftType,
        pharmacistId,
        ...(Number.isFinite(Number(startHour)) ? { startHour: Number(startHour) } : {}),
        ...(Number.isFinite(Number(endHour)) ? { endHour: Number(endHour) } : {}),
      })),
    );
  }

  function createStaffScheduleRecords(rows) {
    return rows.flatMap((row) =>
      row.staffIds.map((staffId, index) => ({
        id: `staff-${row.date}-${index}`,
        date: row.date,
        staffId,
        hours: staffId === "emp-sohyun" ? 9.5 : 10.5,
      })),
    );
  }

  function mergeStaffRows(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const staffIds = map.get(row.date) || [];
      row.staffIds.forEach((staffId) => {
        if (!staffIds.includes(staffId)) staffIds.push(staffId);
      });
      map.set(row.date, staffIds);
    });
    return Array.from(map, ([date, staffIds]) => ({ date, staffIds })).sort((a, b) => a.date.localeCompare(b.date));
  }

  function hasAnyScheduleInMonth(monthKey, targetDb = db) {
    return (
      (targetDb.schedules || []).some((schedule) => schedule.date?.startsWith(monthKey)) ||
      (targetDb.staffSchedules || []).some((schedule) => schedule.date?.startsWith(monthKey))
    );
  }

  function ensureMonthData(monthKey, targetDb = db, shouldSave = true, options = {}) {
    if (!monthKey) return false;
    let changed = false;
    const shouldPreserveExisting = Boolean(options.preserveExisting && hasAnyScheduleInMonth(monthKey, targetDb));
    if (!shouldPreserveExisting && monthKey === "2026-05") {
      changed = mergeScheduleSeeds(targetDb, createMay2026Schedules(), "schedules") || changed;
      changed = mergeScheduleSeeds(targetDb, createMay2026StaffSchedules(), "staffSchedules") || changed;
    }
    if (!shouldPreserveExisting && monthKey === "2026-07") {
      changed = mergeScheduleSeeds(targetDb, createJuly2026Schedules(), "schedules") || changed;
      changed = mergeScheduleSeeds(targetDb, createJuly2026StaffSchedules(), "staffSchedules") || changed;
    }
    if (!shouldPreserveExisting && monthKey >= "2026-08") {
      changed = ensureBaseMonthTemplates(monthKey, targetDb) || changed;
    }
    if (!shouldPreserveExisting) {
      const patternResult = applyEmployeePatternsForMonth(monthKey, targetDb);
      if (patternResult.added > 0) changed = true;
    }
    const removedByResignation = removeSchedulesAfterResignations(targetDb);
    if (removedByResignation > 0) changed = true;
    if (changed && shouldSave) saveDb(targetDb);
    return changed;
  }

  function mergeScheduleSeeds(targetDb, seeds, collectionName) {
    const collection = targetDb[collectionName];
    const deletedIds =
      collectionName === "staffSchedules"
        ? new Set(targetDb.deletedStaffScheduleSeedIds || [])
        : new Set(targetDb.deletedScheduleSeedIds || []);
    let changed = false;
    seeds.forEach((seed) => {
      if (!deletedIds.has(seed.id) && !collection.some((item) => item.id === seed.id)) {
        collection.push(seed);
        changed = true;
      }
    });
    return changed;
  }

  function ensureBaseMonthTemplates(monthKey, targetDb = db) {
    let changed = false;
    if (monthKey >= "2026-08" && !targetDb.schedules.some((schedule) => schedule.id.startsWith(`sch-${monthKey}-`))) {
      targetDb.schedules.push(...createMonthlyTemplateSchedules(monthKey));
      changed = true;
    }
    if (monthKey >= "2026-08" && !targetDb.staffSchedules.some((schedule) => schedule.id.startsWith(`staff-${monthKey}-`))) {
      targetDb.staffSchedules.push(...createMonthlyTemplateStaffSchedules(monthKey));
      changed = true;
    }
    return changed;
  }

  function applyCurrentPharmacistRatePreset(employee) {
    const weekdayHourlyRate = PHARMACIST_RATE_PRESETS[employee.id];
    if (!weekdayHourlyRate) return employee;
    return {
      ...employee,
      salaryType: "hourly",
      weekdayHourlyRate,
      weekendHourlyRate: weekdayHourlyRate + 5000,
      monthlySalary: 0,
      salaryEffectiveDate: employee.salaryEffectiveDate || "",
      salaryChanges: [
        {
          effectiveDate: employee.salaryEffectiveDate || "0000-00-00",
          salaryType: "hourly",
          weekdayHourlyRate,
          weekendHourlyRate: weekdayHourlyRate + 5000,
          monthlySalary: 0,
        },
      ],
    };
  }

  function applyCurrentAdminRatePreset(employee) {
    if (employee.id !== "emp-bae") return employee;
    return {
      ...employee,
      salaryType: "hourly",
      weekdayHourlyRate: 25000,
      weekendHourlyRate: 25000,
      monthlySalary: 0,
      salaryEffectiveDate: employee.salaryEffectiveDate || "",
      salaryChanges: [
        {
          effectiveDate: employee.salaryEffectiveDate || "0000-00-00",
          salaryType: "hourly",
          weekdayHourlyRate: 25000,
          weekendHourlyRate: 25000,
          monthlySalary: 0,
        },
      ],
    };
  }

  function pickUnique(items, start, count, exclude = []) {
    const selected = [];
    let cursor = start;
    while (selected.length < count && selected.length < items.length) {
      const candidate = items[((cursor % items.length) + items.length) % items.length];
      if (!exclude.includes(candidate.id) && !selected.some((item) => item.id === candidate.id)) {
        selected.push(candidate);
      }
      cursor += 1;
    }
    return selected;
  }

  function render() {
    applyScheduledResignations();
    const user = getCurrentUser();
    if (!user) {
      app.innerHTML = renderLogin();
      return;
    }
    if (!isEmployeeAccessActive(user)) {
      saveSession(null);
      app.innerHTML = renderLogin("퇴사 상태의 계정은 로그인할 수 없습니다.");
      return;
    }
    if (user.mustChangePassword && !user.viewOnly) {
      app.innerHTML = renderPasswordSetup(user);
      return;
    }
    ensureMonthData(monthCursor, db, true, { preserveExisting: true });
    // 옵저버는 근무약사와 동일하게 근무표/근무변경/급여 탭만 허용한다.
    if (user.viewOnly && !["calendar", "swap", "salary"].includes(currentTab)) {
      currentTab = "calendar";
    }
    if ((currentTab === "admin" || currentTab === "employees") && user.role !== "admin") {
      currentTab = "calendar";
    }
    if (currentTab === "leave" && employeeCategory(user) !== "staff1") {
      currentTab = "calendar";
    }
    if (currentTab === "swap" && !["admin", "pharmacist", "staff"].includes(user.role) && !user.viewOnly) {
      currentTab = "calendar";
    }
    const tabs = getTabs(user);
    app.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="app-title">
            <strong>근무 관리</strong>
            <span>${escapeHtml(user.name)}</span>
          </div>
          <div class="top-actions">
            ${renderRemoteSyncBadge()}
            <button class="ghost-button" type="button" data-action="logout">로그아웃</button>
          </div>
        </header>
        <main class="content">${renderActiveTab(user)}</main>
        <nav class="bottom-tabs ${user.role === "admin" ? "has-admin" : ""}" style="grid-template-columns: repeat(${tabs.length}, minmax(0, 1fr));" aria-label="하단 메뉴">
          ${tabs
            .map(
              (tab) => `
                <button class="tab-button ${currentTab === tab.id ? "active" : ""}" type="button" data-tab="${tab.id}" aria-label="${tab.label}">
                  ${tab.icon}
                  <span>${tab.label}</span>
                </button>
              `,
            )
            .join("")}
        </nav>
      </div>
      ${toast ? `<div class="toast" role="status">${escapeHtml(toast)}</div>` : ""}
    `;
    focusTodayAfterCalendarRender();
  }

  function renderRemoteSyncBadge() {
    if (!isRemoteSyncConfigured()) return "";
    const tone = remoteSyncStatus === "공유중" ? "online" : remoteSyncStatus === "저장중" || remoteSyncStatus === "공유연결중" ? "pending" : "offline";
    return `<span class="sync-pill ${tone}">${escapeHtml(remoteSyncStatus)}</span>`;
  }

  function renderLogin(error = "") {
    return `
      <section class="login-page">
        <div class="login-panel">
          <h1 class="login-title">근무 관리</h1>
          <p class="login-subtitle">본인 근무와 급여를 안전하게 확인하기 위해 아이디와 비밀번호로 로그인합니다.</p>
          ${error ? `<div class="notice" role="alert">${escapeHtml(error)}</div>` : ""}
          <form class="field-stack" data-form="login">
            <label class="field">
              <span>아이디</span>
              <input class="input" name="loginId" autocomplete="username" required />
            </label>
            <label class="field">
              <span>비밀번호</span>
              <input class="input" name="password" type="password" autocomplete="current-password" required />
            </label>
            <button class="primary-button" type="submit">로그인</button>
          </form>
        </div>
      </section>
    `;
  }

  function renderPasswordSetup(user, error = "") {
    return `
      <section class="login-page">
        <div class="login-panel">
          <h1 class="login-title">비밀번호 설정</h1>
          <p class="login-subtitle">${escapeHtml(user.name)}님, 첫 로그인 또는 초기화 후에는 새 비밀번호를 먼저 설정해야 합니다.</p>
          ${error ? `<div class="notice" role="alert">${escapeHtml(error)}</div>` : ""}
          <form class="field-stack" data-form="password-setup">
            <label class="field">
              <span>새 비밀번호</span>
              <input class="input" name="newPassword" type="password" minlength="4" autocomplete="new-password" required />
            </label>
            <label class="field">
              <span>새 비밀번호 확인</span>
              <input class="input" name="confirmPassword" type="password" minlength="4" autocomplete="new-password" required />
            </label>
            <button class="primary-button" type="submit">비밀번호 설정</button>
            <button class="ghost-button" type="button" data-action="logout">로그아웃</button>
          </form>
          <div class="notice" style="margin-top: 14px;">임시 비밀번호는 계속 사용할 수 없습니다.</div>
        </div>
      </section>
    `;
  }

  function renderActiveTab(user) {
    if (currentTab === "swap") return renderSwap(user);
    if (currentTab === "salary") return renderSalary(user);
    if (currentTab === "leave") return renderLeave(user);
    if (currentTab === "employees") return renderEmployeeManagement(user);
    if (currentTab === "admin") return renderAdmin(user);
    return renderCalendar(user);
  }

  function getTabs(user) {
    if (user?.viewOnly) {
      // 옵저버는 근무약사와 동일한 탭 구성(근무표/근무변경/내 급여)을 본다.
      return [
        { id: "calendar", label: "근무표", icon: iconCalendar() },
        { id: "swap", label: "근무 변경", icon: iconSwap() },
        { id: "salary", label: "내 급여", icon: iconWallet() },
      ];
    }
    const tabs = [
      { id: "calendar", label: "근무표", icon: iconCalendar() },
      { id: "salary", label: user.role === "admin" ? "급여관리" : "내 급여", icon: iconWallet() },
    ];
    if (["admin", "pharmacist", "staff"].includes(user.role)) {
      tabs.splice(1, 0, { id: "swap", label: user.role === "admin" ? "근무 변경 관리" : "근무 변경", icon: iconSwap() });
    }
    if (employeeCategory(user) === "staff1") {
      tabs.push({ id: "leave", label: "연차관리", icon: iconCalendar() });
    }
    if (user.role === "admin") {
      tabs.push({ id: "employees", label: "직원관리", icon: iconSettings() });
      tabs.push({ id: "admin", label: "관리자", icon: iconSettings() });
    }
    return tabs;
  }

  function renderCalendar(user) {
    const [year, month] = monthCursor.split("-").map(Number);
    const days = getDaysInMonth(year, month);
    const firstWeekday = getWeekday(year, month, 1);
    const blanks = Array.from({ length: firstWeekday }, () => `<div class="day-cell blank" aria-hidden="true"></div>`);
    const cells = [];
    for (let day = 1; day <= days; day += 1) {
      cells.push(renderDayCell(user, year, month, day));
    }
    return `
      <section>
        <div class="calendar-sticky-head">
          <div class="page-head">
            <div>
              <h1>월별 근무표</h1>
            </div>
          </div>
          ${renderMonthbar()}
          <div class="weekdays" aria-hidden="true">
            <div class="weekday sun">일</div>
            <div class="weekday">월</div>
            <div class="weekday">화</div>
            <div class="weekday">수</div>
            <div class="weekday">목</div>
            <div class="weekday">금</div>
            <div class="weekday sat">토</div>
          </div>
        </div>
        <div class="calendar-grid">
          ${blanks.join("")}
          ${cells.join("")}
        </div>
      </section>
    `;
  }

  function renderDayCell(user, year, month, day) {
    const date = toDateString(year, month, day);
    const weekday = getWeekday(year, month, day);
    const holiday = getHoliday(date);
    const isToday = date === getKoreaDateString();
    const hasPendingSwap = hasPendingSwapOnDate(date);
    const color = holiday || weekday === 0 ? "red" : weekday === 6 ? "blue" : "";
    const dateTone = holiday || weekday === 0 ? "red-line" : weekday === 6 ? "blue-line" : "";
    const schedules = getSchedulesByDate(date).filter((schedule) => shouldShowRxScheduleOnCalendar(user, schedule));
    const hasIrregular = schedules.some((schedule) => schedule.shiftType === "irregular");
    return `
      <article class="day-cell ${dateTone} ${isToday ? "today" : ""} ${hasPendingSwap ? "pending-swap-day" : ""}" data-date="${date}" aria-label="${month}월 ${day}일">
        <div class="day-top">
          <span class="day-number ${color}">${day}</span>
          <span class="day-flags">
            ${holiday ? `<span class="holiday-name" title="${escapeHtml(holiday.name)}">${escapeHtml(displayHolidayName(holiday.name))}</span>` : ""}
            ${hasPendingSwap ? `<span class="pending-swap-flag">교체대기</span>` : ""}
          </span>
        </div>
        <div class="day-content ${hasIrregular ? "has-irregular" : ""}">
          ${SHIFT_ORDER.map((shiftType) => renderShiftBlock(user, schedules, shiftType)).join("")}
          ${renderIrregularBlock(user, schedules)}
          ${renderStaffBlock(user, date)}
        </div>
      </article>
    `;
  }

  function renderShiftBlock(user, schedules, shiftType) {
    const shiftSchedules = schedules.filter((schedule) => schedule.shiftType === shiftType);
    const meta = SHIFT_META[shiftType];
    return `
      <div class="shift-block schedule-section shift-section ${meta.className}">
        <span class="shift-label ${meta.className}" title="${meta.detail}">${meta.label}</span>
        ${
          shiftSchedules.length
            ? shiftSchedules.map((schedule) => renderPersonRow(user, schedule)).join("")
            : `<div class="person-row">미배정</div>`
        }
      </div>
    `;
  }

  function renderIrregularBlock(user, schedules) {
    if (!canSeeAdminPrivateSchedule(user)) return "";
    const shiftSchedules = schedules.filter((schedule) => schedule.shiftType === "irregular");
    if (!shiftSchedules.length) return "";
    const meta = SHIFT_META.irregular;
    return `
      <div class="shift-block schedule-section shift-section irregular-block">
        <span class="shift-label ${meta.className}" title="${meta.detail}">${meta.label}</span>
        ${shiftSchedules.map((schedule) => renderPersonRow(user, schedule)).join("")}
      </div>
    `;
  }

  function renderPersonRow(user, schedule) {
    const employee = getEmployee(schedule.pharmacistId);
    const isMine = schedule.pharmacistId === user.id;
    const pendingSwap = getPendingSwapForSchedule(`rx:${schedule.id}`);
    const pendingForMe = pendingSwap && pendingSwap.targetId === user.id;
    const name = employee ? employee.name : "알 수 없음";
    const statusMark = employee && employee.status === "resigned" ? " (퇴사)" : "";
    const changedMark = isChangedSchedule(schedule, "rx") ? renderChangedScheduleMark() : "";
    const timeLabel = schedule.pharmacistId === "emp-bae" ? SHIFT_META[schedule.shiftType]?.label : getScheduleTimeLabel(schedule);
    const timeMark =
      schedule.pharmacistId !== "emp-bae" && timeLabel !== SHIFT_META[schedule.shiftType]?.label
        ? `<span class="person-time">${escapeHtml(timeLabel)}</span>`
        : "";
    return `<div class="person-row ${isMine ? "mine" : ""} ${pendingSwap ? "pending-swap-person" : ""} ${pendingForMe ? "needs-my-approval" : ""}">
      <span class="person-name">${escapeHtml(name)}${changedMark}${statusMark}</span>${timeMark}${pendingSwap ? `<span class="swap-badge">${pendingForMe ? "승인필요" : "교체대기"}</span>` : ""}
    </div>`;
  }

  function renderStaffBlock(user, date) {
    const schedules = getStaffSchedulesByDate(date).filter((schedule) => shouldShowStaffScheduleOnCalendar(user, schedule));
    if (!schedules.length) return "";
    return `
      <div class="shift-block schedule-section staff-block">
        <span class="shift-label staff">직원</span>
        ${schedules.map((schedule) => renderStaffRow(user, schedule)).join("")}
      </div>
    `;
  }

  function renderStaffRow(user, schedule) {
    const employee = getEmployee(schedule.staffId);
    const isMine = schedule.staffId === user.id;
    const pendingSwap = getPendingSwapForSchedule(`staff:${schedule.id}`);
    const pendingForMe = pendingSwap && pendingSwap.targetId === user.id;
    const name = employee ? employee.name : "알 수 없음";
    const statusMark = employee && employee.status === "resigned" ? " (퇴사)" : "";
    const changedMark = isChangedSchedule(schedule, "staff") ? renderChangedScheduleMark() : "";
    return `<div class="person-row staff-person ${isMine ? "mine" : ""} ${pendingSwap ? "pending-swap-person" : ""} ${pendingForMe ? "needs-my-approval" : ""}">
      <span class="person-name">${escapeHtml(name)}${changedMark}${statusMark}</span>${pendingSwap ? `<span class="swap-badge">${pendingForMe ? "승인필요" : "교체대기"}</span>` : ""}
    </div>`;
  }

  function renderChangedScheduleMark() {
    return `<sup class="changed-star" title="변경된 근무">*</sup>`;
  }

  function isChangedSchedule(schedule, type) {
    if (!schedule) return false;
    // 지난 일정은 변경 표시하지 않고, 오늘 이후 일정만 체크한다.
    if (schedule.date && schedule.date < getKoreaDateString()) return false;
    // 기본 근무가 등록되지 않은 사람(예: 관리자 배주성)은 근무에 들어가면 항상 변경으로 본다.
    const ownerId = type === "staff" ? schedule.staffId : schedule.pharmacistId;
    const owner = getEmployee(ownerId);
    if (owner && !(Array.isArray(owner.workPatterns) && owner.workPatterns.length)) return true;
    // 사진 기준으로 박힌 달(2026-05~07)은 변경 기록이 없으므로 그 달 최초 세팅(시드)과 직접 비교한다.
    if (isSeedDifferentFromBaseline(schedule, type)) return true;
    // 그 외(요일 패턴으로 자동 생성되는 달)는 교환·넘기기·대체·관리자수정 기록으로만 변경을 판정한다.
    if (isManuallyChangedSchedule(schedule, type)) return true;
    return hasApprovedChangeForSchedule(schedule, type);
  }

  // 사진 기준으로 세팅된 달(2026-05~07)의 시드(최초 배정) 베이스라인. 한 번 만들어 캐시한다.
  const seedRxBaselineCache = new Map();
  const seedStaffBaselineCache = new Map();
  function getSeedRxBaseline(monthKey) {
    if (seedRxBaselineCache.has(monthKey)) return seedRxBaselineCache.get(monthKey);
    let rows = null;
    if (monthKey === "2026-05") rows = createMay2026Schedules();
    else if (monthKey === "2026-06") rows = createJune2026Schedules();
    else if (monthKey === "2026-07") rows = createJuly2026Schedules();
    const map = rows ? new Map(rows.map((row) => [row.id, row])) : null;
    seedRxBaselineCache.set(monthKey, map);
    return map;
  }
  function getSeedStaffBaseline(monthKey) {
    if (seedStaffBaselineCache.has(monthKey)) return seedStaffBaselineCache.get(monthKey);
    let rows = null;
    if (monthKey === "2026-05") rows = createMay2026StaffSchedules();
    else if (monthKey === "2026-06") rows = createJune2026StaffSchedules();
    else if (monthKey === "2026-07") rows = createJuly2026StaffSchedules();
    const map = rows ? new Map(rows.map((row) => [row.id, row])) : null;
    seedStaffBaselineCache.set(monthKey, map);
    return map;
  }

  // 사진 기준 시드(최초 배정)와 현재 배정이 다르면 변경으로 본다. 시드달(2026-05~07)이 아니면 false.
  function isSeedDifferentFromBaseline(schedule, type) {
    if (!schedule || !schedule.date) return false;
    const monthKey = schedule.date.slice(0, 7);
    const baseline = type === "staff" ? getSeedStaffBaseline(monthKey) : getSeedRxBaseline(monthKey);
    if (!baseline) return false; // 시드달이 아님(자동 생성 달)
    const base = baseline.get(schedule.id);
    if (!base) return true; // 시드에 없던 근무(추가 배정) → 변경
    if (type === "staff") return base.staffId !== schedule.staffId; // 직원: 사람 변경
    if (base.pharmacistId !== schedule.pharmacistId) return true; // 약사: 사람 변경
    if (base.shiftType !== schedule.shiftType) return true; // 근무 종류(10-10/10-8) 변경
    const actual = getScheduleTimeRange(schedule, schedule.shiftType);
    const baseTime = getDefaultTimeRange(base.shiftType);
    return actual.start !== baseTime.start || actual.end !== baseTime.end; // 시간 변경
  }

  function isManuallyChangedSchedule(schedule, type) {
    if (!schedule.changedAt) return false;
    const original = schedule.changeOriginal;
    if (!original || typeof original !== "object") return true;
    const current = type === "staff" ? snapshotStaffSchedule(schedule) : snapshotRxSchedule(schedule);
    return JSON.stringify(original) !== JSON.stringify(current);
  }

  function hasApprovedChangeForSchedule(schedule, type) {
    const ref = `${type === "staff" ? "staff" : "rx"}:${schedule.id}`;
    const currentOwnerId = type === "staff" ? schedule.staffId : schedule.pharmacistId;
    return db.swapRequests.some((request) => {
      if (!request || request.status !== "approved" || request.type === "leave") return false;
      const requesterRef = normalizeAssignmentRef(request.requesterScheduleId);
      const targetRef = normalizeAssignmentRef(request.targetScheduleId);
      if (requesterRef === ref) {
        const originalOwnerId = request.requesterOriginalPharmacistId || request.requesterId;
        return currentOwnerId !== originalOwnerId;
      }
      if (targetRef === ref) {
        const originalOwnerId = request.targetOriginalPharmacistId || request.targetId;
        return currentOwnerId !== originalOwnerId;
      }
      return false;
    });
  }

  function shouldShowRxScheduleOnCalendar(user, schedule) {
    if (schedule?.shiftType === "irregular") return canSeeAdminPrivateSchedule(user);
    if (schedule?.pharmacistId !== "emp-bae") return true;
    if (canSeeAdminPrivateSchedule(user)) return true;
    return isDefaultScheduleTime(schedule, schedule.shiftType);
  }

  function shouldShowStaffScheduleOnCalendar(user, schedule) {
    if (schedule?.staffId !== "emp-bae") return true;
    if (canSeeAdminPrivateSchedule(user)) return true;
    return isDefaultScheduleTime(schedule, "staff");
  }

  function canSeeAdminPrivateSchedule(user) {
    return user?.id === "emp-bae" || user?.role === "admin";
  }

  function isDefaultScheduleTime(schedule, fallbackType) {
    const actual = getScheduleTimeRange(schedule, fallbackType);
    const defaults = getDefaultTimeRange(fallbackType);
    return actual.start === defaults.start && actual.end === defaults.end;
  }

  function renderMonthbar() {
    const [year, month] = monthCursor.split("-").map(Number);
    return `
      <div class="monthbar">
        <button class="icon-button" type="button" data-action="month-prev" aria-label="이전 달">‹</button>
        <button class="month-title" type="button" data-action="month-today">${year}년 ${month}월</button>
        <button class="icon-button" type="button" data-action="month-next" aria-label="다음 달">›</button>
      </div>
    `;
  }

  function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return `${year}년 ${month}월`;
  }

  function renderSwap(user) {
    const category = employeeCategory(user);
    const isStaffCoverageOnly = ["staff1", "staff2"].includes(category);
    const pageTitle = user.role === "admin" ? "근무 변경 관리" : "근무 변경";
    const swapGuide = isStaffCoverageOnly
      ? "휴무가 필요한 근무일을 관리자에게 요청할 수 있습니다."
      : "교환하거나, 내 약사 근무를 다른 근무자에게 넘길 수 있습니다.";
    return `
      <section>
        <div class="page-head">
          <div>
            <h1>${pageTitle}</h1>
            <p>${swapGuide}</p>
          </div>
        </div>
        ${renderMonthbar()}
        ${isStaffCoverageOnly ? "" : renderWorkChangeRequestForm(user)}
        ${canManageOverseasSchedule(user) ? renderOverseasScheduleForm(user) : ""}
        ${renderCoverageRequestForm(user)}
        ${renderIncomingRequests(user)}
        ${renderMyRequests(user)}
        ${user.role === "admin" ? renderCompletedWorkChangesPanel(user) : ""}
        ${user.role === "admin" ? renderAllRequestsPanel(user) : ""}
        ${user.role === "admin" ? renderAdminOverseasSchedulesPanel(user) : ""}
      </section>
    `;
  }

  function renderWorkChangeRequestForm(user) {
    const ownOptions = getAvailableOwnSchedules(user.id)
      .map((assignment) => `<option value="${assignment.ref}">${escapeHtml(assignmentOptionLabel(assignment))}</option>`)
      .join("");
    const targetEmployees = getAvailableSwapTargetEmployees(user.id);
    if (!targetEmployees.some((employee) => employee.id === selectedSwapTargetEmployeeId)) {
      selectedSwapTargetEmployeeId = targetEmployees[0]?.id || "";
    }
    const targetEmployeeOptions = targetEmployees
      .map((employee) => `<option value="${employee.id}" ${employee.id === selectedSwapTargetEmployeeId ? "selected" : ""}>${escapeHtml(workerOptionLabel(employee))}</option>`)
      .join("");
    const targetOptions = getAvailableTargetSchedules(user.id, selectedSwapTargetEmployeeId)
      .map((assignment) => `<option value="${assignment.ref}">${escapeHtml(assignmentOptionLabel(assignment, true))}</option>`)
      .join("");
    const handoffOwnOptions = getAvailableHandoffOwnSchedules(user.id)
      .map((assignment) => `<option value="${assignment.ref}">${escapeHtml(assignmentOptionLabel(assignment))}</option>`)
      .join("");
    const handoffTargetOptions = getAvailableHandoffTargets(user.id)
      .map((employee) => `<option value="${employee.id}">${escapeHtml(workerOptionLabel(employee))}</option>`)
      .join("");
    return `
      <div class="panel">
        <h2>새 근무 변경 요청</h2>
        <div class="mode-switch">
          <input class="mode-radio" id="work-change-exchange" type="radio" name="workChangeMode" checked />
          <input class="mode-radio" id="work-change-handoff" type="radio" name="workChangeMode" />
          <div class="mode-toggle" aria-label="근무 변경 방식">
            <label for="work-change-exchange">교환하기</label>
            <label for="work-change-handoff">넘기기</label>
          </div>
          <div class="mode-panels">
            <div class="mode-panel exchange-panel">
              <p class="item-meta">내 근무와 상대 근무를 서로 바꿉니다.</p>
              <form class="form-grid" data-form="swap-request">
                <label class="field">
                  <span>내 근무일</span>
                  <select class="select" name="ownScheduleId" ${ownOptions ? "" : "disabled"} required>
                    ${ownOptions || `<option>선택 가능한 근무가 없습니다</option>`}
                  </select>
                </label>
                <label class="field">
                  <span>바꿀 상대</span>
                  <select class="select" name="targetEmployeeId" ${targetEmployeeOptions ? "" : "disabled"} required>
                    ${targetEmployeeOptions || `<option>선택 가능한 상대가 없습니다</option>`}
                  </select>
                </label>
                <label class="field">
                  <span>바꿀 상대 근무일</span>
                  <select class="select" name="targetScheduleId" ${targetEmployeeOptions && targetOptions ? "" : "disabled"} required>
                    ${targetOptions || `<option>선택 가능한 상대 근무가 없습니다</option>`}
                  </select>
                </label>
                <button class="primary-button" type="submit" ${ownOptions && targetOptions ? "" : "disabled"}>교환 요청</button>
              </form>
            </div>
            <div class="mode-panel handoff-panel">
              <p class="item-meta">내 약사 근무를 관리자 또는 근무약사에게 넘깁니다. 상대가 승인하면 그 근무자만 바뀝니다.</p>
              <form class="form-grid" data-form="handoff-request">
                <label class="field">
                  <span>넘길 내 근무일</span>
                  <select class="select" name="ownScheduleId" ${handoffOwnOptions ? "" : "disabled"} required>
                    ${handoffOwnOptions || `<option>선택 가능한 약사 근무가 없습니다</option>`}
                  </select>
                </label>
                <label class="field">
                  <span>받을 근무자</span>
                  <select class="select" name="targetEmployeeId" ${handoffTargetOptions ? "" : "disabled"} required>
                    ${handoffTargetOptions || `<option>선택 가능한 근무자가 없습니다</option>`}
                  </select>
                </label>
                <button class="primary-button" type="submit" ${handoffOwnOptions && handoffTargetOptions ? "" : "disabled"}>넘기기 요청</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCoverageRequestForm(user) {
    if (!["staff1", "staff2"].includes(employeeCategory(user))) return "";
    const admin = getPrimaryAdmin();
    const coverageOptions = getAvailableCoverageSchedules(user.id)
      .map((assignment) => `<option value="${assignment.ref}">${escapeHtml(assignmentOptionLabel(assignment).replace(" (직원근무)", " 근무"))}</option>`)
      .join("");
    return `
      <div class="panel">
        <h2>관리자 대체 요청</h2>
        <p class="item-meta">휴무 요청을 보내면 승인 후 해당 날짜 직원칸에 ${escapeHtml(admin?.name || "관리자")}님이 배치됩니다.</p>
        <form class="form-grid" data-form="coverage-request">
          <label class="field">
            <span>휴무 요청하는 근무일</span>
            <select class="select" name="ownScheduleId" ${coverageOptions && admin ? "" : "disabled"} required>
              ${coverageOptions || `<option>선택 가능한 근무가 없습니다</option>`}
            </select>
          </label>
          <button class="primary-button" type="submit" ${coverageOptions && admin ? "" : "disabled"}>관리자에게 요청</button>
        </form>
      </div>
    `;
  }

  function renderOverseasScheduleForm(user) {
    const schedules = getOverseasSchedulesForEmployee(user.id, monthCursor);
    return `
      <div class="panel">
        <h2>해외일정 등록</h2>
        <p class="item-meta">근무약사 해외일정을 등록하면 관리자가 해당 월 일정에서 확인할 수 있습니다.</p>
        <form class="form-grid" data-form="overseas-add">
          <label class="field">
            <span>시작일</span>
            <input class="input" name="startDate" type="date" value="${getKoreaDateString()}" required />
          </label>
          <label class="field">
            <span>종료일</span>
            <input class="input" name="endDate" type="date" value="${getKoreaDateString()}" required />
          </label>
          <label class="field full">
            <span>메모</span>
            <input class="input" name="memo" placeholder="예: 일본, 학회, 여행" />
          </label>
          <button class="primary-button full" type="submit">해외일정 등록</button>
        </form>
        <h3>${escapeHtml(formatMonthLabel(monthCursor))} 내 해외일정</h3>
        ${
          schedules.length
            ? `<div class="list">${schedules.map((schedule) => renderOverseasScheduleItem(schedule, user)).join("")}</div>`
            : `<div class="empty-state">해당 월에 등록된 내 해외일정이 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderAdminOverseasSchedulesPanel(user) {
    const schedules = getOverseasSchedulesForMonth(monthCursor);
    return `
      <div class="panel">
        <h2>해외일정 확인</h2>
        <p class="item-meta">조회 중인 달과 하루라도 겹치는 해외일정을 모두 표시합니다.</p>
        ${
          schedules.length
            ? `<div class="list">${schedules.map((schedule) => renderOverseasScheduleItem(schedule, user, true)).join("")}</div>`
            : `<div class="empty-state">해당 월에 겹치는 해외일정이 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderOverseasScheduleItem(schedule, user, adminMode = false) {
    const employee = getEmployee(schedule.employeeId);
    const canDelete = user?.role === "admin" || user?.id === schedule.employeeId;
    return `
      <article class="list-item overseas-item">
        <div class="item-title">
          <span>${escapeHtml(employee?.name || "알 수 없음")}</span>
          <span class="status-pill status-pending">해외</span>
        </div>
        <div class="overseas-range">${escapeHtml(getOverseasRangeLabel(schedule))}</div>
        ${schedule.memo ? `<div class="item-meta">${escapeHtml(schedule.memo)}</div>` : ""}
        ${adminMode ? `<div class="item-meta">등록일: ${formatDateTime(schedule.createdAt)}</div>` : ""}
        ${
          canDelete
            ? `<div class="button-row overseas-actions"><button class="danger-button request-cancel-button admin-cancel-button" type="button" data-action="delete-overseas" data-id="${schedule.id}">삭제</button></div>`
            : ""
        }
      </article>
    `;
  }

  function renderIncomingRequests(user) {
    const incoming = db.swapRequests
      .filter((request) => request.targetId === user.id && request.status === "pending")
      .sort(sortRecent);
    return `
      <div class="panel">
        <h2>승인 대기</h2>
        ${
          incoming.length
            ? `<div class="list">${incoming.map((request) => renderRequestCard(request, user, true, user.role === "admin")).join("")}</div>`
            : `<div class="empty-state">내가 승인해야 할 근무 변경 요청이 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderMyRequests(user) {
    const mine = db.swapRequests
      .filter((request) => request.requesterId === user.id || request.targetId === user.id)
      .sort(sortRecent);
    return `
      <div class="panel">
        <h2>내 근무 변경 내역</h2>
        ${
          mine.length
            ? `<div class="list">${mine.map((request) => renderRequestCard(request, user, false, user.role === "admin")).join("")}</div>`
            : `<div class="empty-state">아직 근무 변경 내역이 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderAllRequestsPanel(user) {
    const requests = getAdminVisibleRequests().filter((request) => !isCompletedWorkChange(request)).sort(sortRecent);
    return `
      <div class="panel">
        <h2>기타 요청 내역</h2>
        ${
          requests.length
            ? `<div class="list">${requests.map((request) => renderRequestCard(request, user, false, true)).join("")}</div>`
            : `<div class="empty-state">표시할 기타 요청 내역이 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderCompletedWorkChangesPanel(user) {
    const requests = getVisibleCompletedWorkChanges().sort(sortRecent);
    return `
      <div class="panel">
        <h2>근무 변경 처리완료</h2>
        ${
          requests.length
            ? `<div class="list">${requests.map((request) => renderRequestCard(request, user, false, true)).join("")}</div>`
            : `<div class="empty-state">오늘 이후 남아있는 근무 변경 처리완료 내역이 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderRequestCard(request, user, actionable = false, adminMode = false) {
    const isCoverage = request.type === "coverage";
    const isLeave = request.type === "leave";
    const isHandoff = request.type === "handoff";
    const requester = getEmployee(request.requesterId);
    const target = getEmployee(request.targetId);
    const requesterSchedule = getSwapAssignment(request.requesterScheduleId);
    const targetSchedule = getSwapAssignment(request.targetScheduleId);
    const statusText = getRequestStatusText(request.status, request.type);
    const canRequesterCancel = request.status === "pending" && request.requesterId === user?.id;
    const canAdminCancel = adminMode && user?.role === "admin" && ["pending", "approved"].includes(request.status);
    const canCancel = canRequesterCancel || canAdminCancel;
    const cancelLabel = canAdminCancel ? "관리자 취소" : "요청 취소";
    const requesterOwnerId = request.requesterOriginalPharmacistId || request.requesterId;
    const targetOwnerId = request.targetOriginalPharmacistId || request.targetId;
    const leftLabel = isLeave
      ? `${formatFullDate(request.leaveDate)} 연차`
      : assignmentOptionLabelWithOwner(requesterSchedule, requesterOwnerId, true);
    const rightLabel = (() => {
      if (isCoverage) return `${target?.name || "배주성"} 직원포지션 대체`;
      if (isLeave) return `${target?.name || "관리자"} 승인`;
      if (isHandoff) return `${target?.name || "받을 근무자"}에게 넘김`;
      return assignmentOptionLabelWithOwner(targetSchedule, targetOwnerId, true);
    })();
    const requestTitle = isLeave
      ? "연차 승인 요청"
      : isCoverage
        ? "관리자 대체 요청"
        : isHandoff
          ? request.status === "pending"
            ? "근무 넘기기 요청"
            : "근무 넘기기 내역"
          : request.status === "pending"
            ? "근무 변경 요청"
            : "근무 변경 내역";
    const statusClass =
      request.status === "approved" ? "status-active" : request.status === "pending" ? "status-pending" : "status-resigned";
    const requestMetaLine = (() => {
      if (request.status === "pending") {
        return isHandoff
          ? `${requester?.name || "알 수 없음"}님이 ${target?.name || "알 수 없음"}님에게 넘기기 승인대기`
          : `${requester?.name || "알 수 없음"}님 요청 · ${target?.name || "알 수 없음"}님 승인대기`;
      }
      if (request.status === "approved") {
        if (isLeave) return `${requester?.name || "알 수 없음"}님 연차 처리완료`;
        if (isCoverage) return `${requester?.name || "알 수 없음"}님 직원 근무를 ${target?.name || "알 수 없음"}님이 대체 완료`;
        if (isHandoff) return `${requester?.name || "알 수 없음"}님 근무를 ${target?.name || "알 수 없음"}님에게 넘김 완료`;
        return `${requester?.name || "알 수 없음"}님과 ${target?.name || "알 수 없음"}님의 승인완료`;
      }
      if (isLeave) return `${requester?.name || "알 수 없음"}님 연차 요청`;
      if (isCoverage) return `${requester?.name || "알 수 없음"}님 관리자 대체 요청`;
      if (isHandoff) return `${requester?.name || "알 수 없음"}님이 ${target?.name || "알 수 없음"}님에게 근무 넘기기 요청`;
      return `${requester?.name || "알 수 없음"}님과 ${target?.name || "알 수 없음"}님의 근무 변경 요청`;
    })();
    return `
      <article class="list-item ${request.status === "pending" ? "" : "dim"}">
        <div class="item-title">
          <span>${requestTitle}</span>
          <span class="status-pill ${statusClass}">${statusText}</span>
        </div>
        <div class="swap-pair" aria-label="교체 근무 내용">
          <div>${escapeHtml(leftLabel)}</div>
          <strong>${isCoverage || isLeave || isHandoff ? "→" : "&lt;-&gt;"}</strong>
          <div>${escapeHtml(rightLabel)}</div>
        </div>
        <div class="item-meta">
          ${escapeHtml(requestMetaLine)}<br />
          요청일: ${formatDateTime(request.createdAt)}
          ${request.approvedAt ? `<br />처리일: ${formatDateTime(request.approvedAt)}` : ""}
          ${request.rejectedAt ? `<br />거절일: ${formatDateTime(request.rejectedAt)}` : ""}
          ${request.cancelledAt ? `<br />취소일: ${formatDateTime(request.cancelledAt)}` : ""}
        </div>
        ${
          actionable
            ? `<div class="button-row" style="margin-top: 10px;">
                <button class="primary-button" type="button" data-action="approve-request" data-id="${request.id}">승인</button>
                <button class="danger-button" type="button" data-action="reject-request" data-id="${request.id}">거절</button>
              </div>`
            : ""
        }
        ${
          canCancel
            ? `<div class="button-row" style="margin-top: 10px;">
                <button class="danger-button request-cancel-button ${canAdminCancel ? "admin-cancel-button" : ""}" type="button" data-action="cancel-request" data-id="${request.id}">${cancelLabel}</button>
              </div>`
            : ""
        }
      </article>
    `;
  }

  function renderSalary(user) {
    if (user.role === "admin") {
      return renderAdminSalary(user);
    }
    // 옵저버는 실제 직원 급여 대신 그럴듯한 가짜 통계만 본다.
    const stats = user.viewOnly ? OBSERVER_SALARY_STATS : getSalaryStats(user.id, monthCursor);
    const salaryConfig = user.viewOnly
      ? { salaryType: "hourly", weekdayHourlyRate: 32000, weekendHourlyRate: 37000, monthlySalary: 0 }
      : getSalaryConfigForDate(user, getMonthEndDate(monthCursor));
    return `
      <section>
        <div class="page-head">
          <div>
            <h1>내 급여</h1>
            <p>개인 급여는 로그인한 본인에게만 표시됩니다.</p>
          </div>
        </div>
        ${renderMonthbar()}
        <div class="panel">
          <h2>${escapeHtml(user.name)} 급여 예상</h2>
          <div class="salary-hero">
            <span>예상 급여</span>
            <strong>${formatWon(stats.totalPay)}</strong>
          </div>
          <div class="summary-grid compact">
            <div class="metric compact"><span>근무</span><strong>${stats.totalCount}회</strong></div>
            <div class="metric compact"><span>총 시간</span><strong>${formatHours(stats.totalHours)}시간</strong></div>
            <div class="metric compact"><span>평일</span><strong>${formatHours(stats.weekdayHours)}시간</strong></div>
            <div class="metric compact"><span>주말/공휴일</span><strong>${formatHours(stats.weekendHours)}시간</strong></div>
            ${
              salaryConfig.salaryType === "fixed"
                ? `<div class="metric compact"><span>고정급</span><strong>${formatWon(stats.fixedPay)}</strong></div>`
                : `<div class="metric compact"><span>평일 급여</span><strong>${formatWon(stats.weekdayPay)}</strong></div>
                   <div class="metric compact"><span>공휴일 급여</span><strong>${formatWon(stats.weekendPay)}</strong></div>`
            }
            ${stats.tenCount ? `<div class="metric compact"><span>10-10</span><strong>${stats.tenCount}회</strong></div>` : ""}
            ${stats.eightCount ? `<div class="metric compact"><span>10-8</span><strong>${stats.eightCount}회</strong></div>` : ""}
            ${stats.staffCount ? `<div class="metric compact"><span>직원 근무</span><strong>${stats.staffCount}회</strong></div>` : ""}
          </div>
          <p class="item-meta">${user.viewOnly ? "시급 평일 32,000원 / 주말·공휴일 37,000원" : salaryBasisText(user)} 기준입니다. 근무시간을 수정하면 선택한 시작/종료 시간 기준으로 계산합니다.</p>
        </div>
      </section>
    `;
  }

  function renderAdminSalary() {
    const workers = db.employees
      .filter((employee) => employee.role !== "admin" || employee.id === "emp-bae")
      .map((employee) => ({ employee, stats: getSalaryStats(employee.id, monthCursor) }))
      .sort((a, b) => {
        if (a.employee.id === "emp-bae") return -1;
        if (b.employee.id === "emp-bae") return 1;
        return b.stats.totalPay - a.stats.totalPay;
      });
    const totalPayroll = workers.reduce((sum, row) => sum + row.stats.totalPay, 0);
    return `
      <section>
        <div class="page-head">
          <div>
            <h1>급여관리</h1>
            <p>관리자는 약사와 직원의 시급제/고정급 급여를 함께 확인합니다.</p>
          </div>
        </div>
        ${renderMonthbar()}
        <div class="salary-hero payroll-total-hero">
          <div>
            <span>전체 예상 급여</span>
            <strong>${formatWon(totalPayroll)}</strong>
          </div>
          <p>관리자 포함 ${workers.length}명 합산</p>
        </div>
        <div class="panel">
          <h2>직원별 급여 계산</h2>
          <div class="payroll-list">
            ${workers.map(({ employee, stats }) => renderPayrollCard(employee, stats)).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function renderLeave(user) {
    const leavePeriodStart = getLeavePeriodStart(user);
    const leaveDates = getLeaveDatesInCurrentPeriod(user);
    const pendingLeaves = getLeaveRequests(user.id, "pending", leavePeriodStart);
    const used = leaveDates.length;
    const remaining = Math.max(Number(user.leaveAllowance || 0) - used - pendingLeaves.length, 0);
    return `
      <section>
        <div class="page-head">
          <div>
            <h1>연차관리</h1>
            <p>사용 날짜를 관리자에게 승인 요청하고 남은 연차를 확인합니다.</p>
          </div>
        </div>
        <div class="panel">
          <h2>${escapeHtml(user.name)} 연차</h2>
          <div class="salary-hero leave-hero">
            <span>남은 연차</span>
            <strong>${remaining}개</strong>
          </div>
          <div class="summary-grid compact">
            <div class="metric compact"><span>제공 연차</span><strong>${Number(user.leaveAllowance || 0)}개</strong></div>
            <div class="metric compact"><span>처리완료</span><strong>${used}개</strong></div>
            <div class="metric compact"><span>승인대기</span><strong>${pendingLeaves.length}개</strong></div>
            <div class="metric compact"><span>연차 기준일</span><strong>${leavePeriodStart ? formatDate(leavePeriodStart) : "-"}</strong></div>
          </div>
          <form class="form-grid" data-form="leave-add" style="margin-top: 12px;">
            <label class="field">
              <span>연차 사용 날짜</span>
              <input class="input" name="leaveDate" type="date" required />
            </label>
            <button class="primary-button" type="submit">관리자에게 승인 요청</button>
          </form>
        </div>
        <div class="panel">
          <h2>승인 대기</h2>
          ${
            pendingLeaves.length
              ? `<div class="list">${pendingLeaves.map((request) => renderRequestCard(request, user, false)).join("")}</div>`
              : `<div class="empty-state">승인 대기 중인 연차 요청이 없습니다.</div>`
          }
        </div>
        <div class="panel">
          <h2>처리완료 날짜</h2>
          ${
            leaveDates.length
              ? `<div class="list">${leaveDates
                  .map(
                    (date) => `
                      <div class="list-item leave-item">
                        <div>
                          <strong>${formatFullDate(date)}</strong>
                          <div class="item-meta">${getHoliday(date)?.name || (isWeekendDate(date) ? "주말/공휴일" : "평일")}</div>
                        </div>
                      </div>
                    `,
                  )
                  .join("")}</div>`
              : `<div class="empty-state">처리완료된 연차 사용일이 없습니다.</div>`
          }
        </div>
      </section>
    `;
  }

  function renderPayrollCard(employee, stats) {
    return `
      <article class="payroll-card">
        <div class="payroll-main">
          <div class="payroll-person">
            <b>${escapeHtml(employee.name)}</b>
            <span>${escapeHtml(employeeDisplayRole(employee))} · ${employeeStatusText(employee)}</span>
          </div>
          <div class="payroll-total">
            <strong>${formatWon(stats.totalPay)}</strong>
            <span>예상 급여</span>
          </div>
        </div>
        <details class="payroll-details">
          <summary>상세내역</summary>
          <div class="payroll-detail-grid">
            <span>근무</span><b>${stats.totalCount}회 (${workBreakdownText(stats)})</b>
            <span>평일</span><b>${formatHours(stats.weekdayHours)}시간 / ${formatWon(stats.weekdayPay)}</b>
            <span>주말/공휴일</span><b>${formatHours(stats.weekendHours)}시간 / ${formatWon(stats.weekendPay)}</b>
            ${stats.fixedPay ? `<span>고정급 반영</span><b>${formatWon(stats.fixedPay)}</b>` : ""}
            <span>급여 기준</span><b>${salaryBasisText(employee)}</b>
          </div>
        </details>
      </article>
    `;
  }

  function renderAdmin(user) {
    return `
      <section>
        <div class="page-head">
          <div>
            <h1>관리자 메뉴</h1>
            <p>월별 근무표, 공휴일, 교체 기록을 관리합니다.</p>
          </div>
        </div>
        ${renderMonthbar()}
        <div class="admin-stack">
          ${renderScheduleAdmin()}
          ${renderHolidayAdmin()}
          ${renderAuditPanel(user)}
        </div>
      </section>
    `;
  }

  function renderEmployeeManagement() {
    return `
      <section>
        <div class="page-head">
          <div>
            <h1>직원관리</h1>
            <p>직원 아이디 부여, 급여 기준, 재직 상태, 연차 기본 수량을 관리합니다.</p>
          </div>
        </div>
        ${renderMonthbar()}
        ${renderEmployeeAdmin()}
      </section>
    `;
  }

  function renderEmployeeAdmin() {
    const employees = db.employees
      .slice()
      .filter((employee) => isEmployeeVisibleInMonth(employee, monthCursor))
      .sort((a, b) => {
        if (a.id === "emp-bae") return -1;
        if (b.id === "emp-bae") return 1;
        return 0;
      });
    const selectedEmployee = getSelectedEmployeeForAdmin(employees);
    return `
      <div class="panel">
        <h2>직원 등록 및 상태</h2>
        <form class="form-grid wide employee-config-form" data-form="employee-add" data-role-kind="staff2">
          <label class="field">
            <span>이름</span>
            <input class="input" name="name" required />
          </label>
          <label class="field">
            <span>로그인 아이디</span>
            <input class="input" name="loginId" required />
          </label>
          <label class="field">
            <span>입사일</span>
            <input class="input" name="hireDate" type="date" value="${adminSelectedDate}" />
          </label>
          <div class="notice full">신규 직원 초기비밀번호는 1111로 설정됩니다. 첫 로그인 때 본인이 새 비밀번호를 설정합니다.</div>
          ${issuedPasswordNotice ? `<div class="notice password-notice full"><span>최근 발급 비밀번호</span><strong>${escapeHtml(issuedPasswordNotice)}</strong></div>` : ""}
          <label class="field">
            <span>구분</span>
            <select class="select" name="roleKind">
              ${roleKindOptions("staff2")}
            </select>
          </label>
          <label class="field">
            <span>급여 방식</span>
            <select class="select" name="salaryType">
              <option value="hourly">시급제</option>
              <option value="fixed">고정급</option>
            </select>
          </label>
          <label class="field">
            <span>평일 시급</span>
            <input class="input" name="weekdayHourlyRate" type="number" min="0" step="100" value="10000" required />
          </label>
          <label class="field">
            <span>주말 시급</span>
            <input class="input" name="weekendHourlyRate" type="number" min="0" step="100" value="12000" required />
          </label>
          <label class="field">
            <span>월 고정급</span>
            <input class="input" name="monthlySalary" type="number" min="0" step="10000" value="0" required />
          </label>
          <label class="field leave-allowance-field">
            <span>연차 수(직원1만)</span>
            <input class="input" name="leaveAllowance" type="number" min="0" step="0.5" value="0" disabled />
          </label>
          <div class="notice full">근무표 반영 정보를 넣으면 선택한 시작일부터 해당 달 말일까지 자동으로 근무표에 배치합니다. 정원이 찬 날짜는 건너뜁니다.</div>
          <label class="field">
            <span>적용 시작일</span>
            <input class="input" name="workStartDate" type="date" value="${adminSelectedDate}" />
          </label>
          <div class="field full">
            <span>근무 요일/시간</span>
            ${workPatternEditor(defaultWorkPatterns([6, 0], 10, 8.5))}
          </div>
          <button class="primary-button full" type="submit">직원 등록</button>
        </form>
        <h3>직원 선택 <small>${escapeHtml(formatMonthLabel(monthCursor))} 기준</small></h3>
        <div class="item-meta employee-picker-note">입사월부터 표시되고, 마지막 근무일이 있는 달까지만 목록에 표시됩니다.</div>
        <div class="employee-picker">
          ${employees.map((employee) => renderEmployeePickerButton(employee, selectedEmployee?.id)).join("")}
        </div>
        ${selectedEmployee ? renderEmployeeRow(selectedEmployee) : `<div class="empty-state">수정할 직원을 선택해주세요.</div>`}
      </div>
    `;
  }

  function getSelectedEmployeeForAdmin(employees) {
    const selected = employees.find((employee) => employee.id === selectedEmployeeId) || employees[0] || null;
    selectedEmployeeId = selected?.id || "";
    return selected;
  }

  function renderEmployeePickerButton(employee, selectedId) {
    return `
      <button class="employee-picker-button ${employee.id === selectedId ? "active" : ""}" type="button" data-action="select-employee" data-id="${employee.id}">
        <strong>${escapeHtml(employee.name)}</strong>
        <small>${escapeHtml(employeeDisplayRole(employee))}</small>
      </button>
    `;
  }

  function renderEmployeeRow(employee) {
    return `
      <article class="employee-card" data-employee-row="${employee.id}" data-role-kind="${getEmployeeRoleKind(employee)}">
        <div class="employee-card-head">
          <div>
            <strong>${escapeHtml(employee.name)}</strong>
            ${renderEmployeeCardSummary(employee)}
          </div>
          <span class="status-pill ${employee.status === "active" ? "status-active" : "status-resigned"}">${employeeStatusText(employee)}</span>
        </div>
        <div class="form-grid wide employee-edit-grid">
          <label class="field">
            <span>이름</span>
            <input class="mini-input" name="name" value="${escapeAttr(employee.name)}" />
          </label>
          <label class="field">
            <span>로그인 아이디</span>
            <input class="mini-input" value="${escapeAttr(employee.loginId)}" disabled />
          </label>
          <label class="field">
            <span>입사일</span>
            <input class="mini-input" name="hireDate" type="date" value="${escapeAttr(employee.hireDate || employee.firstWorkStartDate || employee.workStartDate || "")}" />
          </label>
          <label class="field">
            <span>구분</span>
            <select class="mini-select" name="roleKind">
              ${roleKindOptions(getEmployeeRoleKind(employee))}
            </select>
          </label>
          <label class="field">
            <span>상태</span>
            <select class="mini-select" name="status">
              <option value="active" ${employee.status === "active" ? "selected" : ""}>재직중</option>
              <option value="resigned" ${employee.status === "resigned" ? "selected" : ""}>퇴사</option>
            </select>
          </label>
          <label class="field">
            <span>급여 방식</span>
            <select class="mini-select" name="salaryType">
              <option value="hourly" ${employee.salaryType === "hourly" ? "selected" : ""}>시급제</option>
              <option value="fixed" ${employee.salaryType === "fixed" ? "selected" : ""}>고정급</option>
            </select>
          </label>
          <label class="field">
            <span>평일 시급</span>
            <input class="mini-input" name="weekdayHourlyRate" type="number" min="0" step="100" value="${Number(employee.weekdayHourlyRate)}" />
          </label>
          <label class="field">
            <span>주말 시급</span>
            <input class="mini-input" name="weekendHourlyRate" type="number" min="0" step="100" value="${Number(employee.weekendHourlyRate)}" />
          </label>
          <label class="field">
            <span>월 고정급</span>
            <input class="mini-input" name="monthlySalary" type="number" min="0" step="10000" value="${Number(employee.monthlySalary)}" />
          </label>
          <label class="field leave-allowance-field">
            <span>연차 수(직원1만)</span>
            <input class="mini-input" name="leaveAllowance" type="number" min="0" step="0.5" value="${Number(employee.leaveAllowance)}" ${getEmployeeRoleKind(employee) === "staff1" ? "" : "disabled"} />
          </label>
          <div class="field full">
            <span>요일별 근무 시간</span>
            ${workPatternEditor(employee.workPatterns)}
          </div>
          <label class="field">
            <span>적용 시작일</span>
            <input class="mini-input" name="workStartDate" type="date" value="${escapeAttr(employee.workStartDate || employee.salaryEffectiveDate || adminSelectedDate)}" />
          </label>
          <label class="field">
            <span>마지막 근무일</span>
            <input class="mini-input" name="resignationDate" type="date" value="${escapeAttr(employee.resignationDate || "")}" />
          </label>
        </div>
        ${renderEmployeeLeaveAdmin(employee)}
        <div class="employee-card-actions">
          <button class="secondary-button" type="button" data-action="save-employee" data-id="${employee.id}">설정 저장</button>
          <button class="danger-button" type="button" data-action="reset-password" data-id="${employee.id}">비밀번호 초기화</button>
        </div>
      </article>
    `;
  }

  function renderEmployeeCardSummary(employee) {
    const hireDate = getEmployeeHireDate(employee);
    const firstWorkDate = getEmployeeFirstWorkStartDate(employee);
    const tenureText = firstWorkDate ? formatTenureFrom(firstWorkDate) : "";
    const workSummary = workPatternSummary(employee);
    return `
      <div class="employee-card-meta">
        <span class="employee-meta-chip">ID ${escapeHtml(employee.loginId)}</span>
        <span class="employee-meta-chip">${escapeHtml(employeeDisplayRole(employee))}</span>
        ${employee.mustChangePassword ? `<span class="employee-meta-chip warning">비밀번호 설정 필요</span>` : ""}
      </div>
      <div class="employee-card-info">
        ${hireDate ? `<span>입사 ${escapeHtml(formatDate(hireDate))}</span>` : ""}
        ${firstWorkDate ? `<span>첫 근무 ${escapeHtml(formatDate(firstWorkDate))}</span>` : ""}
        ${tenureText ? `<span>${escapeHtml(tenureText)}</span>` : ""}
      </div>
      <div class="employee-card-info subtle">
        <span>${escapeHtml(employeeRecentStartText(employee))}</span>
      </div>
      ${workSummary ? `<div class="employee-work-summary">${escapeHtml(workSummary)}</div>` : ""}
    `;
  }

  function renderEmployeeLeaveAdmin(employee) {
    if (getEmployeeRoleKind(employee) !== "staff1") return "";
    const periodStart = getLeavePeriodStart(employee);
    const leaveDates = getLeaveDatesInCurrentPeriod(employee);
    const pendingLeaves = getLeaveRequests(employee.id, "pending", periodStart);
    const used = leaveDates.length;
    const pending = pendingLeaves.length;
    const remaining = Math.max(Number(employee.leaveAllowance || 0) - used - pending, 0);
    return `
      <div class="employee-leave-admin">
        <div class="employee-leave-head">
          <div>
            <strong>직원1 연차 직접 관리</strong>
            <span>사용 ${used}개 · 승인대기 ${pending}개 · 잔여 ${remaining}개</span>
          </div>
          <span class="status-pill">기준 ${periodStart ? formatDate(periodStart) : "-"}</span>
        </div>
        <div class="form-grid compact-grid">
          <label class="field leave-allowance-field">
            <span>연차 기준 시작일</span>
            <input class="mini-input" name="leaveCycleStartDate" type="date" value="${escapeAttr(employee.leaveCycleStartDate || employee.workStartDate || employee.hireDate || "")}" />
          </label>
          <label class="field">
            <span>연차 사용 날짜</span>
            <input class="mini-input" data-admin-leave-date="${employee.id}" type="date" value="${getKoreaDateString()}" />
          </label>
          <button class="secondary-button" type="button" data-action="admin-add-leave" data-id="${employee.id}">연차 추가</button>
        </div>
        ${
          leaveDates.length
            ? `<div class="leave-chip-list">${leaveDates
                .map(
                  (date) => `
                    <span class="leave-chip">
                      ${formatDate(date)}
                      <button type="button" data-action="admin-delete-leave" data-id="${employee.id}" data-date="${date}" aria-label="${formatDate(date)} 연차 삭제">×</button>
                    </span>
                  `,
                )
                .join("")}</div>`
            : `<div class="empty-state compact">등록된 연차 사용일이 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderScheduleAdmin() {
    const activePharmacists = getSchedulableEmployees();
    const activeStaffWorkers = getStaffSchedulableEmployees();
    const schedules = getSchedulesByDate(adminSelectedDate);
    const staffSchedules = getStaffSchedulesByDate(adminSelectedDate);
    return `
      <div class="panel">
        <h2>근무표 등록 및 수정</h2>
        <form class="form-grid" data-form="schedule-add" data-schedule-kind="10pm">
          <label class="field">
            <span>날짜</span>
            <input class="input" name="date" type="date" value="${adminSelectedDate}" required />
          </label>
          <label class="field">
            <span>근무 종류</span>
            <select class="select" name="shiftType" required>
              <option value="10pm">10-10 (10시 마감 · 12시간)</option>
              <option value="8pm">10-8 (8시 마감 · 10시간)</option>
              <option value="irregular">비정규 근무(시간 직접 입력)</option>
              <option value="staff">${STAFF_SHIFT_META.label}</option>
            </select>
          </label>
          <label class="field">
            <span>시작 시간</span>
            <select class="select" name="startHour">
              ${timeOptions(10)}
            </select>
          </label>
          <label class="field">
            <span>종료 시간</span>
            <select class="select" name="endHour">
              ${timeOptions(10)}
            </select>
          </label>
          <label class="field schedule-rx-worker">
            <span>근무자</span>
            <select class="select" name="pharmacistId" required>
              ${activePharmacists.map((employee) => `<option value="${employee.id}">${escapeHtml(workerOptionLabel(employee))}</option>`).join("")}
            </select>
          </label>
          <label class="field schedule-staff-worker">
            <span>직원 근무자</span>
            <select class="select" name="staffId">
              ${activeStaffWorkers.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("")}
            </select>
          </label>
          <button class="primary-button" type="submit">근무 추가</button>
          <div class="notice full">10-10, 10-8 외 시간으로 바꾸면 선택한 시작/종료 시간 기준으로 급여 시간이 계산됩니다.</div>
        </form>
        <label class="field" style="margin-top: 14px;">
          <span>수정할 날짜</span>
          <input class="input" name="adminWorkDate" type="date" value="${adminSelectedDate}" />
        </label>
        ${
          schedules.length || staffSchedules.length
            ? `<div class="list">${schedules
                .map(
                  (schedule) => `
                    <div class="list-item">
                      <div class="form-grid">
                        <label class="field">
                          <span>근무 종류</span>
                          <select class="select" data-schedule-shift="${schedule.id}">
                            <option value="10pm" ${schedule.shiftType === "10pm" ? "selected" : ""}>10-10</option>
                            <option value="8pm" ${schedule.shiftType === "8pm" ? "selected" : ""}>10-8</option>
                            <option value="irregular" ${schedule.shiftType === "irregular" ? "selected" : ""}>비정규 근무</option>
                          </select>
                        </label>
                        <label class="field">
                          <span>시작 시간</span>
                          <select class="select" data-schedule-start="${schedule.id}">
                            ${timeOptions(getScheduleTimeRange(schedule).start)}
                          </select>
                        </label>
                        <label class="field">
                          <span>종료 시간</span>
                          <select class="select" data-schedule-end="${schedule.id}">
                            ${timeOptions(getScheduleTimeRange(schedule).end)}
                          </select>
                        </label>
                        <label class="field">
                          <span>근무자 · ${formatHours(getRxScheduleHours(schedule))}시간</span>
                          <select class="select" data-schedule-select="${schedule.id}">
                            ${activePharmacists
                              .map(
                                (employee) =>
                                  `<option value="${employee.id}" ${employee.id === schedule.pharmacistId ? "selected" : ""}>${escapeHtml(workerOptionLabel(employee))}</option>`,
                              )
                              .join("")}
                          </select>
                        </label>
                        <div class="button-row">
                          <button class="secondary-button" type="button" data-action="save-schedule" data-id="${schedule.id}">저장</button>
                          <button class="danger-button" type="button" data-action="delete-schedule" data-id="${schedule.id}">삭제</button>
                        </div>
                      </div>
                    </div>
                  `,
                )
                .join("")}
                ${staffSchedules
                  .map(
                    (schedule) => `
                      <div class="list-item">
                        <div class="form-grid">
                          <label class="field">
                            <span>직원근무 시작</span>
                            <select class="select" data-staff-schedule-start="${schedule.id}">
                              ${timeOptions(getScheduleTimeRange(schedule, "staff").start)}
                            </select>
                          </label>
                          <label class="field">
                            <span>직원근무 종료</span>
                            <select class="select" data-staff-schedule-end="${schedule.id}">
                              ${timeOptions(getScheduleTimeRange(schedule, "staff").end)}
                            </select>
                          </label>
                          <label class="field">
                            <span>직원 근무자 · ${formatHours(getStaffScheduleHours(schedule))}시간</span>
                            <select class="select" data-staff-schedule-select="${schedule.id}">
                              ${activeStaffWorkers
                                .map(
                                  (employee) =>
                                    `<option value="${employee.id}" ${employee.id === schedule.staffId ? "selected" : ""}>${escapeHtml(employee.name)}</option>`,
                                )
                                .join("")}
                            </select>
                          </label>
                          <div class="button-row">
                            <button class="secondary-button" type="button" data-action="save-staff-schedule" data-id="${schedule.id}">저장</button>
                            <button class="danger-button" type="button" data-action="delete-staff-schedule" data-id="${schedule.id}">삭제</button>
                          </div>
                        </div>
                      </div>
                    `,
                  )
                  .join("")}</div>`
            : `<div class="empty-state">선택한 날짜의 근무가 없습니다.</div>`
        }
      </div>
    `;
  }

  function renderHolidayAdmin() {
    const monthHolidays = db.holidays
      .filter((holiday) => holiday.date.startsWith(monthCursor))
      .sort((a, b) => a.date.localeCompare(b.date));
    return `
      <div class="panel">
        <h2>한국 공휴일 관리</h2>
        <form class="form-grid" data-form="holiday-add">
          <label class="field">
            <span>날짜</span>
            <input class="input" name="date" type="date" value="${adminSelectedDate}" required />
          </label>
          <label class="field">
            <span>공휴일명</span>
            <input class="input" name="name" required />
          </label>
          <label class="field">
            <span>데이터 출처</span>
            <select class="select" name="source">
              <option value="manual">관리자 입력</option>
              <option value="api">공공데이터 API</option>
              <option value="import">가져오기</option>
            </select>
          </label>
          <button class="primary-button" type="submit">공휴일 추가</button>
        </form>
        <h3>${monthCursor} 공휴일</h3>
        ${
          monthHolidays.length
            ? `<div class="list">${monthHolidays.map(renderHolidayItem).join("")}</div>`
            : `<div class="empty-state">이 달에 등록된 공휴일이 없습니다. 일요일은 자동으로 빨간색 표시됩니다.</div>`
        }
        <p class="item-meta">공휴일은 별도 데이터로 보관해 임시공휴일, 대체공휴일, 추후 공공데이터 API 연동을 반영할 수 있습니다.</p>
      </div>
    `;
  }

  function renderHolidayItem(holiday) {
    return `
      <div class="list-item" data-holiday-row="${holiday.id}">
        <div class="form-grid">
          <label class="field">
            <span>날짜</span>
            <input class="input" name="date" type="date" value="${holiday.date}" />
          </label>
          <label class="field">
            <span>이름</span>
            <input class="input" name="name" value="${escapeAttr(holiday.name)}" />
          </label>
          <label class="field">
            <span>출처</span>
            <select class="select" name="source">
              ${Object.entries(HOLIDAY_SOURCES)
                .map(([value, label]) => `<option value="${value}" ${holiday.source === value ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select>
          </label>
          <div class="button-row">
            <button class="secondary-button" type="button" data-action="save-holiday" data-id="${holiday.id}">저장</button>
            <button class="danger-button" type="button" data-action="delete-holiday" data-id="${holiday.id}">삭제</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderAuditPanel() {
    const logs = db.auditLogs.slice().sort(sortRecent).slice(0, 8);
    const requests = db.swapRequests.slice().sort(sortRecent).slice(0, 5);
    return `
      <div class="panel">
        <h2>관리 기록</h2>
        <h3>근무 변경 내역</h3>
        ${
          requests.length
            ? `<div class="list">${requests.map((request) => renderRequestCard(request, getCurrentUser(), false, true)).join("")}</div>`
            : `<div class="empty-state">등록된 근무 변경 요청이 없습니다.</div>`
        }
        <h3>최근 변경</h3>
        ${
          logs.length
            ? `<div class="list">${logs
                .map(
                  (log) => `
                    <div class="list-item dim">
                      <div class="item-title">${escapeHtml(log.message)}</div>
                      ${log.detail ? `<div class="audit-detail">${escapeHtml(log.detail).replace(/\n/g, "<br />")}</div>` : ""}
                      <div class="item-meta">${formatDateTime(log.createdAt)}</div>
                    </div>
                  `,
                )
                .join("")}</div>`
            : `<div class="empty-state">최근 변경 기록이 없습니다.</div>`
        }
        <div class="button-row" style="margin-top: 12px;">
          <button class="danger-button" type="button" data-action="reset-demo">데모 데이터 초기화</button>
        </div>
      </div>
    `;
  }

  function handleSubmit(event) {
    const form = event.target.closest("form");
    if (!form || !app.contains(form)) return;
    const formType = form.dataset.form;
    if (!formType) return;
    event.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.workPatterns = readWorkPatternsFromFormData(formData);
    if (formType === "login") return login(data);
    const user = getCurrentUser();
    if (!user) return;
    if (user.viewOnly) return showToast("옵저버는 조회 전용입니다.");
    if (formType === "password-setup") return setupPassword(data, user);
    if (formType === "coverage-request") return createCoverageRequest(data, user);
    if (formType === "swap-request") return createSwapRequest(data, user);
    if (formType === "handoff-request") return createHandoffRequest(data, user);
    if (formType === "overseas-add") return addOverseasSchedule(data, user);
    if (formType === "leave-add") return addLeaveDate(data, user);
    if (user.role !== "admin") return showToast("관리자만 처리할 수 있습니다.");
    if (formType === "employee-add") return addEmployee(data, user);
    if (formType === "schedule-add") return addSchedule(data, user);
    if (formType === "holiday-add") return addHoliday(data, user);
  }

  function handleClick(event) {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton && app.contains(tabButton)) {
      currentTab = tabButton.dataset.tab;
      if (currentTab === "calendar") {
        monthCursor = getKoreaMonthKey();
        adminSelectedDate = getKoreaDateString();
        requestTodayFocus();
      }
      render();
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton || !app.contains(actionButton)) return;
    const action = actionButton.dataset.action;
    const id = actionButton.dataset.id;
    const user = getCurrentUser();
    if (action === "logout") {
      saveSession(null);
      currentTab = "calendar";
      render();
      return;
    }
    if (action === "month-prev") {
      monthCursor = shiftMonth(monthCursor, -1);
      adminSelectedDate = `${monthCursor}-01`;
      if (monthCursor === getKoreaMonthKey()) requestTodayFocus();
      render();
      return;
    }
    if (action === "month-next") {
      monthCursor = shiftMonth(monthCursor, 1);
      adminSelectedDate = `${monthCursor}-01`;
      if (monthCursor === getKoreaMonthKey()) requestTodayFocus();
      render();
      return;
    }
    if (action === "month-today") {
      monthCursor = getKoreaMonthKey();
      adminSelectedDate = getKoreaDateString();
      requestTodayFocus();
      render();
      return;
    }
    if (!user) return;
    if (user.viewOnly) return showToast("옵저버는 조회 전용입니다.");
    if (action === "approve-request") return approveRequest(id, user);
    if (action === "reject-request") return rejectRequest(id, user);
    if (action === "cancel-request") return cancelRequest(id, user);
    if (action === "delete-overseas") return deleteOverseasSchedule(id, user);
    if (action === "delete-leave") return deleteLeaveDate(actionButton.dataset.date, user);
    if (user.role !== "admin") return showToast("관리자만 처리할 수 있습니다.");
    if (action === "select-employee") {
      selectedEmployeeId = id;
      render();
      return;
    }
    if (action === "reset-password") return resetEmployeePassword(id, user);
    if (action === "save-employee") return saveEmployee(id, user);
    if (action === "admin-add-leave") return adminAddEmployeeLeaveDate(id, user);
    if (action === "admin-delete-leave") return adminDeleteEmployeeLeaveDate(id, actionButton.dataset.date, user);
    if (action === "save-schedule") return saveSchedule(id, user);
    if (action === "delete-schedule") return deleteSchedule(id, user);
    if (action === "save-staff-schedule") return saveStaffSchedule(id, user);
    if (action === "delete-staff-schedule") return deleteStaffSchedule(id, user);
    if (action === "save-holiday") return saveHoliday(id, user);
    if (action === "delete-holiday") return deleteHoliday(id, user);
    if (action === "reset-demo") return resetDemo();
  }

  function handleChange(event) {
    if (!app.contains(event.target)) return;
    if (getCurrentUser()?.viewOnly) return; // 옵저버는 조회 전용: 폼 상태 변경도 막는다.
    if (event.target.matches('[name="roleKind"]')) {
      syncRoleKindFields(event.target.closest("[data-role-kind]"));
      return;
    }
    if (event.target.matches('form[data-form="schedule-add"] select[name="shiftType"]')) {
      syncScheduleKindFields(event.target.closest("[data-schedule-kind]"));
      return;
    }
    if (event.target.matches('form[data-form="swap-request"] select[name="targetEmployeeId"]')) {
      selectedSwapTargetEmployeeId = event.target.value;
      render();
      return;
    }
    if (event.target.matches("[data-schedule-shift]")) {
      const id = event.target.dataset.scheduleShift;
      const range = getDefaultTimeRange(event.target.value);
      const start = app.querySelector(`[data-schedule-start="${cssEscape(id)}"]`);
      const end = app.querySelector(`[data-schedule-end="${cssEscape(id)}"]`);
      if (start) start.value = String(range.start);
      if (end) end.value = String(range.end);
      return;
    }
    if (event.target.matches('[name="adminWorkDate"]')) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(event.target.value || "")) return;
      adminSelectedDate = event.target.value;
      monthCursor = event.target.value.slice(0, 7);
      render();
      return;
    }
    if (event.target.matches('form[data-form="schedule-add"] input[name="date"]')) {
      adminSelectedDate = event.target.value;
      monthCursor = event.target.value.slice(0, 7);
      render();
    }
    if (event.target.matches('form[data-form="holiday-add"] input[name="date"]')) {
      adminSelectedDate = event.target.value;
      monthCursor = event.target.value.slice(0, 7);
      render();
    }
  }

  function login(data) {
    applyScheduledResignations();
    const loginId = String(data.loginId || "").trim();
    const password = String(data.password || "");
    let isViewerLogin = false;
    let employee = null;
    if (loginId === VIEWER_LOGIN.loginId && password === VIEWER_LOGIN.password) {
      employee = OBSERVER_USER;
      isViewerLogin = true;
    } else {
      employee = db.employees.find((item) => item.loginId === loginId && item.password === password);
    }
    if (!employee) {
      app.innerHTML = renderLogin("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    if (!isEmployeeAccessActive(employee)) {
      app.innerHTML = renderLogin("퇴사자는 로그인 및 서비스 접근이 불가능합니다.");
      return;
    }
    if (!isViewerLogin && syncAuthAccountFromEmployee(employee)) {
      saveDb();
    }
    saveSession({ userId: employee.id, loginAt: nowIso() });
    currentTab = "calendar";
    monthCursor = getKoreaMonthKey();
    adminSelectedDate = getKoreaDateString();
    requestTodayFocus();
    if (employee.mustChangePassword && !employee.viewOnly) {
      render();
      return;
    }
    showToast(`${employee.name}님, 로그인했습니다.`);
  }

  function setupPassword(data, user) {
    const newPassword = String(data.newPassword || "");
    const confirmPassword = String(data.confirmPassword || "");
    if (newPassword.length < 4) {
      app.innerHTML = renderPasswordSetup(user, "비밀번호는 4자리 이상으로 설정해주세요.");
      return;
    }
    if (newPassword !== confirmPassword) {
      app.innerHTML = renderPasswordSetup(user, "새 비밀번호와 확인값이 다릅니다.");
      return;
    }
    if (user.mustChangePassword && newPassword === user.password) {
      app.innerHTML = renderPasswordSetup(user, "임시 비밀번호는 새 비밀번호로 사용할 수 없습니다.");
      return;
    }
    setEmployeeAuth(user, newPassword, false);
    saveSession({ userId: user.id, loginAt: nowIso() });
    addAudit(user.id, `${user.name}님이 비밀번호를 설정했습니다.`);
    saveDb();
    currentTab = "calendar";
    monthCursor = getKoreaMonthKey();
    adminSelectedDate = getKoreaDateString();
    showToast("비밀번호가 설정되었습니다.");
  }

  function createSwapRequest(data, user) {
    if (["staff1", "staff2"].includes(employeeCategory(user))) {
      return showToast("직원 계정은 휴무 요청만 사용할 수 있습니다.");
    }
    const ownSchedule = getSwapAssignment(data.ownScheduleId);
    const targetSchedule = getSwapAssignment(data.targetScheduleId);
    if (targetSchedule && data.targetEmployeeId && targetSchedule.personId !== data.targetEmployeeId) return showToast("선택한 상대의 근무일을 다시 선택해주세요.");
    if (!ownSchedule || !targetSchedule) return showToast("선택한 근무를 찾을 수 없습니다.");
    if (ownSchedule.personId !== user.id) return showToast("내 근무만 요청할 수 있습니다.");
    if (targetSchedule.personId === user.id) return showToast("상대 근무를 선택해주세요.");
    const target = getEmployee(targetSchedule.personId);
    if (!target || target.status !== "active") return showToast("재직중인 근무자와만 교체할 수 있습니다.");
    if (!canSwapEmployees(user, target)) return showToast("선택한 두 사람은 교체 가능한 조합이 아닙니다.");
    const duplicateMessage = getSwapDuplicateMessage(user.id, target.id, ownSchedule, targetSchedule);
    if (duplicateMessage) return showToast(duplicateMessage);
    if (hasPendingForSchedule(ownSchedule.ref) || hasPendingForSchedule(targetSchedule.ref)) {
      return showToast("이미 승인 대기 중인 근무는 선택할 수 없습니다.");
    }
    const request = {
      id: makeId("swap"),
      requesterId: user.id,
      targetId: target.id,
      requesterScheduleId: ownSchedule.ref,
      targetScheduleId: targetSchedule.ref,
      requesterAssignmentType: ownSchedule.type,
      targetAssignmentType: targetSchedule.type,
      requesterOriginalPharmacistId: ownSchedule.personId,
      targetOriginalPharmacistId: targetSchedule.personId,
      status: "pending",
      createdAt: nowIso(),
      approvedAt: "",
      rejectedAt: "",
      cancelledAt: "",
    };
    db.swapRequests.push(request);
    addAudit(user.id, `${user.name}님이 ${target.name}님에게 근무 변경을 요청했습니다.`);
    saveDb();
    showToast("근무 변경 요청을 보냈습니다.");
  }

  function createHandoffRequest(data, user) {
    if (!canHandoffEmployee(user)) return showToast("근무 넘기기는 관리자와 근무약사만 사용할 수 있습니다.");
    const ownSchedule = getSwapAssignment(data.ownScheduleId);
    if (!ownSchedule || ownSchedule.type !== "rx") return showToast("약사 근무만 넘길 수 있습니다.");
    if (ownSchedule.personId !== user.id) return showToast("내 근무만 넘길 수 있습니다.");
    if (hasPendingForSchedule(ownSchedule.ref)) return showToast("이미 승인 대기 중인 근무는 선택할 수 없습니다.");
    const target = getEmployee(data.targetEmployeeId);
    if (!target || target.id === user.id) return showToast("받을 근무자를 선택해주세요.");
    if (!canHandoffEmployee(target)) return showToast("관리자 또는 근무약사에게만 넘길 수 있습니다.");
    if (!isEmployeeAvailableForScheduleDate(target, ownSchedule.date)) return showToast("해당 날짜에 근무 가능한 사람에게만 넘길 수 있습니다.");
    const duplicateMessage = getHandoffDuplicateMessage(target.id, ownSchedule);
    if (duplicateMessage) return showToast(duplicateMessage);
    const request = {
      id: makeId("swap"),
      type: "handoff",
      requesterId: user.id,
      targetId: target.id,
      requesterScheduleId: ownSchedule.ref,
      targetScheduleId: "",
      requesterAssignmentType: ownSchedule.type,
      targetAssignmentType: "handoff",
      requesterOriginalPharmacistId: ownSchedule.personId,
      targetOriginalPharmacistId: target.id,
      status: "pending",
      createdAt: nowIso(),
      approvedAt: "",
      rejectedAt: "",
      cancelledAt: "",
    };
    db.swapRequests.push(request);
    addAudit(user.id, `${user.name}님이 ${target.name}님에게 근무 넘기기를 요청했습니다.`);
    saveDb();
    showToast("근무 넘기기 요청을 보냈습니다.");
  }

  function addOverseasSchedule(data, user) {
    if (!canManageOverseasSchedule(user)) return showToast("해외일정은 관리자와 근무약사만 등록할 수 있습니다.");
    const startDate = String(data.startDate || "");
    const endDate = String(data.endDate || startDate);
    if (!isDateString(startDate) || !isDateString(endDate)) return showToast("해외일정 시작일과 종료일을 선택해주세요.");
    if (endDate < startDate) return showToast("종료일은 시작일보다 빠를 수 없습니다.");
    db.overseasSchedules = normalizeOverseasSchedules(db.overseasSchedules);
    db.overseasSchedules.push({
      id: makeId("overseas"),
      employeeId: user.id,
      startDate,
      endDate,
      memo: String(data.memo || "").trim(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    addAudit(user.id, `${user.name}님이 ${getOverseasRangeLabel({ startDate, endDate })} 해외일정을 등록했습니다.`);
    saveDb();
    showToast("해외일정을 등록했습니다.");
  }

  function deleteOverseasSchedule(id, user) {
    const schedule = db.overseasSchedules.find((item) => item.id === id);
    if (!schedule) return showToast("해외일정을 찾을 수 없습니다.");
    if (user.role !== "admin" && schedule.employeeId !== user.id) return showToast("본인 해외일정만 삭제할 수 있습니다.");
    const employee = getEmployee(schedule.employeeId);
    db.overseasSchedules = db.overseasSchedules.filter((item) => item.id !== id);
    addAudit(user.id, `${employee?.name || "직원"}님의 ${getOverseasRangeLabel(schedule)} 해외일정을 삭제했습니다.`);
    saveDb();
    showToast("해외일정을 삭제했습니다.");
  }

  function createCoverageRequest(data, user) {
    if (!["staff1", "staff2"].includes(employeeCategory(user))) return showToast("직원 계정에서만 휴무 요청을 보낼 수 있습니다.");
    const ownSchedule = getSwapAssignment(data.ownScheduleId);
    if (!ownSchedule || ownSchedule.type !== "staff") return showToast("직원 근무만 휴무 요청할 수 있습니다.");
    if (ownSchedule.personId !== user.id) return showToast("내 근무만 휴무 요청할 수 있습니다.");
    if (hasPendingForSchedule(ownSchedule.ref)) return showToast("이미 승인 대기 중인 근무는 선택할 수 없습니다.");
    const admin = getPrimaryAdmin();
    if (!admin) return showToast("재직중인 관리자 계정을 찾을 수 없습니다.");
    const request = {
      id: makeId("swap"),
      type: "coverage",
      requesterId: user.id,
      targetId: admin.id,
      requesterScheduleId: ownSchedule.ref,
      targetScheduleId: "",
      requesterAssignmentType: "staff",
      targetAssignmentType: "adminCoverage",
      requesterOriginalPharmacistId: ownSchedule.personId,
      targetOriginalPharmacistId: admin.id,
      status: "pending",
      createdAt: nowIso(),
      approvedAt: "",
      rejectedAt: "",
      cancelledAt: "",
    };
    db.swapRequests.push(request);
    addAudit(user.id, `${user.name}님이 ${admin.name}님에게 휴무 요청을 보냈습니다.`);
    saveDb();
    showToast("관리자에게 휴무 요청을 보냈습니다.");
  }

  function approveRequest(id, user) {
    const request = db.swapRequests.find((item) => item.id === id);
    if (!request || request.status !== "pending") return showToast("처리할 수 없는 요청입니다.");
    if (user.role !== "admin" && request.targetId !== user.id) return showToast("상대방만 승인할 수 있습니다.");
    if (request.type === "leave") return approveLeaveRequest(request, user);
    const requesterSchedule = getSwapAssignment(request.requesterScheduleId);
    const targetSchedule = getSwapAssignment(request.targetScheduleId);
    const needsTargetSchedule = !["coverage", "handoff"].includes(request.type);
    if (!requesterSchedule || (needsTargetSchedule && !targetSchedule)) return showToast("스케줄이 삭제되어 승인할 수 없습니다.");
    if (
      requesterSchedule.personId !== request.requesterId ||
      (needsTargetSchedule && targetSchedule.personId !== request.targetId)
    ) {
      request.status = "rejected";
      request.rejectedAt = nowIso();
      addAudit(user.id, "스케줄이 변경된 근무 변경 요청을 자동 거절했습니다.");
      saveDb();
      return showToast("스케줄이 변경되어 요청을 거절 처리했습니다.");
    }
    if (request.type === "coverage") {
      const before = getSwapAssignment(request.requesterScheduleId);
      setAssignmentPerson(requesterSchedule.ref, request.targetId);
      const after = getSwapAssignment(request.requesterScheduleId);
      request.status = "approved";
      request.approvedAt = nowIso();
      addAudit(user.id, "관리자 대체 근무 요청을 승인했습니다.", describeAssignmentChanges([{ before, after }]));
      saveDb();
      return showToast("관리자가 직원포지션 근무자로 반영되었습니다.");
    }
    if (request.type === "handoff") {
      const requester = getEmployee(request.requesterId);
      const target = getEmployee(request.targetId);
      if (!canHandoffEmployee(requester) || !canHandoffEmployee(target) || !isEmployeeAvailableForScheduleDate(target, requesterSchedule.date)) {
        request.status = "rejected";
        request.rejectedAt = nowIso();
        addAudit(user.id, "근무 넘기기 가능한 조합이 아니어서 요청을 자동 거절했습니다.");
        saveDb();
        return showToast("현재 넘기기 가능한 조합이 아니어서 요청을 거절 처리했습니다.");
      }
      const duplicateMessage = getHandoffDuplicateMessage(request.targetId, requesterSchedule);
      if (duplicateMessage) {
        request.status = "rejected";
        request.rejectedAt = nowIso();
        addAudit(user.id, "넘긴 뒤 같은 날짜 중복 배정이 생기는 요청을 자동 거절했습니다.");
        saveDb();
        return showToast("넘긴 뒤 같은 날짜 중복 배정이 생겨 요청을 거절 처리했습니다.");
      }
      const before = getSwapAssignment(request.requesterScheduleId);
      setAssignmentPerson(requesterSchedule.ref, request.targetId);
      const after = getSwapAssignment(request.requesterScheduleId);
      request.status = "approved";
      request.approvedAt = nowIso();
      addAudit(user.id, "근무 넘기기 요청을 승인했습니다.", describeAssignmentChanges([{ before, after }]));
      saveDb();
      return showToast("근무가 받을 근무자에게 넘어갔습니다.");
    }
    const requester = getEmployee(request.requesterId);
    const target = getEmployee(request.targetId);
    if (!canSwapEmployees(requester, target)) {
      request.status = "rejected";
      request.rejectedAt = nowIso();
      addAudit(user.id, "교체 가능한 조합이 아니어서 요청을 자동 거절했습니다.");
      saveDb();
      return showToast("현재 교체 가능한 조합이 아니어서 요청을 거절 처리했습니다.");
    }
    const duplicateMessage = getSwapDuplicateMessage(request.requesterId, request.targetId, requesterSchedule, targetSchedule);
    if (duplicateMessage) {
      request.status = "rejected";
      request.rejectedAt = nowIso();
      addAudit(user.id, "교체 후 같은 날짜 중복 배정이 생기는 요청을 자동 거절했습니다.");
      saveDb();
      return showToast("교체 후 같은 날짜 중복 배정이 생겨 요청을 거절 처리했습니다.");
    }
    const requesterBefore = getSwapAssignment(request.requesterScheduleId);
    const targetBefore = getSwapAssignment(request.targetScheduleId);
    setAssignmentPerson(requesterSchedule.ref, request.targetId);
    setAssignmentPerson(targetSchedule.ref, request.requesterId);
    const requesterAfter = getSwapAssignment(request.requesterScheduleId);
    const targetAfter = getSwapAssignment(request.targetScheduleId);
    request.status = "approved";
    request.approvedAt = nowIso();
    addAudit(
      user.id,
      "근무 변경 요청을 승인했습니다.",
      describeAssignmentChanges([
        { before: requesterBefore, after: requesterAfter },
        { before: targetBefore, after: targetAfter },
      ]),
    );
    saveDb();
    showToast("근무 변경이 승인되어 스케줄에 반영되었습니다.");
  }

  function rejectRequest(id, user) {
    const request = db.swapRequests.find((item) => item.id === id);
    if (!request || request.status !== "pending") return showToast("처리할 수 없는 요청입니다.");
    if (user.role !== "admin" && request.targetId !== user.id) return showToast("상대방만 거절할 수 있습니다.");
    request.status = "rejected";
    request.rejectedAt = nowIso();
    addAudit(user.id, request.type === "leave" ? "연차 승인 요청을 거절했습니다." : "근무 변경 요청을 거절했습니다.");
    saveDb();
    showToast(request.type === "leave" ? "연차 요청을 거절했습니다." : "근무 변경 요청을 거절했습니다.");
  }

  function cancelRequest(id, user) {
    const request = db.swapRequests.find((item) => item.id === id);
    if (!request || !["pending", "approved"].includes(request.status)) return showToast("취소할 수 없는 요청입니다.");
    const isRequesterPendingCancel = request.status === "pending" && request.requesterId === user.id;
    const isAdminCancel = user.role === "admin";
    if (!isRequesterPendingCancel && !isAdminCancel) return showToast("요청자 본인 또는 관리자만 취소할 수 있습니다.");
    if (request.status === "approved" && !isAdminCancel) return showToast("승인완료된 요청은 관리자만 취소할 수 있습니다.");
    let detail = "";
    if (request.status === "approved") {
      if (request.type === "leave") {
        const requester = getEmployee(request.requesterId);
        if (requester) requester.leaveDates = (requester.leaveDates || []).filter((date) => date !== request.leaveDate);
      } else {
        const isOneWayTransfer = request.type === "coverage" || request.type === "handoff";
        const requesterBefore = getSwapAssignment(request.requesterScheduleId);
        const targetBefore = isOneWayTransfer ? null : getSwapAssignment(request.targetScheduleId);
        setAssignmentPerson(request.requesterScheduleId, request.requesterOriginalPharmacistId);
        if (!isOneWayTransfer) setAssignmentPerson(request.targetScheduleId, request.targetOriginalPharmacistId);
        const requesterAfter = getSwapAssignment(request.requesterScheduleId);
        const targetAfter = isOneWayTransfer ? null : getSwapAssignment(request.targetScheduleId);
        detail = describeAssignmentChanges(
          [
            { before: requesterBefore, after: requesterAfter },
            isOneWayTransfer ? null : { before: targetBefore, after: targetAfter },
          ].filter(Boolean),
        );
      }
    }
    request.status = "cancelled";
    request.cancelledAt = nowIso();
    addAudit(
      user.id,
      isAdminCancel
        ? request.type === "leave"
          ? "관리자가 연차 요청을 취소했습니다."
          : "관리자가 근무 변경 요청을 취소했습니다."
        : `${user.name}님이 본인 요청을 취소했습니다.`,
      detail,
    );
    saveDb();
    showToast("요청을 취소했습니다.");
  }

  function approveLeaveRequest(request, user) {
    const requester = getEmployee(request.requesterId);
    if (!requester || employeeCategory(requester) !== "staff1") {
      request.status = "rejected";
      request.rejectedAt = nowIso();
      saveDb();
      return showToast("연차 요청자를 확인할 수 없어 거절 처리했습니다.");
    }
    requester.leaveDates = Array.isArray(requester.leaveDates) ? requester.leaveDates : [];
    if (!requester.leaveDates.includes(request.leaveDate)) {
      if (getLeaveDatesInCurrentPeriod(requester).length >= Number(requester.leaveAllowance || 0)) {
        request.status = "rejected";
        request.rejectedAt = nowIso();
        saveDb();
        return showToast("제공 연차를 초과해 거절 처리했습니다.");
      }
      requester.leaveDates.push(request.leaveDate);
      requester.leaveDates.sort();
    }
    request.status = "approved";
    request.approvedAt = nowIso();
    addAudit(user.id, `${requester.name}님 ${formatFullDate(request.leaveDate)} 연차 요청을 승인했습니다.`);
    saveDb();
    showToast("연차 요청을 승인했습니다.");
  }

  function addLeaveDate(data, user) {
    if (employeeCategory(user) !== "staff1") return showToast("직원1 계정에서만 연차를 등록할 수 있습니다.");
    const leaveDate = data.leaveDate;
    if (!leaveDate) return showToast("연차 사용 날짜를 선택해주세요.");
    const leavePeriodStart = getLeavePeriodStart(user);
    if (leavePeriodStart && leaveDate < leavePeriodStart) {
      return showToast("현재 연차 기준일 이후 날짜만 요청할 수 있습니다.");
    }
    user.leaveDates = Array.isArray(user.leaveDates) ? user.leaveDates : [];
    if (user.leaveDates.includes(leaveDate)) return showToast("이미 등록된 연차 날짜입니다.");
    if (getLeaveRequests(user.id, "pending", leavePeriodStart).some((request) => request.leaveDate === leaveDate)) {
      return showToast("이미 승인 대기 중인 연차 날짜입니다.");
    }
    if (getLeaveDatesInCurrentPeriod(user).length + getLeaveRequests(user.id, "pending", leavePeriodStart).length >= Number(user.leaveAllowance || 0)) {
      return showToast("제공 연차를 모두 사용했습니다.");
    }
    const admin = getPrimaryAdmin();
    if (!admin) return showToast("재직중인 관리자 계정을 찾을 수 없습니다.");
    db.swapRequests.push({
      id: makeId("leave"),
      type: "leave",
      requesterId: user.id,
      targetId: admin.id,
      requesterScheduleId: "",
      targetScheduleId: "",
      leaveDate,
      status: "pending",
      createdAt: nowIso(),
      approvedAt: "",
      rejectedAt: "",
      cancelledAt: "",
    });
    addAudit(user.id, `${user.name}님이 ${formatFullDate(leaveDate)} 연차 승인을 요청했습니다.`);
    saveDb();
    showToast("연차 승인 요청을 보냈습니다.");
  }

  function deleteLeaveDate(leaveDate, user) {
    if (employeeCategory(user) !== "staff1") return showToast("직원1 계정에서만 연차를 삭제할 수 있습니다.");
    user.leaveDates = (user.leaveDates || []).filter((date) => date !== leaveDate);
    addAudit(user.id, `${user.name}님이 ${formatFullDate(leaveDate)} 연차를 삭제했습니다.`);
    saveDb();
    showToast("연차 사용일을 삭제했습니다.");
  }

  function adminAddEmployeeLeaveDate(id, user) {
    const employee = getEmployee(id);
    const input = app.querySelector(`[data-admin-leave-date="${cssEscape(id)}"]`);
    const leaveDate = input?.value || "";
    if (!employee || getEmployeeRoleKind(employee) !== "staff1") return showToast("직원1만 연차를 직접 관리할 수 있습니다.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) return showToast("연차 사용 날짜를 선택해주세요.");
    const leavePeriodStart = getLeavePeriodStart(employee);
    if (leavePeriodStart && leaveDate < leavePeriodStart) {
      return showToast("현재 연차 기준일 이후 날짜만 추가할 수 있습니다.");
    }
    employee.leaveDates = Array.isArray(employee.leaveDates) ? employee.leaveDates : [];
    if (employee.leaveDates.includes(leaveDate)) return showToast("이미 등록된 연차 날짜입니다.");
    employee.leaveDates.push(leaveDate);
    employee.leaveDates.sort();
    addAudit(user.id, `${employee.name}님 ${formatFullDate(leaveDate)} 연차를 관리자가 직접 추가했습니다.`);
    saveDb();
    showToast("연차 사용일을 추가했습니다.");
  }

  function adminDeleteEmployeeLeaveDate(id, leaveDate, user) {
    const employee = getEmployee(id);
    if (!employee || getEmployeeRoleKind(employee) !== "staff1") return showToast("직원1만 연차를 직접 관리할 수 있습니다.");
    employee.leaveDates = (employee.leaveDates || []).filter((date) => date !== leaveDate);
    addAudit(user.id, `${employee.name}님 ${formatFullDate(leaveDate)} 연차를 관리자가 직접 삭제했습니다.`);
    saveDb();
    showToast("연차 사용일을 삭제했습니다.");
  }

  function addEmployee(data, user) {
    const loginId = String(data.loginId || "").trim();
    if (db.employees.some((employee) => employee.loginId === loginId)) {
      return showToast("이미 사용 중인 로그인 아이디입니다.");
    }
    const roleKind = normalizeRoleKind(data.roleKind, "pharmacist");
    const roleInfo = roleKindToRoleInfo(roleKind);
    const temporaryPassword = LEGACY_INITIAL_PASSWORD;
    const employee = {
      id: makeId("emp"),
      name: String(data.name || "").trim(),
      loginId,
      password: temporaryPassword,
      role: roleInfo.role,
      staffType: roleInfo.staffType,
      status: "active",
      mustChangePassword: true,
      salaryType: data.salaryType === "fixed" ? "fixed" : "hourly",
      weekdayHourlyRate: Number(data.weekdayHourlyRate || 0),
      weekendHourlyRate: Number(data.weekendHourlyRate || 0),
      monthlySalary: Number(data.monthlySalary || 0),
      salaryEffectiveDate: data.workStartDate || adminSelectedDate,
      salaryChanges: [],
      resignationDate: "",
      leaveAllowance: roleKind === "staff1" ? Number(data.leaveAllowance || 0) : 0,
      leaveDates: [],
      leaveCycleStartDate: roleKind === "staff1" ? data.workStartDate || data.hireDate || adminSelectedDate : "",
      hireDate: data.hireDate || data.workStartDate || adminSelectedDate,
      firstWorkStartDate: data.workStartDate || data.hireDate || adminSelectedDate,
      lastModifiedStartDate: data.workStartDate || adminSelectedDate,
      workStartDate: data.workStartDate || "",
      workPatterns: normalizeWorkPatterns(data.workPatterns),
    };
    employee.salaryChanges = normalizeSalaryChanges(employee);
    employee.workWeekdays = employee.workPatterns.map((pattern) => pattern.weekday);
    employee.workStartHour = employee.workPatterns[0]?.startHour ?? 10;
    employee.workEndHour = employee.workPatterns[0]?.endHour ?? (roleInfo.role === "staff" ? 8.5 : 8);
    db.employees.push(employee);
    setEmployeeAuth(employee, temporaryPassword, true);
    if (employee.workStartDate) ensureBaseMonthTemplates(employee.workStartDate.slice(0, 7), db);
    const result = applyEmployeeWorkPattern(employee, employee.workStartDate, employee.workPatterns);
    if (result.attempted && employee.workStartDate) {
      monthCursor = employee.workStartDate.slice(0, 7);
      adminSelectedDate = employee.workStartDate;
    }
    employee.firstWorkStartDate = minDate(employee.firstWorkStartDate, findFirstEmployeeWorkDate(employee.id), employee.workStartDate);
    selectedEmployeeId = employee.id;
    issuedPasswordNotice = `${employee.name} / ${temporaryPassword}`;
    addAudit(
      user.id,
      `${employee.name} 직원을 등록했습니다.`,
      result.attempted
        ? `근무표 자동 반영: ${formatDate(result.startDate)}부터 ${result.added}건 배치${result.skipped ? `, ${result.skipped}건 건너뜀` : ""}`
        : "",
    );
    saveDb();
    showToast(
      result.attempted
        ? `${employee.name}님 임시 비밀번호는 ${temporaryPassword}입니다. 근무 ${result.added}건을 배치했습니다.`
        : `${employee.name}님 임시 비밀번호는 ${temporaryPassword}입니다.`,
    );
  }

  function saveEmployee(id, user) {
    const row = app.querySelector(`[data-employee-row="${cssEscape(id)}"]`);
    const employee = getEmployee(id);
    if (!row || !employee) return showToast("직원을 찾을 수 없습니다.");
    const previousStatus = employee.status;
    const previousResignationDate = employee.resignationDate || "";
    ensureSalaryBaseline(employee);
    const roleKind = normalizeRoleKind(getRowValue(row, "roleKind"), getEmployeeRoleKind(employee));
    const roleInfo = roleKindToRoleInfo(roleKind);
    const requestedStatus = getRowValue(row, "status");
    const resignationDate = getRowValue(row, "resignationDate");
    employee.name = getRowValue(row, "name").trim();
    employee.hireDate = getRowValue(row, "hireDate") || employee.hireDate || employee.firstWorkStartDate || "";
    employee.role = roleInfo.role;
    employee.staffType = roleInfo.staffType;
    employee.salaryType = getRowValue(row, "salaryType") || "hourly";
    employee.weekdayHourlyRate = Number(getRowValue(row, "weekdayHourlyRate") || 0);
    employee.weekendHourlyRate = Number(getRowValue(row, "weekendHourlyRate") || 0);
    employee.monthlySalary = Number(getRowValue(row, "monthlySalary") || 0);
    const effectiveStartDate = getRowValue(row, "workStartDate") || adminSelectedDate;
    employee.salaryEffectiveDate = effectiveStartDate;
    upsertSalaryChange(employee, employee.salaryEffectiveDate);
    employee.resignationDate = resignationDate;
    employee.status = getEmployeeStatusAfterResignationSave(requestedStatus, resignationDate);
    employee.leaveAllowance = roleKind === "staff1" ? Number(getRowValue(row, "leaveAllowance") || 0) : 0;
    employee.leaveCycleStartDate =
      roleKind === "staff1" ? getRowValue(row, "leaveCycleStartDate") || employee.leaveCycleStartDate || effectiveStartDate : "";
    employee.workStartDate = effectiveStartDate;
    employee.lastModifiedStartDate = effectiveStartDate;
    employee.workPatterns = readWorkPatternsFromContainer(row);
    employee.workWeekdays = employee.workPatterns.map((pattern) => pattern.weekday);
    employee.workStartHour = employee.workPatterns[0]?.startHour ?? 10;
    employee.workEndHour = employee.workPatterns[0]?.endHour ?? (employee.role === "staff" ? 8.5 : 8);
    const patternResult =
      isEmployeeAccessActive(employee) ? applyEmployeePatternChange(employee) : { attempted: false, added: 0, skipped: 0, startDate: employee.workStartDate };
    const resignationResult = applyEmployeeResignation(employee);
    employee.firstWorkStartDate = minDate(employee.firstWorkStartDate, findFirstEmployeeWorkDate(employee.id), effectiveStartDate) || effectiveStartDate;
    employee.hireDate = employee.hireDate || employee.firstWorkStartDate;
    addAudit(
      user.id,
      `${employee.name} 직원 정보를 저장했습니다.`,
      [
        `적용 시작일: ${formatFullDate(effectiveStartDate)}`,
        patternResult.attempted
          ? `변경 스케줄 반영: ${formatDate(patternResult.startDate)}부터 ${patternResult.added}건 배치${patternResult.skipped ? `, ${patternResult.skipped}건 건너뜀` : ""}`
          : "",
        resignationResult.removed
          ? `퇴사일 이후 근무 제거: ${formatDate(resignationResult.resignationDate)} 이후 ${resignationResult.removed}건`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    if (previousResignationDate !== employee.resignationDate && employee.resignationDate) {
      addAudit(user.id, `${employee.name} 직원의 마지막 근무일을 ${formatFullDate(employee.resignationDate)}로 저장했습니다.`);
    }
    if (previousStatus === "active" && employee.status === "resigned") {
      addAudit(user.id, `${employee.name} 직원이 퇴사 상태로 변경되었습니다. 과거 기록은 보존됩니다.`);
    }
    saveDb();
    showToast("직원 정보를 저장했습니다.");
  }

  function resetEmployeePassword(id, user) {
    const employee = getEmployee(id);
    if (!employee) return showToast("직원을 찾을 수 없습니다.");
    const temporaryPassword = ASSIGNED_INITIAL_PASSWORDS[employee.id] || LEGACY_INITIAL_PASSWORD;
    setEmployeeAuth(employee, temporaryPassword, true);
    issuedPasswordNotice = `${employee.name} / ${temporaryPassword}`;
    addAudit(user.id, `${employee.name}님 계정의 초기 비밀번호를 재설정했습니다.`);
    saveDb();
    showToast(`${employee.name}님 초기 비밀번호는 ${temporaryPassword}입니다.`);
  }

  function addSchedule(data, user) {
    if (data.shiftType === "staff") return addStaffSchedule(data, user);
    const target = getEmployee(data.pharmacistId);
    if (!target || !isEmployeeAccessActive(target) || !isEmployeeEmployedOnDate(target, data.date)) {
      return showToast("선택한 날짜에 재직중인 직원만 배정할 수 있습니다.");
    }
    if (isEmployeeOnLeave(target.id, data.date)) return showToast("연차 사용일에는 근무를 배정할 수 없습니다.");
    const sameDateSchedules = db.schedules.filter((schedule) => schedule.date === data.date);
    if (sameDateSchedules.some((schedule) => schedule.pharmacistId === data.pharmacistId)) {
      return showToast("같은 날짜에 같은 직원을 중복 배정할 수 없습니다.");
    }
    const sameShiftCount = sameDateSchedules.filter((schedule) => schedule.shiftType === data.shiftType).length;
    if (data.shiftType === "10pm" && sameShiftCount >= 2) {
      return showToast("10-10은 하루 최대 2명까지 배정합니다.");
    }
    if (data.shiftType === "8pm" && sameShiftCount >= 3) {
      return showToast("10-8은 하루 최대 3명까지 배정합니다.");
    }
    db.schedules.push({
      id: makeId("sch"),
      date: data.date,
      shiftType: data.shiftType,
      pharmacistId: data.pharmacistId,
      startHour: parseHourValue(data.startHour, getDefaultTimeRange(data.shiftType).start),
      endHour: parseHourValue(data.endHour, getDefaultTimeRange(data.shiftType).end),
    });
    adminSelectedDate = data.date;
    monthCursor = data.date.slice(0, 7);
    addAudit(user.id, `${formatDate(data.date)} ${SHIFT_META[data.shiftType].label} 근무를 추가했습니다.`);
    saveDb();
    showToast("근무를 추가했습니다.");
  }

  function addStaffSchedule(data, user) {
    const target = getEmployee(data.staffId);
    if (!target || !isEmployeeAccessActive(target) || !isEmployeeEmployedOnDate(target, data.date)) {
      return showToast("선택한 날짜에 재직중인 직원만 배정할 수 있습니다.");
    }
    if (!canWorkStaffPosition(target)) return showToast("직원근무는 관리자 또는 직원에게만 배정할 수 있습니다.");
    if (isEmployeeOnLeave(target.id, data.date)) return showToast("연차 사용일에는 근무를 배정할 수 없습니다.");
    const sameDateSchedules = db.staffSchedules.filter((schedule) => schedule.date === data.date);
    if (sameDateSchedules.some((schedule) => schedule.staffId === data.staffId)) {
      return showToast("같은 날짜에 같은 직원을 중복 배정할 수 없습니다.");
    }
    if (sameDateSchedules.length >= 2) {
      return showToast("직원근무는 하루 최대 2명까지 배정합니다.");
    }
    db.staffSchedules.push({
      id: makeId("staff"),
      date: data.date,
      staffId: data.staffId,
      startHour: parseHourValue(data.startHour, getDefaultTimeRange("staff").start),
      endHour: parseHourValue(data.endHour, getDefaultTimeRange("staff").end),
      hours: getHoursFromRange(
        parseHourValue(data.startHour, getDefaultTimeRange("staff").start),
        parseHourValue(data.endHour, getDefaultTimeRange("staff").end),
      ),
    });
    adminSelectedDate = data.date;
    monthCursor = data.date.slice(0, 7);
    addAudit(user.id, `${formatDate(data.date)} ${STAFF_SHIFT_META.label} 근무를 추가했습니다.`);
    saveDb();
    showToast("직원근무를 추가했습니다.");
  }

  function saveSchedule(id, user) {
    const schedule = getSchedule(id);
    const select = app.querySelector(`[data-schedule-select="${cssEscape(id)}"]`);
    const shiftSelect = app.querySelector(`[data-schedule-shift="${cssEscape(id)}"]`);
    const startSelect = app.querySelector(`[data-schedule-start="${cssEscape(id)}"]`);
    const endSelect = app.querySelector(`[data-schedule-end="${cssEscape(id)}"]`);
    if (!schedule || !select) return showToast("근무를 찾을 수 없습니다.");
    const target = getEmployee(select.value);
    if (!target || !isEmployeeAccessActive(target) || !isEmployeeEmployedOnDate(target, schedule.date)) {
      return showToast("선택한 날짜에 재직중인 직원만 배정할 수 있습니다.");
    }
    if (isEmployeeOnLeave(target.id, schedule.date)) return showToast("연차 사용일에는 근무를 배정할 수 없습니다.");
    const nextShiftType = shiftSelect?.value || schedule.shiftType;
    const duplicate = db.schedules.some(
      (item) => item.id !== id && item.date === schedule.date && item.pharmacistId === select.value,
    );
    if (duplicate) return showToast("같은 날짜에 같은 직원을 중복 배정할 수 없습니다.");
    const sameShiftCount = db.schedules.filter((item) => item.id !== id && item.date === schedule.date && item.shiftType === nextShiftType).length;
    if (nextShiftType === "10pm" && sameShiftCount >= 2) return showToast("10-10은 하루 최대 2명까지 배정합니다.");
    if (nextShiftType === "8pm" && sameShiftCount >= 3) return showToast("10-8은 하루 최대 3명까지 배정합니다.");
    const before = snapshotRxSchedule(schedule);
    const defaults = getDefaultTimeRange(nextShiftType);
    schedule.shiftType = nextShiftType;
    schedule.pharmacistId = select.value;
    schedule.startHour = parseHourValue(startSelect?.value, defaults.start);
    schedule.endHour = parseHourValue(endSelect?.value, defaults.end);
    const after = snapshotRxSchedule(schedule);
    if (isScheduleSnapshotChanged(before, after)) markManualScheduleChange(schedule, "rx", before, user.id);
    addAudit(
      user.id,
      `${formatDate(schedule.date)} 근무를 수정했습니다.`,
      describeScheduleChange(before, after, "rx"),
    );
    saveDb();
    showToast("근무자를 저장했습니다.");
  }

  function deleteSchedule(id, user) {
    const schedule = getSchedule(id);
    if (!schedule) return showToast("근무를 찾을 수 없습니다.");
    db.schedules = db.schedules.filter((item) => item.id !== id);
    rememberDeletedSeed("schedules", id);
    addAudit(user.id, `${formatDate(schedule.date)} ${SHIFT_META[schedule.shiftType].label} 근무를 삭제했습니다.`);
    saveDb();
    showToast("근무를 삭제했습니다.");
  }

  function saveStaffSchedule(id, user) {
    const schedule = getStaffSchedule(id);
    const select = app.querySelector(`[data-staff-schedule-select="${cssEscape(id)}"]`);
    const startSelect = app.querySelector(`[data-staff-schedule-start="${cssEscape(id)}"]`);
    const endSelect = app.querySelector(`[data-staff-schedule-end="${cssEscape(id)}"]`);
    if (!schedule || !select) return showToast("직원근무를 찾을 수 없습니다.");
    const target = getEmployee(select.value);
    if (!target || !isEmployeeAccessActive(target) || !isEmployeeEmployedOnDate(target, schedule.date)) {
      return showToast("선택한 날짜에 재직중인 직원만 배정할 수 있습니다.");
    }
    if (!canWorkStaffPosition(target)) return showToast("직원근무는 관리자 또는 직원에게만 배정할 수 있습니다.");
    if (isEmployeeOnLeave(target.id, schedule.date)) return showToast("연차 사용일에는 근무를 배정할 수 없습니다.");
    const duplicate = db.staffSchedules.some(
      (item) => item.id !== id && item.date === schedule.date && item.staffId === select.value,
    );
    if (duplicate) return showToast("같은 날짜에 같은 직원을 중복 배정할 수 없습니다.");
    const before = snapshotStaffSchedule(schedule);
    schedule.staffId = select.value;
    schedule.startHour = parseHourValue(startSelect?.value, getDefaultTimeRange("staff").start);
    schedule.endHour = parseHourValue(endSelect?.value, getDefaultTimeRange("staff").end);
    schedule.hours = getStaffScheduleHours(schedule);
    const after = snapshotStaffSchedule(schedule);
    if (isScheduleSnapshotChanged(before, after)) markManualScheduleChange(schedule, "staff", before, user.id);
    addAudit(
      user.id,
      `${formatDate(schedule.date)} 직원 근무를 수정했습니다.`,
      describeScheduleChange(before, after, "staff"),
    );
    saveDb();
    showToast("직원근무자를 저장했습니다.");
  }

  function deleteStaffSchedule(id, user) {
    const schedule = getStaffSchedule(id);
    if (!schedule) return showToast("직원근무를 찾을 수 없습니다.");
    db.staffSchedules = db.staffSchedules.filter((item) => item.id !== id);
    rememberDeletedSeed("staffSchedules", id);
    addAudit(user.id, `${formatDate(schedule.date)} ${STAFF_SHIFT_META.label} 근무를 삭제했습니다.`);
    saveDb();
    showToast("직원근무를 삭제했습니다.");
  }

  function rememberDeletedSeed(collectionName, id) {
    const key = collectionName === "staffSchedules" ? "deletedStaffScheduleSeedIds" : "deletedScheduleSeedIds";
    db[key] = uniqueStrings([...(db[key] || []), id]);
  }

  function addHoliday(data, user) {
    const existing = db.holidays.find((holiday) => holiday.date === data.date && holiday.name === data.name);
    if (existing) return showToast("이미 등록된 공휴일입니다.");
    db.holidays.push({
      id: makeId("holiday"),
      date: data.date,
      name: String(data.name || "").trim(),
      source: data.source || "manual",
      externalId: "",
      updatedAt: nowIso(),
    });
    adminSelectedDate = data.date;
    monthCursor = data.date.slice(0, 7);
    addAudit(user.id, `${formatDate(data.date)} 공휴일을 추가했습니다.`);
    saveDb();
    showToast("공휴일을 추가했습니다.");
  }

  function saveHoliday(id, user) {
    const row = app.querySelector(`[data-holiday-row="${cssEscape(id)}"]`);
    const holiday = db.holidays.find((item) => item.id === id);
    if (!row || !holiday) return showToast("공휴일을 찾을 수 없습니다.");
    holiday.date = getRowValue(row, "date");
    holiday.name = getRowValue(row, "name").trim();
    holiday.source = getRowValue(row, "source");
    holiday.updatedAt = nowIso();
    monthCursor = holiday.date.slice(0, 7);
    adminSelectedDate = holiday.date;
    addAudit(user.id, `${formatDate(holiday.date)} 공휴일 정보를 저장했습니다.`);
    saveDb();
    showToast("공휴일 정보를 저장했습니다.");
  }

  function deleteHoliday(id, user) {
    const holiday = db.holidays.find((item) => item.id === id);
    if (!holiday) return showToast("공휴일을 찾을 수 없습니다.");
    db.holidays = db.holidays.filter((item) => item.id !== id);
    addAudit(user.id, `${formatDate(holiday.date)} 공휴일을 삭제했습니다.`);
    saveDb();
    showToast("공휴일을 삭제했습니다.");
  }

  function resetDemo() {
    db = createInitialData();
    saveDb();
    monthCursor = getKoreaMonthKey();
    adminSelectedDate = getKoreaDateString();
    showToast("데모 데이터를 초기화했습니다.");
  }

  function addAudit(actorId, message, detail = "") {
    db.auditLogs.push({
      id: makeId("log"),
      actorId,
      message,
      detail,
      createdAt: nowIso(),
    });
  }

  function getCurrentUser() {
    if (!session?.userId) return null;
    if (session.userId === OBSERVER_USER.id) return OBSERVER_USER;
    return getEmployee(session.userId) || null;
  }

  function getEmployee(id) {
    return db.employees.find((employee) => employee.id === id);
  }

  function findFirstEmployeeWorkDate(employeeId, targetDb = db) {
    if (!employeeId || !targetDb) return "";
    const dates = [];
    (targetDb.schedules || []).forEach((schedule) => {
      if (schedule.pharmacistId === employeeId && schedule.date) dates.push(schedule.date);
    });
    (targetDb.staffSchedules || []).forEach((schedule) => {
      if (schedule.staffId === employeeId && schedule.date) dates.push(schedule.date);
    });
    return dates.sort()[0] || "";
  }

  function getEmployeeStatusAfterResignationSave(requestedStatus, resignationDate) {
    if (resignationDate) {
      return getKoreaDateString() > resignationDate ? "resigned" : "active";
    }
    return requestedStatus === "resigned" ? "resigned" : "active";
  }

  function isEmployeeAccessActive(employee) {
    return Boolean(employee) && employee.status === "active" && (!employee.resignationDate || getKoreaDateString() <= employee.resignationDate);
  }

  function isEmployeeEmployedOnDate(employee, date) {
    if (!employee || !date) return false;
    if (employee.resignationDate) return date <= employee.resignationDate;
    if (employee.status === "resigned") return date <= getKoreaDateString();
    return true;
  }

  function isEmployeeOnLeave(employeeId, date) {
    const employee = getEmployee(employeeId);
    return Boolean(employee && date && Array.isArray(employee.leaveDates) && employee.leaveDates.includes(date));
  }

  function isEmployeeAvailableForScheduleDate(employee, date) {
    return isEmployeeEmployedOnDate(employee, date) && !isEmployeeOnLeave(employee?.id, date);
  }

  function getEmployeeScheduleCutoff(employee) {
    if (!employee) return "";
    if (employee.resignationDate) return employee.resignationDate;
    return employee.status === "resigned" ? getKoreaDateString() : "";
  }

  function removeEmployeeSchedulesAfterDate(targetDb, employeeId, cutoffDate) {
    if (!cutoffDate) return 0;
    const beforeRx = targetDb.schedules.length;
    const beforeStaff = targetDb.staffSchedules.length;
    targetDb.schedules = targetDb.schedules.filter((schedule) => schedule.pharmacistId !== employeeId || schedule.date <= cutoffDate);
    targetDb.staffSchedules = targetDb.staffSchedules.filter((schedule) => schedule.staffId !== employeeId || schedule.date <= cutoffDate);
    return beforeRx - targetDb.schedules.length + beforeStaff - targetDb.staffSchedules.length;
  }

  function removeSchedulesAfterResignations(targetDb = db) {
    return targetDb.employees.reduce((removed, employee) => {
      return removed + removeEmployeeSchedulesAfterDate(targetDb, employee.id, getEmployeeScheduleCutoff(employee));
    }, 0);
  }

  function applyEmployeeResignation(employee) {
    const resignationDate = getEmployeeScheduleCutoff(employee);
    const removed = removeEmployeeSchedulesAfterDate(db, employee.id, resignationDate);
    return { resignationDate, removed };
  }

  function applyScheduledResignations(targetDb = db, shouldSave = true) {
    const today = getKoreaDateString();
    let changed = false;
    targetDb.employees.forEach((employee) => {
      if (employee.status === "active" && employee.resignationDate && today > employee.resignationDate) {
        employee.status = "resigned";
        const removed = removeEmployeeSchedulesAfterDate(targetDb, employee.id, employee.resignationDate);
        if (shouldSave) {
          targetDb.auditLogs.push({
            id: makeId("log"),
            actorId: "system",
            message: `${employee.name} 직원이 마지막 근무일 이후 퇴사 상태로 자동 변경되었습니다.`,
            detail: removed ? `${formatDate(employee.resignationDate)} 이후 근무 ${removed}건을 제외했습니다.` : "",
            createdAt: nowIso(),
          });
        }
        changed = true;
      }
    });
    const removed = removeSchedulesAfterResignations(targetDb);
    if (removed) changed = true;
    if (changed && shouldSave) saveDb(targetDb);
    return changed;
  }

  function getPrimaryAdmin() {
    return db.employees.find((employee) => employee.role === "admin" && isEmployeeAccessActive(employee)) || null;
  }

  function getSchedulableEmployees(date = adminSelectedDate) {
    return db.employees.filter((employee) => isEmployeeAccessActive(employee) && isEmployeeAvailableForScheduleDate(employee, date));
  }

  function getStaffSchedulableEmployees(date = adminSelectedDate) {
    return db.employees.filter((employee) => canWorkStaffPosition(employee) && isEmployeeAccessActive(employee) && isEmployeeAvailableForScheduleDate(employee, date));
  }

  function canWorkStaffPosition(employee) {
    return Boolean(employee) && (employee.role === "admin" || employee.role === "staff");
  }

  function getSchedule(id) {
    return db.schedules.find((schedule) => schedule.id === id);
  }

  function getStaffSchedule(id) {
    return db.staffSchedules.find((schedule) => schedule.id === id);
  }

  function monthDateOptions(selectedDate) {
    const [year, month] = monthCursor.split("-").map(Number);
    const days = getDaysInMonth(year, month);
    return Array.from({ length: days }, (_, index) => {
      const date = toDateString(year, month, index + 1);
      return `<option value="${date}" ${date === selectedDate ? "selected" : ""}>${formatDate(date)} 근무</option>`;
    }).join("");
  }

  function timeOptions(selectedValue) {
    const selected = normalizeHourValue(selectedValue);
    const values = [];
    for (let hour = 0; hour <= 12; hour += 0.5) values.push(hour);
    return values
      .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${formatHourValue(value)}</option>`)
      .join("");
  }

  function defaultWorkPatterns(weekdays, startHour, endHour) {
    return normalizeWorkWeekdays(weekdays).map((weekday) => ({ weekday, startHour, endHour }));
  }

  function getDefaultEmployeeWorkPatternPreset(employeeId) {
    const startDate = "2026-08-01";
    const presets = {
      "emp-juna": defaultWorkPatterns([4, 5, 6], 10, 10),
      "emp-juyeon": defaultWorkPatterns([1, 2, 6], 10, 10).concat(defaultWorkPatterns([5], 10, 8)),
      "emp-jaehee": defaultWorkPatterns([3, 5], 10, 10).concat(defaultWorkPatterns([2, 6], 10, 8)),
      "emp-minji": defaultWorkPatterns([1, 4, 0], 10, 10),
      "emp-yeongju": defaultWorkPatterns([1, 3, 4], 10, 8).concat(defaultWorkPatterns([0], 10, 10)),
      "emp-hyeonju": defaultWorkPatterns([2, 3], 10, 10).concat(defaultWorkPatterns([0], 10, 8)),
      "emp-subin": defaultWorkPatterns([1, 2, 3, 4, 5], 10, 8.5),
      "emp-yuri": defaultWorkPatterns([0], 10, 8.5),
      "emp-hyojin": defaultWorkPatterns([6, 0], 10, 8.5),
      "emp-sohyun": defaultWorkPatterns([4, 5, 6], 10, 8.5),
    };
    return presets[employeeId] ? { startDate, patterns: presets[employeeId] } : null;
  }

  function workPatternEditor(patterns = []) {
    const patternMap = new Map(normalizeWorkPatterns(patterns).map((pattern) => [pattern.weekday, pattern]));
    const labels = ["일", "월", "화", "수", "목", "금", "토"];
    return `
      <div class="work-pattern-editor">
        ${labels
          .map(
            (label, weekday) => {
              const pattern = patternMap.get(weekday) || { weekday, startHour: 10, endHour: 8.5 };
              return `
                <div class="work-pattern-row" data-work-pattern-row="${weekday}">
                  <label class="weekday-check">
                    <input type="checkbox" name="workDay-${weekday}" value="1" ${patternMap.has(weekday) ? "checked" : ""} />
                    <span>${label}</span>
                  </label>
                  <select class="mini-select" name="workStartHour-${weekday}" aria-label="${label} 시작 시간">
                    ${timeOptions(pattern.startHour)}
                  </select>
                  <select class="mini-select" name="workEndHour-${weekday}" aria-label="${label} 종료 시간">
                    ${timeOptions(pattern.endHour)}
                  </select>
                </div>
              `;
            },
          )
          .join("")}
      </div>
    `;
  }

  function readWorkPatternsFromFormData(formData) {
    return Array.from({ length: 7 }, (_, weekday) => {
      if (!formData.has(`workDay-${weekday}`)) return null;
      return {
        weekday,
        startHour: parseHourValue(formData.get(`workStartHour-${weekday}`), 10),
        endHour: parseHourValue(formData.get(`workEndHour-${weekday}`), 8.5),
      };
    }).filter(Boolean);
  }

  function readWorkPatternsFromContainer(container) {
    return Array.from(container.querySelectorAll("[data-work-pattern-row]"))
      .map((row) => {
        const weekday = Number(row.dataset.workPatternRow);
        const checked = row.querySelector(`input[name="workDay-${weekday}"]`)?.checked;
        if (!checked) return null;
        return {
          weekday,
          startHour: parseHourValue(row.querySelector(`[name="workStartHour-${weekday}"]`)?.value, 10),
          endHour: parseHourValue(row.querySelector(`[name="workEndHour-${weekday}"]`)?.value, 8.5),
        };
      })
      .filter(Boolean);
  }

  function normalizeWorkPatterns(value) {
    const rawPatterns = Array.isArray(value)
      ? value
      : Array.isArray(value?.workPatterns)
        ? value.workPatterns
        : normalizeWorkWeekdays(value?.workWeekdays).map((weekday) => ({
            weekday,
            startHour: value?.workStartHour,
            endHour: value?.workEndHour,
          }));
    const byDay = new Map();
    rawPatterns.forEach((pattern) => {
      const weekday = Number(pattern.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
      byDay.set(weekday, {
        weekday,
        startHour: parseHourValue(pattern.startHour, 10),
        endHour: parseHourValue(pattern.endHour, value?.role === "staff" ? 8.5 : 8),
      });
    });
    return Array.from(byDay.values()).sort((a, b) => a.weekday - b.weekday);
  }

  function normalizeWorkWeekdays(values) {
    const list = Array.isArray(values) ? values : values ? [values] : [];
    return Array.from(new Set(list.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))).sort(
      (a, b) => a - b,
    );
  }

  function workPatternSummary(employee) {
    const labels = ["일", "월", "화", "수", "목", "금", "토"];
    const patterns = normalizeWorkPatterns(employee);
    if (!employee.workStartDate || !patterns.length) return "";
    const detail = patterns
      .map((pattern) => `${labels[pattern.weekday]} ${formatHourValue(pattern.startHour)}-${formatHourValue(pattern.endHour)}`)
      .join(", ");
    return `${formatDate(employee.workStartDate)}부터 ${detail}`;
  }

  function salaryConfigFromEmployee(employee, effectiveDate = "0000-00-00") {
    return {
      effectiveDate: normalizeEffectiveDate(effectiveDate),
      salaryType: employee?.salaryType === "fixed" ? "fixed" : "hourly",
      weekdayHourlyRate: Number(employee?.weekdayHourlyRate || 0),
      weekendHourlyRate: Number(employee?.weekendHourlyRate || 0),
      monthlySalary: Number(employee?.monthlySalary || 0),
    };
  }

  function normalizeSalaryChanges(employee) {
    const rawChanges = Array.isArray(employee?.salaryChanges) ? employee.salaryChanges : [];
    const changes = rawChanges
      .map((change) => ({
        effectiveDate: normalizeEffectiveDate(change.effectiveDate),
        salaryType: change.salaryType === "fixed" ? "fixed" : "hourly",
        weekdayHourlyRate: Number(change.weekdayHourlyRate || 0),
        weekendHourlyRate: Number(change.weekendHourlyRate || 0),
        monthlySalary: Number(change.monthlySalary || 0),
      }))
      .filter((change) => change.effectiveDate);
    if (!changes.length) {
      changes.push(salaryConfigFromEmployee(employee, employee?.salaryEffectiveDate || "0000-00-00"));
    }
    const byDate = new Map();
    changes.forEach((change) => {
      byDate.set(change.effectiveDate, change);
    });
    return Array.from(byDate.values()).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }

  function ensureSalaryBaseline(employee) {
    employee.salaryChanges = normalizeSalaryChanges(employee);
    if (!employee.salaryChanges.some((change) => change.effectiveDate === "0000-00-00")) {
      employee.salaryChanges.unshift(salaryConfigFromEmployee(employee, "0000-00-00"));
    }
  }

  function upsertSalaryChange(employee, effectiveDate) {
    const next = salaryConfigFromEmployee(employee, effectiveDate || "0000-00-00");
    const changes = normalizeSalaryChanges(employee).filter((change) => change.effectiveDate !== next.effectiveDate);
    changes.push(next);
    employee.salaryChanges = changes.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }

  function getSalaryConfigForDate(employee, date) {
    const changes = normalizeSalaryChanges(employee);
    let active = changes[0] || salaryConfigFromEmployee(employee);
    changes.forEach((change) => {
      if (change.effectiveDate === "0000-00-00" || change.effectiveDate <= date) active = change;
    });
    return active;
  }

  function getFixedSalaryPay(employee, monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const days = getDaysInMonth(year, month);
    let pay = 0;
    for (let day = 1; day <= days; day += 1) {
      const date = toDateString(year, month, day);
      if (!isEmployeeEmployedOnDate(employee, date)) continue;
      const config = getSalaryConfigForDate(employee, date);
      if (config.salaryType === "fixed") {
        pay += Number(config.monthlySalary || 0) / days;
      }
    }
    return Math.round(pay);
  }

  function normalizeEffectiveDate(value) {
    const date = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "0000-00-00";
  }

  function applyEmployeePatternsForMonth(monthKey, targetDb = db) {
    return targetDb.employees
      .filter((employee) => isEmployeeAccessActive(employee))
      .filter((employee) => employee.workStartDate && normalizeWorkPatterns(employee).length)
      .reduce(
        (result, employee) => {
          const applied = applyEmployeeWorkPattern(employee, employee.workStartDate, employee.workPatterns, monthKey, targetDb);
          result.added += applied.added;
          result.skipped += applied.skipped;
          return result;
        },
        { added: 0, skipped: 0 },
      );
  }

  function applyEmployeePatternChange(employee) {
    const startDate = employee.workStartDate;
    const patterns = normalizeWorkPatterns(employee);
    if (!startDate || !patterns.length) return { attempted: false, added: 0, skipped: 0, startDate };
    const months = getExistingScheduleMonthsFrom(startDate);
    return months.reduce(
      (result, monthKey) => {
        ensureBaseMonthTemplates(monthKey, db);
        const applied = applyEmployeeWorkPattern(employee, startDate, patterns, monthKey, db, true);
        result.added += applied.added;
        result.skipped += applied.skipped;
        result.attempted = result.attempted || applied.attempted;
        return result;
      },
      { attempted: false, added: 0, skipped: 0, startDate },
    );
  }

  function getExistingScheduleMonthsFrom(startDate) {
    const startMonth = startDate.slice(0, 7);
    const months = new Set([startMonth]);
    db.schedules.concat(db.staffSchedules).forEach((schedule) => {
      const monthKey = schedule.date.slice(0, 7);
      if (monthKey >= startMonth) months.add(monthKey);
    });
    return Array.from(months).sort();
  }

  function applyEmployeeWorkPattern(employee, startDate, patterns, targetMonth = startDate?.slice(0, 7), targetDb = db, replaceExisting = false) {
    const workPatterns = normalizeWorkPatterns(patterns);
    if (!startDate || !targetMonth || !workPatterns.length) {
      return { attempted: false, added: 0, skipped: 0, startDate };
    }
    const [year, month] = targetMonth.split("-").map(Number);
    if (!year || !month) return { attempted: false, added: 0, skipped: 0, startDate };
    const firstDay = startDate.startsWith(targetMonth) ? Number(startDate.slice(8, 10)) : 1;
    if (targetMonth < startDate.slice(0, 7)) return { attempted: true, added: 0, skipped: 0, startDate };
    if (replaceExisting) removeEmployeeSchedulesFromMonth(targetDb, employee.id, targetMonth, firstDay);
    let added = 0;
    let skipped = 0;
    for (let day = firstDay; day <= getDaysInMonth(year, month); day += 1) {
      const pattern = workPatterns.find((item) => item.weekday === getWeekday(year, month, day));
      if (!pattern) continue;
      const date = toDateString(year, month, day);
      if (!isEmployeeAvailableForScheduleDate(employee, date)) continue;
      if (addEmployeeScheduleForDate(targetDb, employee, date, pattern.startHour, pattern.endHour)) {
        added += 1;
      } else {
        skipped += 1;
      }
    }
    return { attempted: true, added, skipped, startDate };
  }

  function removeEmployeeSchedulesFromMonth(targetDb, employeeId, monthKey, firstDay) {
    const minDate = `${monthKey}-${pad(firstDay)}`;
    targetDb.schedules = targetDb.schedules.filter(
      (schedule) => schedule.pharmacistId !== employeeId || schedule.date < minDate || !schedule.date.startsWith(monthKey),
    );
    targetDb.staffSchedules = targetDb.staffSchedules.filter(
      (schedule) => schedule.staffId !== employeeId || schedule.date < minDate || !schedule.date.startsWith(monthKey),
    );
  }

  function addEmployeeScheduleForDate(targetDb, employee, date, startHour, endHour) {
    if (!isEmployeeAvailableForScheduleDate(employee, date)) return false;
    if (employee.role === "staff") {
      const sameDateSchedules = targetDb.staffSchedules.filter((schedule) => schedule.date === date);
      if (sameDateSchedules.some((schedule) => schedule.staffId === employee.id) || sameDateSchedules.length >= 2) return false;
      targetDb.staffSchedules.push({
        id: makeId("staff"),
        date,
        staffId: employee.id,
        startHour,
        endHour,
        hours: getHoursFromRange(startHour, endHour),
      });
      return true;
    }
    if (!["admin", "pharmacist"].includes(employee.role)) return false;
    const shiftType = inferShiftTypeFromHours(startHour, endHour);
    const sameDateSchedules = targetDb.schedules.filter((schedule) => schedule.date === date);
    if (sameDateSchedules.some((schedule) => schedule.pharmacistId === employee.id)) return false;
    const sameShiftCount = sameDateSchedules.filter((schedule) => schedule.shiftType === shiftType).length;
    if (sameShiftCount >= (shiftType === "10pm" ? 2 : 3)) return false;
    targetDb.schedules.push({
      id: makeId("sch"),
      date,
      shiftType,
      pharmacistId: employee.id,
      startHour,
      endHour,
    });
    return true;
  }

  function inferShiftTypeFromHours(startHour, endHour) {
    const end = normalizeHourValue(endHour);
    return end === 10 ? "10pm" : "8pm";
  }

  function getDefaultTimeRange(type) {
    if (type === "8pm") return { start: 10, end: 8 };
    if (type === "staff") return { start: 10, end: 8.5 };
    if (type === "irregular") return { start: 10, end: 8 };
    return { start: 10, end: 10 };
  }

  function getScheduleTimeRange(schedule, fallbackType = schedule?.shiftType) {
    const defaults = getDefaultTimeRange(fallbackType);
    return {
      start: parseHourValue(schedule?.startHour, defaults.start),
      end: parseHourValue(schedule?.endHour, defaults.end),
    };
  }

  function getRxScheduleHours(schedule) {
    const range = getScheduleTimeRange(schedule, schedule?.shiftType);
    return getHoursFromRange(range.start, range.end);
  }

  function getStaffScheduleHours(schedule) {
    const range = getScheduleTimeRange(schedule, "staff");
    return getHoursFromRange(range.start, range.end);
  }

  function getHoursFromRange(start, end) {
    const normalizedStart = normalizeHourValue(start);
    const normalizedEnd = normalizeHourValue(end);
    const hours = normalizedStart >= normalizedEnd ? 12 - normalizedStart + normalizedEnd : normalizedEnd - normalizedStart;
    return Number(hours.toFixed(2));
  }

  function parseHourValue(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeHourValue(value) {
    return Math.round(parseHourValue(value, 0) * 2) / 2;
  }

  function formatHourValue(value) {
    const normalized = normalizeHourValue(value);
    const hour = Math.floor(normalized);
    return normalized % 1 === 0.5 ? `${hour}:30` : `${hour}`;
  }

  function getScheduleTimeLabel(schedule, fallbackType = schedule?.shiftType) {
    const range = getScheduleTimeRange(schedule, fallbackType);
    return `${formatHourValue(range.start)}-${formatHourValue(range.end)}`;
  }

  function formatHours(value) {
    return Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  }

  function snapshotRxSchedule(schedule) {
    return {
      shiftType: schedule.shiftType,
      pharmacistId: schedule.pharmacistId,
      startHour: schedule.startHour,
      endHour: schedule.endHour,
    };
  }

  function snapshotStaffSchedule(schedule) {
    return {
      staffId: schedule.staffId,
      startHour: schedule.startHour,
      endHour: schedule.endHour,
      hours: schedule.hours,
    };
  }

  function isScheduleSnapshotChanged(before, after) {
    return JSON.stringify(before || {}) !== JSON.stringify(after || {});
  }

  function markManualScheduleChange(schedule, type, before, userId) {
    if (!schedule.changeOriginal || typeof schedule.changeOriginal !== "object") {
      schedule.changeOriginal = before;
    }
    schedule.changedAt = nowIso();
    schedule.changedBy = userId || "";
    schedule.changeType = type === "staff" ? "staff-manual" : "rx-manual";
  }

  function describeScheduleChange(before, after, type) {
    const beforeText = type === "staff" ? describeStaffSchedule(before) : describeRxSchedule(before);
    const afterText = type === "staff" ? describeStaffSchedule(after) : describeRxSchedule(after);
    if (beforeText === afterText) return "변경 전후 내용이 같습니다.";
    return `변경 전: ${beforeText}\n변경 후: ${afterText}`;
  }

  function describeAssignmentChanges(changes) {
    return changes
      .map(({ before, after }, index) => `${index + 1}. ${describeAssignment(before)} → ${describeAssignment(after)}`)
      .join("\n");
  }

  function describeAssignment(assignment) {
    if (!assignment) return "삭제된 근무";
    const employee = getEmployee(assignment.personId);
    const timeLabel =
      assignment.type === "staff"
        ? `직원 ${getScheduleTimeLabel(assignment.raw, "staff")}`
        : getScheduleTimeLabel(assignment.raw, assignment.shiftType);
    return `${formatDate(assignment.date)} ${timeLabel} · ${employee?.name || "미배정"} · ${formatHours(assignment.hours)}시간`;
  }

  function describeRxSchedule(schedule) {
    const employee = getEmployee(schedule.pharmacistId);
    return `${getScheduleTimeLabel(schedule)} · ${employee?.name || "미배정"} · ${formatHours(getRxScheduleHours(schedule))}시간`;
  }

  function describeStaffSchedule(schedule) {
    const employee = getEmployee(schedule.staffId);
    return `직원 ${getScheduleTimeLabel(schedule, "staff")} · ${employee?.name || "미배정"} · ${formatHours(getStaffScheduleHours(schedule))}시간`;
  }

  function getSchedulesByDate(date) {
    return db.schedules
      .filter((schedule) => schedule.date === date)
      .filter((schedule) => isEmployeeAvailableForScheduleDate(getEmployee(schedule.pharmacistId), schedule.date))
      .sort((a, b) => sortSchedulesByMonthlyPay(a, b, date.slice(0, 7)));
  }

  function getStaffSchedulesByDate(date) {
    return db.staffSchedules
      .filter((schedule) => schedule.date === date)
      .filter((schedule) => isEmployeeAvailableForScheduleDate(getEmployee(schedule.staffId), schedule.date))
      .sort(sortStaffSchedulesByCalendarOrder);
  }

  function getDefaultStaffType(employee) {
    if (employee?.role !== "staff") return "";
    return employee.id === "emp-subin" || employee.name === "김수빈" ? "staff1" : "staff2";
  }

  function employeeCategory(employee) {
    if (!employee) return "";
    if (employee.role === "staff") return employee.staffType || getDefaultStaffType(employee);
    return employee.role;
  }

  function getEmployeeRoleKind(employee) {
    const category = employeeCategory(employee);
    return normalizeRoleKind(category, "pharmacist");
  }

  function normalizeRoleKind(value, fallback = "pharmacist") {
    return ["admin", "pharmacist", "staff1", "staff2"].includes(value) ? value : fallback;
  }

  function roleKindToRoleInfo(roleKind) {
    if (roleKind === "admin") return { role: "admin", staffType: "" };
    if (roleKind === "staff1") return { role: "staff", staffType: "staff1" };
    if (roleKind === "staff2") return { role: "staff", staffType: "staff2" };
    return { role: "pharmacist", staffType: "" };
  }

  function roleKindOptions(selected) {
    const options = [
      ["admin", "관리자"],
      ["pharmacist", "근무약사"],
      ["staff1", "직원1"],
      ["staff2", "직원2"],
    ];
    return options
      .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
      .join("");
  }

  function syncRoleKindFields(container) {
    if (!container) return;
    const roleKind = normalizeRoleKind(container.querySelector('[name="roleKind"]')?.value, "pharmacist");
    container.dataset.roleKind = roleKind;
    const leaveInput = container.querySelector('[name="leaveAllowance"]');
    if (leaveInput) {
      leaveInput.disabled = roleKind !== "staff1";
      if (roleKind !== "staff1") leaveInput.value = "0";
    }
    container.querySelectorAll('[name^="workEndHour-"]').forEach((select) => {
      select.value = ["staff1", "staff2"].includes(roleKind) ? "8.5" : "8";
    });
  }

  function syncScheduleKindFields(form) {
    if (!form) return;
    const nextKind = form.querySelector('[name="shiftType"]')?.value || "10pm";
    form.dataset.scheduleKind = nextKind;
    const range = getDefaultTimeRange(nextKind);
    const start = form.querySelector('[name="startHour"]');
    const end = form.querySelector('[name="endHour"]');
    if (start) start.value = String(range.start);
    if (end) end.value = String(range.end);
  }

  function employeeDisplayRole(employee) {
    if (!employee) return "";
    if (employee.role === "staff") return STAFF_TYPE_LABELS[employeeCategory(employee)] || "직원";
    return ROLE_LABELS[employee.role] || employee.role;
  }

  function workerOptionLabel(employee) {
    return `${employee.name} (${employeeDisplayRole(employee)})`;
  }

  function getEmployeeHireDate(employee) {
    return employee?.hireDate || employee?.firstWorkStartDate || employee?.workStartDate || "";
  }

  function getEmployeeFirstWorkStartDate(employee) {
    return minDate(employee?.firstWorkStartDate, findFirstEmployeeWorkDate(employee?.id), employee?.workStartDate);
  }

  function isEmployeeVisibleInMonth(employee, monthKey) {
    if (!employee || !monthKey) return false;
    const [year, month] = monthKey.split("-").map(Number);
    const monthStart = `${monthKey}-01`;
    const monthEnd = toDateString(year, month, getDaysInMonth(year, month));
    const startDate = getEmployeeHireDate(employee) || getEmployeeFirstWorkStartDate(employee) || employee.workStartDate || "";
    const endDate = employee.resignationDate || "";
    if (startDate && startDate > monthEnd) return false;
    if (endDate && endDate < monthStart) return false;
    if (employee.status === "resigned" && !endDate) return false;
    return true;
  }

  function employeeTenureText(employee) {
    const hireDate = getEmployeeHireDate(employee);
    const firstWorkDate = getEmployeeFirstWorkStartDate(employee);
    const tenureText = firstWorkDate ? formatTenureFrom(firstWorkDate) : "근속 정보 없음";
    const parts = [];
    if (hireDate) parts.push(`입사 ${formatDate(hireDate)}`);
    if (firstWorkDate) parts.push(`첫 근무 ${formatDate(firstWorkDate)}`);
    parts.push(tenureText);
    return parts.join(" · ");
  }

  function employeeRecentStartText(employee) {
    const date = employee?.lastModifiedStartDate || employee?.workStartDate || employee?.salaryEffectiveDate || "";
    return date ? `최근 적용 ${formatDate(date)}` : "최근 적용일 없음";
  }

  function formatTenureFrom(startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) return "";
    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const [todayYear, todayMonth, todayDay] = getKoreaDateString().split("-").map(Number);
    let elapsedMonths = (todayYear - startYear) * 12 + (todayMonth - startMonth);
    if (todayDay < startDay) elapsedMonths -= 1;
    const inclusiveMonths = Math.max(1, elapsedMonths + 1);
    const years = Math.floor((inclusiveMonths - 1) / 12);
    const months = ((inclusiveMonths - 1) % 12) + 1;
    return years ? `${years}년 ${months}개월차` : `${months}개월차`;
  }

  function employeeStatusText(employee) {
    if (!employee) return "";
    if (employee.status === "active" && employee.resignationDate) {
      return `${formatDate(employee.resignationDate)}까지 근무`;
    }
    return STATUS_LABELS[employee.status] || employee.status;
  }

  function canSwapEmployees(left, right) {
    const leftCategory = employeeCategory(left);
    const rightCategory = employeeCategory(right);
    const leftIsStaff = ["staff1", "staff2"].includes(leftCategory);
    const rightIsStaff = ["staff1", "staff2"].includes(rightCategory);
    if (!left || !right || left.id === right.id) return false;
    if (!isEmployeeAccessActive(left) || !isEmployeeAccessActive(right)) return false;
    if (leftCategory === "staff2" || rightCategory === "staff2") return false;
    if (leftCategory === "pharmacist" && rightCategory === "pharmacist") return true;
    if (leftCategory === "admin" && rightCategory === "pharmacist") return true;
    if (leftCategory === "pharmacist" && rightCategory === "admin") return true;
    if (leftIsStaff && rightIsStaff) return true;
    if (leftCategory === "admin" && rightIsStaff) return true;
    if (rightCategory === "admin" && leftIsStaff) return true;
    return false;
  }

  function canHandoffEmployee(employee) {
    const category = employeeCategory(employee);
    return ["admin", "pharmacist"].includes(category) && isEmployeeAccessActive(employee);
  }

  function normalizeAssignmentRef(value) {
    const raw = String(value || "");
    if (!raw) return "";
    if (raw.startsWith("rx:") || raw.startsWith("staff:")) return raw;
    if (db.schedules.some((schedule) => schedule.id === raw)) return `rx:${raw}`;
    if (db.staffSchedules.some((schedule) => schedule.id === raw)) return `staff:${raw}`;
    return raw;
  }

  function getSwapAssignment(value) {
    const ref = normalizeAssignmentRef(value);
    if (!ref) return null;
    if (ref.startsWith("staff:")) {
      const id = ref.slice(6);
      const schedule = db.staffSchedules.find((item) => item.id === id);
      if (!schedule) return null;
      return {
        ref,
        id,
        type: "staff",
        date: schedule.date,
        personId: schedule.staffId,
        raw: schedule,
        shiftType: "staff",
        hours: getStaffScheduleHours(schedule),
      };
    }
    const id = ref.startsWith("rx:") ? ref.slice(3) : ref;
    const schedule = db.schedules.find((item) => item.id === id);
    if (!schedule) return null;
    return {
      ref: `rx:${id}`,
      id,
      type: "rx",
      date: schedule.date,
      personId: schedule.pharmacistId,
      raw: schedule,
      shiftType: schedule.shiftType,
      hours: getRxScheduleHours(schedule),
    };
  }

  function setAssignmentPerson(ref, personId) {
    const assignment = getSwapAssignment(ref);
    if (!assignment) return;
    if (assignment.type === "staff") {
      assignment.raw.staffId = personId;
    } else {
      assignment.raw.pharmacistId = personId;
    }
  }

  function getAllAssignments(monthKey = monthCursor) {
    const cacheKey = monthKey || "__all__";
    if (assignmentsCache.has(cacheKey)) return assignmentsCache.get(cacheKey).slice();
    const monthFilter = (schedule) => !monthKey || schedule.date.startsWith(monthKey);
    const rxAssignments = db.schedules.filter(monthFilter).map((schedule) => getSwapAssignment(`rx:${schedule.id}`));
    const staffAssignments = db.staffSchedules.filter(monthFilter).map((schedule) => getSwapAssignment(`staff:${schedule.id}`));
    const assignments = rxAssignments
      .concat(staffAssignments)
      .filter(Boolean)
      .filter((assignment) => isEmployeeAvailableForScheduleDate(getEmployee(assignment.personId), assignment.date))
      .sort(sortAssignments);
    assignmentsCache.set(cacheKey, assignments);
    return assignments.slice();
  }

  function getPendingSwapForSchedule(scheduleId) {
    const ref = normalizeAssignmentRef(scheduleId);
    return db.swapRequests.find(
      (request) =>
        request.status === "pending" &&
        (normalizeAssignmentRef(request.requesterScheduleId) === ref || normalizeAssignmentRef(request.targetScheduleId) === ref),
    );
  }

  function hasPendingSwapOnDate(date) {
    return db.swapRequests.some((request) => {
      if (request.status !== "pending") return false;
      const requesterSchedule = getSwapAssignment(request.requesterScheduleId);
      const targetSchedule = getSwapAssignment(request.targetScheduleId);
      return requesterSchedule?.date === date || targetSchedule?.date === date;
    });
  }

  function getHoliday(date) {
    return db.holidays.find((holiday) => holiday.date === date);
  }

  function displayHolidayName(name) {
    return String(name || "").includes("대체공휴일") ? "대체공휴일" : name || "";
  }

  function getAvailableOwnSchedules(userId) {
    return getAllAssignments(monthCursor)
      .filter((assignment) => assignment.personId === userId)
      .filter((assignment) => !hasPendingForSchedule(assignment.ref))
      .sort(sortAssignments);
  }

  function getAvailableSwapTargetEmployees(userId) {
    const user = getEmployee(userId);
    return db.employees
      .filter((employee) => employee.id !== userId)
      .filter((employee) => isEmployeeAccessActive(employee) && canSwapEmployees(user, employee))
      .filter((employee) => getAvailableTargetSchedules(userId, employee.id).length)
      .sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        return a.name.localeCompare(b.name, "ko");
      });
  }

  function getFutureSwapDateWindow() {
    const start = getKoreaDateString();
    const [year, month, day] = start.split("-").map(Number);
    const endBase = new Date(Date.UTC(year, month - 1 + 2, day));
    const end = toDateString(endBase.getUTCFullYear(), endBase.getUTCMonth() + 1, endBase.getUTCDate());
    return { start, end };
  }

  function getAvailableTargetSchedules(userId, targetEmployeeId = "") {
    const user = getEmployee(userId);
    const { start, end } = getFutureSwapDateWindow();
    const assignments = getAllAssignments("");
    const myWorkDates = new Set(assignments.filter((assignment) => assignment.personId === userId).map((assignment) => assignment.date));
    return assignments
      .filter((assignment) => assignment.personId !== userId)
      .filter((assignment) => !targetEmployeeId || assignment.personId === targetEmployeeId)
      .filter((assignment) => assignment.date >= start && assignment.date <= end)
      .filter((assignment) => !myWorkDates.has(assignment.date))
      .filter((assignment) => {
        const employee = getEmployee(assignment.personId);
        if (employeeCategory(user) === "staff2" && employee?.role === "admin") return false;
        return isEmployeeAccessActive(employee) && canSwapEmployees(user, employee);
      })
      .filter((assignment) => !hasPendingForSchedule(assignment.ref))
      .sort(sortAssignments);
  }

  function getAvailableHandoffOwnSchedules(userId) {
    const user = getEmployee(userId);
    if (!canHandoffEmployee(user)) return [];
    return getAllAssignments(monthCursor)
      .filter((assignment) => assignment.type === "rx")
      .filter((assignment) => assignment.personId === userId)
      .filter((assignment) => !hasPendingForSchedule(assignment.ref))
      .sort(sortAssignments);
  }

  function getAvailableHandoffTargets(userId) {
    const user = getEmployee(userId);
    if (!canHandoffEmployee(user)) return [];
    return db.employees
      .filter((employee) => employee.id !== userId)
      .filter((employee) => canHandoffEmployee(employee))
      .filter((employee) => isEmployeeAccessActive(employee))
      .sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        return a.name.localeCompare(b.name, "ko");
      });
  }

  function getAvailableCoverageSchedules(userId) {
    const user = getEmployee(userId);
    if (!["staff1", "staff2"].includes(employeeCategory(user))) return [];
    return getAllAssignments(monthCursor)
      .filter((assignment) => assignment.type === "staff")
      .filter((assignment) => assignment.personId === userId)
      .filter((assignment) => !hasPendingForSchedule(assignment.ref))
      .sort(sortAssignments);
  }

  function getLeavePeriodStart(employee) {
    if (employee?.leaveCycleStartDate) {
      return getCurrentAnnualCycleStart(employee.leaveCycleStartDate);
    }
    return employee?.lastModifiedStartDate || employee?.workStartDate || employee?.salaryEffectiveDate || employee?.firstWorkStartDate || "";
  }

  function getCurrentAnnualCycleStart(startDate, referenceDate = getKoreaDateString()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) return "";
    const [, month, day] = startDate.split("-");
    let year = Number(referenceDate.slice(0, 4));
    let candidate = `${year}-${month}-${day}`;
    if (candidate > referenceDate) {
      candidate = `${year - 1}-${month}-${day}`;
    }
    return candidate;
  }

  function getLeaveDatesInCurrentPeriod(employee) {
    const periodStart = getLeavePeriodStart(employee);
    return (Array.isArray(employee?.leaveDates) ? employee.leaveDates : [])
      .filter((date) => !periodStart || date >= periodStart)
      .sort();
  }

  function getLeaveRequests(employeeId, status = "", fromDate = "") {
    return db.swapRequests
      .filter((request) => request.type === "leave")
      .filter((request) => request.requesterId === employeeId)
      .filter((request) => !status || request.status === status)
      .filter((request) => !fromDate || request.leaveDate >= fromDate)
      .sort(sortRecent);
  }

  function getVisibleCompletedPharmacistSwaps() {
    return db.swapRequests.filter(isCompletedPharmacistSwap).filter((request) => !isPastRequestByWorkDate(request));
  }

  function getVisibleCompletedWorkChanges() {
    return db.swapRequests.filter(isCompletedWorkChange).filter((request) => !isPastRequestByWorkDate(request));
  }

  function getAdminVisibleRequests() {
    return db.swapRequests.filter((request) => !(isCompletedWorkChange(request) && isPastRequestByWorkDate(request)));
  }

  function isCompletedPharmacistSwap(request) {
    if (!request || request.status !== "approved" || request.type === "coverage" || request.type === "leave" || request.type === "handoff") return false;
    return getEmployee(request.requesterId)?.role === "pharmacist" && getEmployee(request.targetId)?.role === "pharmacist";
  }

  function isCompletedWorkChange(request) {
    return Boolean(request) && request.status === "approved" && request.type !== "leave";
  }

  function isPastRequestByWorkDate(request) {
    const today = getKoreaDateString();
    const dates = getRequestWorkDates(request);
    return dates.length > 0 && dates.every((date) => date < today);
  }

  function getRequestWorkDates(request) {
    const dates = [request.leaveDate, getSwapAssignment(request.requesterScheduleId)?.date, getSwapAssignment(request.targetScheduleId)?.date];
    return dates.filter(Boolean);
  }

  function hasPendingForSchedule(scheduleId) {
    const ref = normalizeAssignmentRef(scheduleId);
    return db.swapRequests.some(
      (request) =>
        request.status === "pending" &&
        (normalizeAssignmentRef(request.requesterScheduleId) === ref || normalizeAssignmentRef(request.targetScheduleId) === ref),
    );
  }

  function getSwapDuplicateMessage(requesterId, targetId, requesterSchedule, targetSchedule) {
    if (!requesterSchedule || !targetSchedule) return "";
    if (requesterSchedule.date === targetSchedule.date) return "";
    const assignments = getAllAssignments("");
    const targetAlreadyOnRequesterDate = assignments.some(
      (assignment) =>
        assignment.ref !== requesterSchedule.ref &&
        assignment.date === requesterSchedule.date &&
        assignment.personId === targetId &&
        !isAllowedAdminPositionOverlap(targetId, assignment, requesterSchedule),
    );
    if (targetAlreadyOnRequesterDate) {
      const target = getEmployee(targetId);
      return `${target?.name || "상대 근무자"}님은 이미 ${formatDate(requesterSchedule.date)}에 근무가 있어 교체할 수 없습니다.`;
    }
    const requesterAlreadyOnTargetDate = assignments.some(
      (assignment) =>
        assignment.ref !== targetSchedule.ref &&
        assignment.date === targetSchedule.date &&
        assignment.personId === requesterId &&
        !isAllowedAdminPositionOverlap(requesterId, assignment, targetSchedule),
    );
    if (requesterAlreadyOnTargetDate) {
      const requester = getEmployee(requesterId);
      return `${requester?.name || "요청자"}님은 이미 ${formatDate(targetSchedule.date)}에 근무가 있어 교체할 수 없습니다.`;
    }
    return "";
  }

  function getHandoffDuplicateMessage(targetId, requesterSchedule) {
    if (!requesterSchedule) return "";
    const target = getEmployee(targetId);
    const alreadyAssigned = getAllAssignments("").some(
      (assignment) =>
        assignment.ref !== requesterSchedule.ref &&
        assignment.date === requesterSchedule.date &&
        assignment.personId === targetId &&
        !isAllowedAdminPositionOverlap(targetId, assignment, requesterSchedule),
    );
    return alreadyAssigned ? `${target?.name || "받을 근무자"}님은 이미 ${formatDate(requesterSchedule.date)}에 근무가 있어 넘길 수 없습니다.` : "";
  }

  function isAllowedAdminPositionOverlap(employeeId, existingAssignment, incomingAssignment) {
    const employee = getEmployee(employeeId);
    return (
      employee?.role === "admin" &&
      existingAssignment?.date === incomingAssignment?.date &&
      existingAssignment?.type !== incomingAssignment?.type
    );
  }

  function getSalaryStats(employeeId, monthKey) {
    const cacheKey = `${monthKey}:${employeeId}`;
    if (salaryStatsCache.has(cacheKey)) return salaryStatsCache.get(cacheKey);
    const employee = getEmployee(employeeId);
    const schedules = getAllAssignments(monthKey).filter((assignment) => assignment.personId === employeeId);
    const tenCount = schedules.filter((schedule) => schedule.shiftType === "10pm").length;
    const eightCount = schedules.filter((schedule) => schedule.shiftType === "8pm").length;
    const staffCount = schedules.filter((schedule) => schedule.type === "staff").length;
    const salaryRows = schedules.map((schedule) => {
      const hours = Number(schedule.hours || 0);
      const weekend = isWeekendDate(schedule.date);
      const salaryConfig = getSalaryConfigForDate(employee, schedule.date);
      const hourlyRate = salaryConfig.salaryType === "fixed" ? 0 : Number(weekend ? salaryConfig.weekendHourlyRate || 0 : salaryConfig.weekdayHourlyRate || 0);
      return {
        hours,
        weekend,
        pay: hourlyRate * hours,
      };
    });
    const totalHours = salaryRows.reduce((sum, row) => sum + row.hours, 0);
    const weekdayHours = salaryRows.filter((row) => !row.weekend).reduce((sum, row) => sum + row.hours, 0);
    const weekendHours = salaryRows.filter((row) => row.weekend).reduce((sum, row) => sum + row.hours, 0);
    const weekdayPay = salaryRows.filter((row) => !row.weekend).reduce((sum, row) => sum + row.pay, 0);
    const weekendPay = salaryRows.filter((row) => row.weekend).reduce((sum, row) => sum + row.pay, 0);
    const fixedPay = getFixedSalaryPay(employee, monthKey);
    const totalPay = fixedPay + salaryRows.reduce((sum, row) => sum + row.pay, 0);
    const result = {
      totalCount: schedules.length,
      tenCount,
      eightCount,
      staffCount,
      totalHours,
      weekdayHours,
      weekendHours,
      weekdayPay,
      weekendPay,
      fixedPay,
      totalPay,
    };
    salaryStatsCache.set(cacheKey, result);
    return result;
  }

  function assignmentOptionLabel(assignment, includeName = false) {
    if (!assignment) return "삭제된 근무";
    return assignmentOptionLabelWithOwner(assignment, assignment.personId, includeName);
  }

  function assignmentOptionLabelWithOwner(assignment, ownerId, includeName = false) {
    if (!assignment) return "삭제된 근무";
    const employee = getEmployee(ownerId || assignment.personId);
    const workLabel = assignment.type === "staff" ? "(직원근무)" : getScheduleTimeLabel(assignment.raw, assignment.shiftType);
    const label = `${formatDate(assignment.date)} ${workLabel}`;
    return includeName ? `${label} · ${employee?.name || "알 수 없음"}` : label;
  }

  function salaryBasisText(employee) {
    const monthEnd = getMonthEndDate(monthCursor);
    const config = getSalaryConfigForDate(employee, monthEnd);
    const effectiveLabel = config.effectiveDate === "0000-00-00" ? "" : `${formatFullDate(config.effectiveDate)}부터 `;
    if (config.salaryType === "fixed") {
      return `${effectiveLabel}고정급 ${formatWon(config.monthlySalary)}`;
    }
    return `${effectiveLabel}평일 ${formatWon(config.weekdayHourlyRate)}, 주말/공휴일 ${formatWon(config.weekendHourlyRate)}`;
  }

  function workBreakdownText(stats) {
    const parts = [];
    if (stats.tenCount) parts.push(`10-10 ${stats.tenCount}`);
    if (stats.eightCount) parts.push(`10-8 ${stats.eightCount}`);
    if (stats.staffCount) parts.push(`직원 ${stats.staffCount}`);
    return parts.length ? parts.join(" · ") : "근무 없음";
  }

  function getRequestStatusText(status, type = "swap") {
    const approvedText = type === "leave" ? "처리완료" : "승인완료";
    return {
      pending: "승인대기",
      approved: approvedText,
      rejected: "거절",
      cancelled: "취소",
    }[status] || status;
  }

  function getRowValue(row, name) {
    return row.querySelector(`[name="${name}"]`)?.value || "";
  }

  function showToast(message) {
    toast = message;
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = "";
      render();
    }, 2800);
  }

  function requestTodayFocus() {
    shouldFocusTodayAfterRender = true;
  }

  function focusTodayAfterCalendarRender() {
    if (!shouldFocusTodayAfterRender || currentTab !== "calendar" || monthCursor !== getKoreaMonthKey()) return;
    shouldFocusTodayAfterRender = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const todayCell = app.querySelector(`[data-date="${getKoreaDateString()}"]`);
        if (!todayCell) return;
        const topbarHeight = app.querySelector(".topbar")?.getBoundingClientRect().height || 0;
        const calendarHeadHeight = app.querySelector(".calendar-sticky-head")?.getBoundingClientRect().height || 0;
        const targetTop = todayCell.getBoundingClientRect().top + window.scrollY;
        const offset = topbarHeight + calendarHeadHeight + 10;
        window.scrollTo({ top: Math.max(0, targetTop - offset), behavior: "auto" });
      });
    });
  }

  function sortSchedules(a, b) {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    return getShiftSortIndex(a.shiftType) - getShiftSortIndex(b.shiftType);
  }

  function sortSchedulesByMonthlyPay(a, b, monthKey) {
    const shiftOrder = getShiftSortIndex(a.shiftType) - getShiftSortIndex(b.shiftType);
    if (shiftOrder !== 0) return shiftOrder;
    return sortEmployeeIdsByMonthlyPay(a.pharmacistId, b.pharmacistId, monthKey);
  }

  function getShiftSortIndex(shiftType) {
    const index = SHIFT_ORDER.indexOf(shiftType);
    return index >= 0 ? index : SHIFT_ORDER.length;
  }

  function sortStaffSchedulesByCalendarOrder(a, b) {
    const priority = {
      "emp-subin": 0,
      "emp-hyojin": 1,
      "emp-sohyun": 2,
      "emp-yuri": 3,
    };
    const priorityOrder = (priority[a.staffId] ?? 99) - (priority[b.staffId] ?? 99);
    if (priorityOrder !== 0) return priorityOrder;
    const left = getEmployee(a.staffId)?.name || "";
    const right = getEmployee(b.staffId)?.name || "";
    return left.localeCompare(right, "ko");
  }

  function sortEmployeeIdsByMonthlyPay(leftId, rightId, monthKey) {
    const payOrder = getMonthlyPay(rightId, monthKey) - getMonthlyPay(leftId, monthKey);
    if (payOrder !== 0) return payOrder;
    const left = getEmployee(leftId)?.name || "";
    const right = getEmployee(rightId)?.name || "";
    return left.localeCompare(right, "ko");
  }

  function getMonthlyPay(employeeId, monthKey) {
    const cacheKey = `${monthKey}:${employeeId}`;
    if (!monthlyPayCache.has(cacheKey)) {
      monthlyPayCache.set(cacheKey, getSalaryStats(employeeId, monthKey).totalPay);
    }
    return monthlyPayCache.get(cacheKey);
  }

  function sortAssignments(a, b) {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    const order = { "10pm": 0, "8pm": 1, staff: 2 };
    const typeOrder = (order[a.shiftType] ?? 9) - (order[b.shiftType] ?? 9);
    if (typeOrder !== 0) return typeOrder;
    const left = getEmployee(a.personId)?.name || "";
    const right = getEmployee(b.personId)?.name || "";
    return left.localeCompare(right, "ko");
  }

  function sortRecent(a, b) {
    const left = getRequestRecentTime(a);
    const right = getRequestRecentTime(b);
    return right.localeCompare(left);
  }

  function getRequestRecentTime(request) {
    return request?.approvedAt || request?.rejectedAt || request?.cancelledAt || request?.createdAt || "";
  }

  function getKoreaDateParts() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
    };
  }

  function getKoreaDateString() {
    const { year, month, day } = getKoreaDateParts();
    return toDateString(year, month, day);
  }

  function getKoreaMonthKey() {
    const { year, month } = getKoreaDateParts();
    return `${year}-${pad(month)}`;
  }

  function getMonthEndDate(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return `${monthKey}-${pad(getDaysInMonth(year, month))}`;
  }

  function isDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
  }

  function canManageOverseasSchedule(user) {
    return Boolean(user && ["admin", "pharmacist"].includes(user.role));
  }

  function getOverseasSchedulesForMonth(monthKey) {
    const monthStart = `${monthKey}-01`;
    const monthEnd = getMonthEndDate(monthKey);
    return normalizeOverseasSchedules(db.overseasSchedules)
      .filter((schedule) => schedule.startDate <= monthEnd && schedule.endDate >= monthStart)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
  }

  function getOverseasSchedulesForEmployee(employeeId, monthKey) {
    return getOverseasSchedulesForMonth(monthKey).filter((schedule) => schedule.employeeId === employeeId);
  }

  function getOverseasRangeLabel(schedule) {
    if (!schedule) return "";
    if (schedule.startDate === schedule.endDate) return formatFullDate(schedule.startDate);
    return `${formatFullDate(schedule.startDate)} ~ ${formatFullDate(schedule.endDate)}`;
  }

  function toDateString(year, month, day) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function getDaysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function getWeekday(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  function isWeekendDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    const weekday = getWeekday(year, month, day);
    return weekday === 0 || weekday === 6 || Boolean(getHoliday(date));
  }

  function shiftMonth(monthKey, amount) {
    const [year, month] = monthKey.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
  }

  function formatDate(date) {
    if (!date) return "";
    const [, month, day] = date.split("-");
    return `${Number(month)}월 ${Number(day)}일`;
  }

  function formatFullDate(date) {
    if (!date) return "";
    const [year, month, day] = date.split("-");
    return `${year}년 ${Number(month)}월 ${Number(day)}일`;
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  function minDate(...dates) {
    const validDates = dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date || "")).sort();
    return validDates[0] || "";
  }

  function formatWon(value) {
    return `${new Intl.NumberFormat("ko-KR").format(Number(value || 0))}원`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function generateTemporaryPassword() {
    const random = window.crypto?.getRandomValues
      ? window.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
      : Math.random();
    return String(Math.floor(1000 + random * 9000));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function iconCalendar() {
    return `
      <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>
      </svg>
    `;
  }

  function iconSwap() {
    return `
      <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 7h11l-3-3M17 17H6l3 3M18 7l-4 4M6 17l4-4"/>
      </svg>
    `;
  }

  function iconWallet() {
    return `
      <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16v12H4zM4 7l3-3h10l3 3M16 13h2"/>
      </svg>
    `;
  }

  function iconSettings() {
    return `
      <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 12h2M18 12h2M12 4v2M12 18v2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>
      </svg>
    `;
  }
})();
