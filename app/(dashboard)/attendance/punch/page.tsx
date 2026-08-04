"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, type PunchRecord, type ShiftType } from "@/lib/context/AppContext";
import {
  PHARMACY_LOCATION,
  distanceMeters,
  isWithinPharmacyGeofence,
} from "@/lib/attendance/geofence";
import {
  calcLateMinutes,
  EARLY_PUNCH_MINUTES,
  formatNowTime,
  getBreakCountForShift,
  getPunchSlotsForShift,
  minutesDiff,
  nowMinutes,
  OVERTIME_REDIRECT_MINUTES,
  timeToMinutes,
  todayDateStr,
  type PunchSlot,
} from "@/lib/attendance/punchSchedule";
import {
  adjustPunchSlotsForApprovedLeave,
  resolvePunchLateMinutes,
} from "@/lib/attendance/punchLeaveAdjust";
import { MapPin, Clock, AlertCircle, CheckCircle2, Megaphone, X } from "lucide-react";
import { type BulletinItem } from "@/lib/context/AppContext";

type GpsState = "loading" | "denied" | "outside" | "inside";

function punchKey(slot: PunchSlot) {
  return `${slot.action}-${slot.segmentIndex}`;
}

export default function PunchPage() {
  const router = useRouter();
  const {
    currentUser,
    getShiftForDate,
    shiftTimeConfig,
    addPunchRecord,
    addTardinessRecord,
    getTodayPunchRecords,
    punchRecordsReady,
    refreshTodayPunchRecords,
    bulletinItems,
    leaveRequests,
  } = useApp();

  const [announcementModal, setAnnouncementModal] = useState<boolean>(false);
  const [latestAnnouncement, setLatestAnnouncement] = useState<BulletinItem | null>(null);

  // 檢測是否有未讀的重要公告
  useEffect(() => {
    if (bulletinItems.length > 0) {
      const important = bulletinItems.find((item: BulletinItem) => item.isUrgent && item.status === "active");
      const latest = bulletinItems[0];
      const target = important || latest;
      
      if (target) {
        const lastSeenId = localStorage.getItem("last_seen_announcement");
        if (lastSeenId !== target.id) {
          setLatestAnnouncement(target);
          setAnnouncementModal(true);
        }
      }
    }
  }, [bulletinItems]);

  const handleCloseAnnouncement = (shouldRedirect: boolean): void => {
    if (latestAnnouncement) {
      localStorage.setItem("last_seen_announcement", latestAnnouncement.id);
    }
    setAnnouncementModal(false);
    if (shouldRedirect) {
      router.push("/schedule");
    }
  };

  const [gpsState, setGpsState] = useState<GpsState>("loading");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [nowLabel, setNowLabel] = useState(formatNowTime());
  const watchIdRef = useRef<number | null>(null);
  const [lateModal, setLateModal] = useState<{
    slot: PunchSlot;
    lateMinutes: number;
  } | null>(null);
  const [lateReason, setLateReason] = useState("");
  const [pendingSlot, setPendingSlot] = useState<PunchSlot | null>(null);

  // 打卡成功後的提示 modal（遲到超30分鐘先打卡再詢問請假）
  const [successModal, setSuccessModal] = useState<{
    message: string;
    askLeave: boolean;
    askOvertime: boolean;
  } | null>(null);

  // 無班表打卡的加班詢問 Modal
  const [noShiftOvertimeModal, setNoShiftOvertimeModal] = useState<{
    action: "work_in" | "work_out";
  } | null>(null);

  // 提早下班兩層 modal
  const [earlyLeaveModal, setEarlyLeaveModal] = useState<{
    slot: PunchSlot;
    earlyMinutes: number;
    step: 1 | 2; // step1: 是否申請早退，step2: 確認是否強制打卡
  } | null>(null);
  const [isPunching, setIsPunching] = useState(false);

  const today = todayDateStr();
  const shift: ShiftType = currentUser
    ? getShiftForDate(today, currentUser.id)
    : "X";

  const slots = useMemo(() => {
    if (shift === "X" || !currentUser) return [];
    const raw = getPunchSlotsForShift(shift, shiftTimeConfig);
    return adjustPunchSlotsForApprovedLeave(raw, currentUser.id, today, leaveRequests);
  }, [shift, shiftTimeConfig, currentUser, today, leaveRequests]);

  const todayPunches = currentUser ? getTodayPunchRecords(currentUser.id, today) : [];
  const completedKeys = new Set(
    todayPunches.map((p) => `${p.action}-${p.segmentIndex}`)
  );

  const nextSlot = slots.find((slot) => !completedKeys.has(punchKey(slot)));
  const punchUiReady = punchRecordsReady && gpsState !== "loading";
  const canPunch = punchUiReady && gpsState === "inside" && !isPunching;

  useEffect(() => {
    if (currentUser) {
      void refreshTodayPunchRecords();
    }
  }, [currentUser, refreshTodayPunchRecords]);

  useEffect(() => {
    const timer = setInterval(() => setNowLabel(formatNowTime()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsState("denied");
      return;
    }

    const handlePosition = (position: GeolocationPosition) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setCoords({ lat, lng });
      const dist = distanceMeters(
        lat,
        lng,
        PHARMACY_LOCATION.latitude,
        PHARMACY_LOCATION.longitude
      );
      setDistance(Math.round(dist));
      setGpsState(isWithinPharmacyGeofence(lat, lng) ? "inside" : "outside");
    };

    const handleError = (error: GeolocationPositionError, highAccuracy: boolean) => {
      console.error("GPS error:", error.code, error.message);
      if (highAccuracy && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) {
        const fallbackId = navigator.geolocation.watchPosition(
          handlePosition,
          (fallbackError) => {
            console.error("Fallback GPS error:", fallbackError.code);
            setGpsState("denied");
          },
          { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 }
        );
        watchIdRef.current = fallbackId;
      } else {
        setGpsState("denied");
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (error) => handleError(error, true),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const finalizePunch = useCallback(
    async (slot: PunchSlot, reason?: string, lateMinutes = 0) => {
      if (!currentUser || !coords || isPunching || !punchRecordsReady) return;

      // 遲到分鐘數僅適用上班；下班超時／早退不得寫入 lateMinutes
      const effectiveLateMinutes = slot.action === "work_in" ? lateMinutes : 0;

      setIsPunching(true);
      try {
        await addPunchRecord({
          employeeId: currentUser.id,
          employeeName: currentUser.name,
          date: today,
          action: slot.action,
          segmentIndex: slot.segmentIndex,
          time: formatNowTime(),
          shift,
          lateMinutes: effectiveLateMinutes,
          reason,
          latitude: coords.lat,
          longitude: coords.lng,
        });

        if (slot.action === "work_in" && effectiveLateMinutes > 0 && reason) {
          try {
            await addTardinessRecord({
              employeeId: currentUser.id,
              employeeName: currentUser.name,
              date: today,
              minutes: effectiveLateMinutes,
              notes: reason,
            });
          } catch {
            // 遲到紀錄寫入失敗不應阻擋打卡成功與後續提示
          }
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "打卡失敗，請稍後再試");
        throw err;
      } finally {
        setIsPunching(false);
      }
    },
    [addPunchRecord, addTardinessRecord, coords, currentUser, isPunching, punchRecordsReady, shift, today]
  );

  // 處理無班表打卡
  const handleNoShiftPunch = (action: "work_in" | "work_out") => {
    if (!currentUser || !coords || !punchRecordsReady || isPunching) return;
    if (gpsState !== "inside") {
      alert("請在耀聖藥局 150 公尺範圍內才能打卡");
      return;
    }
    setNoShiftOvertimeModal({ action });
  };

  // 確認無班表打卡為加班
  const confirmNoShiftOvertime = async () => {
    if (!noShiftOvertimeModal || !currentUser || !coords || isPunching || !punchRecordsReady) return;

    const now = formatNowTime();
    const action = noShiftOvertimeModal.action;

    setIsPunching(true);
    try {
      await addPunchRecord({
        employeeId: currentUser.id,
        employeeName: currentUser.name,
        date: today,
        action,
        segmentIndex: 0,
        time: now,
        shift: "X",
        lateMinutes: 0,
        reason: "無班表打卡",
        latitude: coords.lat,
        longitude: coords.lng,
      });

      setNoShiftOvertimeModal(null);
      setSuccessModal({
        message: `${action === "work_in" ? "上班" : "下班"}打卡成功！今日無排班，建議申請加班。`,
        askLeave: false,
        askOvertime: true,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "打卡失敗，請稍後再試");
    } finally {
      setIsPunching(false);
    }
  };

  const validateAndPunch = async (slot: PunchSlot) => {
    if (!currentUser || !coords || !punchRecordsReady || isPunching) return;
    if (gpsState !== "inside") {
      alert("請在耀聖藥局 150 公尺範圍內才能打卡");
      return;
    }

    const scheduled = timeToMinutes(slot.scheduledTime);
    const actual = nowMinutes();

    if (slot.action === "work_in") {
      const earliest = scheduled - EARLY_PUNCH_MINUTES;
      if (actual < earliest) {
        alert(`尚未開放打卡，最早可於 ${slot.scheduledTime} 前 ${EARLY_PUNCH_MINUTES} 分鐘打卡`);
        return;
      }

      const minutesLate = minutesDiff(actual, scheduled);
      const lateMinutes = currentUser
        ? resolvePunchLateMinutes({
            employeeId: currentUser.id,
            date: today,
            scheduledTime: slot.scheduledTime,
            actualMinutes: actual,
            leaveRequests,
          })
        : calcLateMinutes(actual, scheduled);

      // 已核准請假覆蓋此時段：不計遲到（含超過 30 分鐘情境）
      if (lateMinutes <= 0) {
        try {
          await finalizePunch(slot);
          setSuccessModal({ message: "上班打卡成功！", askLeave: false, askOvertime: false });
        } catch {
          // finalizePunch 已顯示錯誤訊息
        }
        return;
      }

      if (minutesLate >= 30 && lateMinutes > 0) {
        try {
          await finalizePunch(slot, "遲到超過30分鐘", lateMinutes);
          setSuccessModal({
            message: `打卡成功！您已遲到 ${lateMinutes} 分鐘，建議申請請假。`,
            askLeave: true,
            askOvertime: false,
          });
        } catch {
          // finalizePunch 已顯示錯誤訊息
        }
        return;
      }

      setPendingSlot(slot);
      setLateModal({ slot, lateMinutes });
      return;
    }

    if (slot.action === "work_out") {
      const minutesPastEnd = minutesDiff(actual, scheduled);
      if (minutesPastEnd >= OVERTIME_REDIRECT_MINUTES) {
        try {
          await finalizePunch(
            slot,
            `加班（超過下班 ${minutesPastEnd} 分鐘）`
          );
          setSuccessModal({
            message: `打卡成功！已超過下班時間 ${minutesPastEnd} 分鐘，是否申請加班？`,
            askLeave: false,
            askOvertime: true,
          });
        } catch {
          // finalizePunch 已顯示錯誤訊息
        }
        return;
      }
      if (minutesPastEnd < 0) {
        const earlyMinutes = Math.abs(minutesPastEnd);
        setEarlyLeaveModal({ slot, earlyMinutes, step: 1 });
        return;
      }
      try {
        await finalizePunch(slot);
        setSuccessModal({ message: "下班打卡成功！", askLeave: false, askOvertime: false });
      } catch {
        // finalizePunch 已顯示錯誤訊息
      }
    }
  };

  const submitLateReason = async () => {
    if (!lateModal || !pendingSlot || isPunching) return;
    if (!lateReason.trim()) {
      alert("請填寫遲到原因，店長會在遲到管理中看到");
      return;
    }
    try {
      await finalizePunch(pendingSlot, lateReason.trim(), lateModal.lateMinutes);
      setLateModal(null);
      setLateReason("");
      setPendingSlot(null);
      setSuccessModal({ message: "上班打卡成功！", askLeave: false, askOvertime: false });
    } catch {
      // finalizePunch 已顯示錯誤訊息
    }
  };

  if (!currentUser) return null;

  const breakCount = shift !== "X" ? getBreakCountForShift(shift) : 0;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* 公告提醒 Modal */}
      {announcementModal && latestAnnouncement && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full relative animate-in fade-in zoom-in duration-300">
            <button
              onClick={() => handleCloseAnnouncement(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className={`p-3 rounded-full mb-4 ${latestAnnouncement?.isUrgent ? 'bg-amber-100' : 'bg-blue-100'}`}>
                <Megaphone className={`h-8 w-8 ${latestAnnouncement?.isUrgent ? 'text-amber-600' : 'text-blue-600'}`} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">最新公告消息</h3>
              <p className="text-sm text-gray-500 mb-4">店鋪有新的重要公告或需求，請前往班表頁面查看詳細內容。</p>
              
              <div className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-left border border-gray-100">
                <p className="text-xs font-bold text-blue-600 mb-1">
                  {latestAnnouncement.isUrgent ? "【重要】" : ""} {latestAnnouncement.title}
                </p>
                <p className="text-sm text-gray-700 line-clamp-2">{latestAnnouncement.content}</p>
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => handleCloseAnnouncement(false)}
                  className="flex-1 py-3 px-4 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  稍後再說
                </button>
                <button
                  onClick={() => handleCloseAnnouncement(true)}
                  className="flex-1 py-3 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  前往查看
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold text-gray-900">上下班打卡</h2>

      {!punchRecordsReady && (
        <div className="app-card p-4 text-sm text-amber-800 bg-amber-50 border border-amber-200">
          正在載入今日打卡資料，請稍候再打卡，避免重複打卡。
        </div>
      )}

      {isPunching && (
        <div className="app-card p-4 text-sm text-blue-800 bg-blue-50 border border-blue-200">
          打卡處理中，請勿重複點擊…
        </div>
      )}

      {/* GPS 狀態 */}
      <div
        className={`rounded-xl border p-4 ${
          gpsState === "inside"
            ? "bg-emerald-50 border-emerald-200"
            : gpsState === "loading"
              ? "bg-gray-50 border-gray-200"
              : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-start gap-3">
          <MapPin
            className={`h-5 w-5 shrink-0 ${
              gpsState === "inside" ? "text-emerald-600" : "text-red-500"
            }`}
          />
          <div className="text-sm">
            <p className="font-medium text-gray-900">GPS 定位：{PHARMACY_LOCATION.name}</p>
            <p className="text-gray-600">{PHARMACY_LOCATION.address}</p>
            <p className="text-gray-600">允許範圍：半徑 {PHARMACY_LOCATION.radiusMeters} 公尺</p>
            {gpsState === "loading" && <p className="text-gray-500 mt-1">定位中…</p>}
            {gpsState === "denied" && (
              <p className="text-red-700 mt-1">無法取得定位，請允許瀏覽器使用 GPS</p>
            )}
            {gpsState === "outside" && (
              <p className="text-red-700 mt-1">
                目前不在打卡範圍內
                {distance !== null ? `（距離約 ${distance} 公尺）` : ""}
              </p>
            )}
            {gpsState === "inside" && (
              <p className="text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> 已在打卡範圍內
                {distance !== null ? `（約 ${distance} 公尺）` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 今日資訊 */}
      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-600">今日 {today}</span>
          <span className="flex items-center gap-1 text-lg font-mono font-bold text-gray-900">
            <Clock className="h-5 w-5" />
            {nowLabel}
          </span>
        </div>
        <p className="text-sm text-gray-600">
          班別：<span className="font-bold text-gray-900">{shift === "X" ? "休假" : shift}</span>
          {shift !== "X" && (
            <span className="ml-2 text-gray-500">
              （{breakCount === 2 ? "全天班，2 次休息" : breakCount === 1 ? "白天班，1 次休息" : "單段班"}）
            </span>
          )}
        </p>
        {shift !== "X" && (
          <p className="text-xs text-gray-500 mt-2">
            可提早 10 分鐘打卡；遲到第 6 分鐘起算；遲到 30 分鐘仍可打卡但建議請假；下班後第 10 分鐘起建議申請加班
          </p>
        )}
      </div>

      {shift === "X" ? (
        <div className="space-y-4">
          <div className="app-card p-6 text-center text-gray-600">今日為休假，無需打卡</div>
          <div className="app-card p-4">
            <p className="text-sm text-gray-600 mb-3">如需上班打卡（加班），請使用下方按鈕：</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleNoShiftPunch("work_in")}
                disabled={!canPunch}
                className="flex-1 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPunching ? "打卡中..." : "上班打卡（加班）"}
              </button>
              <button
                type="button"
                onClick={() => handleNoShiftPunch("work_out")}
                disabled={!canPunch}
                className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPunching ? "打卡中..." : "下班打卡（加班）"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 打卡按鈕 + 今日進度：左右並排 */}
          <div className="flex gap-4 items-start">
            {/* 左：打卡按鈕 */}
            <div className="flex-1">
              {nextSlot ? (
                <button
                  type="button"
                  onClick={() => void validateAndPunch(nextSlot)}
                  disabled={!canPunch}
                  className="w-full py-6 rounded-xl bg-blue-600 text-white text-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPunching ? "打卡中..." : nextSlot.label}
                  <span className="block text-sm font-normal opacity-90 mt-1">
                    {punchRecordsReady ? `預定 ${nextSlot.scheduledTime}` : "載入打卡資料中..."}
                  </span>
                </button>
              ) : (
                <div className="app-card p-6 text-center text-emerald-700 font-medium">
                  今日打卡已完成
                </div>
              )}
            </div>

            {/* 右：今日打卡進度 */}
            <div className="flex-1 app-card p-3">
              <h3 className="font-medium text-gray-900 mb-2 text-sm">今日進度</h3>
              <ul className="space-y-1">
                {slots.map((slot) => {
                  const done = completedKeys.has(punchKey(slot));
                  const punch = todayPunches.find(
                    (p) => p.action === slot.action && p.segmentIndex === slot.segmentIndex
                  );
                  return (
                    <li
                      key={punchKey(slot)}
                      className={`text-xs rounded-lg px-2 py-1.5 ${
                        done ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-500"
                      }`}
                    >
                      <div className="flex justify-between">
                        <span>{slot.label}</span>
                        <span>{done && punch ? punch.time : slot.scheduledTime}</span>
                      </div>
                      {done && punch && punch.action === "work_in" && punch.lateMinutes > 0 && (
                        <div className="text-amber-600 mt-0.5">遲到 {punch.lateMinutes} 分</div>
                      )}
                      {done && punch && punch.action === "work_out" && punch.reason?.includes("加班") && (
                        <div className="text-blue-600 mt-0.5">逾時（建議加班）</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* 今日打卡紀錄（詳細） */}
          {todayPunches.length > 0 && (
            <div className="app-card p-4">
              <h3 className="font-medium text-gray-900 mb-2">打卡紀錄</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                {todayPunches.map((p: PunchRecord) => (
                  <li key={p.id} className="flex items-start justify-between border-b pb-2 last:border-0">
                    <div>
                      <span className="font-medium">
                        {p.action === "work_in" ? "🟢 上班" : "🔵 下班"}
                      </span>
                      <span className="ml-2 text-gray-500">段 {p.segmentIndex + 1}</span>
                      {p.action === "work_in" && p.lateMinutes > 0 && (
                        <div className="text-amber-600 text-xs mt-0.5">遲到 {p.lateMinutes} 分鐘</div>
                      )}
                      {p.action === "work_out" && p.reason?.includes("加班") && (
                        <div className="text-blue-600 text-xs mt-0.5">逾時（建議加班）</div>
                      )}
                    </div>
                    <span className="font-mono text-gray-900">{p.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 遲到原因 Modal（遲到5分鐘以上、未達30分鐘） */}
      {lateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-2 text-amber-800 mb-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">遲到打卡</p>
                <p className="text-sm mt-1">
                  您遲到 {lateModal.lateMinutes} 分鐘（第 6 分鐘起算）。請說明原因，店長會在遲到管理中看到，無需另外申請。
                </p>
              </div>
            </div>
            <textarea
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              className="w-full border rounded-lg p-3 text-sm"
              rows={3}
              placeholder="請輸入遲到原因…"
            />
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setLateModal(null);
                  setLateReason("");
                  setPendingSlot(null);
                }}
                className="flex-1 py-2 border rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitLateReason()}
                disabled={isPunching}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {isPunching ? "打卡中..." : "確認打卡"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 打卡成功 Modal（含請假/加班提示） */}
      {successModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-2 mb-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-gray-900">打卡成功</p>
                <p className="text-sm text-gray-600 mt-1">{successModal.message}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSuccessModal(null)}
                className="flex-1 py-2 border rounded-lg text-gray-700"
              >
                關閉
              </button>
              {successModal.askLeave && (
                <button
                  type="button"
                  onClick={() => {
                    setSuccessModal(null);
                    router.push("/applications/leave");
                  }}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  申請請假
                </button>
              )}
              {successModal.askOvertime && (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("date", today);
                    params.set("reason", "加班打卡");
                    setSuccessModal(null);
                    router.push(`/applications/overtime?${params.toString()}`);
                  }}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  申請加班
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 提早下班 Modal - 第一層：是否申請早退 */}
      {earlyLeaveModal?.step === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-2 text-amber-800 mb-4">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">提早下班</p>
                <p className="text-sm mt-1">
                  您提早 {earlyLeaveModal.earlyMinutes} 分鐘下班，是否申請早退（請假）？
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEarlyLeaveModal((prev) => prev ? { ...prev, step: 2 } : null)}
                className="flex-1 py-2 border rounded-lg text-gray-700"
              >
                否
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await finalizePunch(earlyLeaveModal.slot, "提早下班申請早退");
                      setEarlyLeaveModal(null);
                      router.push("/applications/leave");
                    } catch {
                      // finalizePunch 已顯示錯誤訊息
                    }
                  })();
                }}
                disabled={isPunching}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isPunching ? "打卡中..." : "是，申請早退"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 無班表打卡的加班詢問 Modal */}
      {noShiftOvertimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-2 text-blue-800 mb-4">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">确認加班</p>
                <p className="text-sm mt-1">
                  今日無排班但你要{noShiftOvertimeModal.action === "work_in" ? "上" : "下"}班，是否確認為加班？
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setNoShiftOvertimeModal(null)}
                className="flex-1 py-2 border rounded-lg text-gray-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmNoShiftOvertime}
                disabled={isPunching}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isPunching ? "打卡中..." : "是，確認加班"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提早下班 Modal - 第二層：確認是否仍要提早打卡 */}
      {earlyLeaveModal?.step === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-2 text-amber-800 mb-4">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">確認提早下班</p>
                <p className="text-sm mt-1">仍要提早下班嗎？</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEarlyLeaveModal(null)}
                className="flex-1 py-2 border rounded-lg text-gray-700"
              >
                否
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await finalizePunch(earlyLeaveModal.slot, "提早下班");
                      setEarlyLeaveModal(null);
                      setSuccessModal({ message: "下班打卡成功！", askLeave: false, askOvertime: false });
                    } catch {
                      // finalizePunch 已顯示錯誤訊息
                    }
                  })();
                }}
                disabled={isPunching}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {isPunching ? "打卡中..." : "是，打卡下班"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
