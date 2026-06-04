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
  timeToMinutes,
  todayDateStr,
  type PunchSlot,
} from "@/lib/attendance/punchSchedule";
import { MapPin, Clock, AlertCircle, CheckCircle2 } from "lucide-react";

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
  } = useApp();

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

  const today = todayDateStr();
  const shift: ShiftType = currentUser
    ? getShiftForDate(today, currentUser.id)
    : "X";

  const slots = useMemo(
    () => (shift === "X" ? [] : getPunchSlotsForShift(shift, shiftTimeConfig)),
    [shift, shiftTimeConfig]
  );

  const todayPunches = currentUser ? getTodayPunchRecords(currentUser.id, today) : [];
  const completedKeys = new Set(
    todayPunches.map((p) => `${p.action}-${p.segmentIndex}`)
  );

  const nextSlot = slots.find((slot) => !completedKeys.has(punchKey(slot)));

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
      // 高精度失敗（POSITION_UNAVAILABLE 或 TIMEOUT），改用低精度（WiFi/基地台定位）
      if (highAccuracy && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) {
        const fallbackId = navigator.geolocation.watchPosition(
          handlePosition,
          (fallbackError) => {
            console.error("Fallback GPS error:", fallbackError.code);
            setGpsState("denied");
          },
          { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 }
        );
        // 儲存 fallback watchId 供 cleanup 用
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
    (slot: PunchSlot, reason?: string, lateMinutes = 0) => {
      if (!currentUser || !coords) return;

      addPunchRecord({
        employeeId: currentUser.id,
        employeeName: currentUser.name,
        date: today,
        action: slot.action,
        segmentIndex: slot.segmentIndex,
        time: formatNowTime(),
        shift,
        lateMinutes,
        reason,
        latitude: coords.lat,
        longitude: coords.lng,
      });

      if (lateMinutes > 0 && reason) {
        addTardinessRecord({
          employeeId: currentUser.id,
          employeeName: currentUser.name,
          date: today,
          minutes: lateMinutes,
          notes: `打卡遲到（${slot.label} ${slot.scheduledTime}）：${reason}`,
        });
      }
    },
    [addPunchRecord, addTardinessRecord, coords, currentUser, shift, today]
  );

  const validateAndPunch = (slot: PunchSlot) => {
    if (!currentUser || !coords) return;
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
      const lateMinutes = calcLateMinutes(actual, scheduled);
      if (minutesLate >= 30) {
        const go = window.confirm(
          `您已遲到 ${minutesLate} 分鐘，請改申請請假。是否前往請假申請頁面？`
        );
        if (go) router.push("/applications/leave");
        return;
      }

      if (lateMinutes > 0) {
        setPendingSlot(slot);
        setLateModal({ slot, lateMinutes });
        return;
      }

      finalizePunch(slot);
      return;
    }

    if (slot.action === "work_out") {
      const minutesPastEnd = minutesDiff(actual, scheduled);
      if (minutesPastEnd >= 10) {
        const go = window.confirm(
          `已超過下班時間 ${minutesPastEnd} 分鐘，請申請加班。是否前往加班申請頁面？`
        );
        if (go) router.push("/applications/overtime");
        return;
      }
      finalizePunch(slot);
    }
  };

  const submitLateReason = () => {
    if (!lateModal || !pendingSlot) return;
    if (!lateReason.trim()) {
      alert("請填寫遲到原因，店長會在遲到管理中看到");
      return;
    }
    finalizePunch(pendingSlot, lateReason.trim(), lateModal.lateMinutes);
    setLateModal(null);
    setLateReason("");
    setPendingSlot(null);
  };

  if (!currentUser) return null;

  const breakCount = shift !== "X" ? getBreakCountForShift(shift) : 0;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-gray-900">上下班打卡</h2>

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
            可提早 10 分鐘打卡；遲到第 6 分鐘起算；遲到 30 分鐘請改請假；下班後第 10 分鐘起請申請加班
          </p>
        )}
      </div>

      {shift === "X" ? (
        <div className="app-card p-6 text-center text-gray-600">今日為休假，無需打卡</div>
      ) : (
        <>
          {nextSlot ? (
            <button
              type="button"
              onClick={() => validateAndPunch(nextSlot)}
              disabled={gpsState !== "inside"}
              className="w-full py-4 rounded-xl bg-blue-600 text-white text-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {nextSlot.label}
              <span className="block text-sm font-normal opacity-90">
                預定 {nextSlot.scheduledTime}
              </span>
            </button>
          ) : (
            <div className="app-card p-6 text-center text-emerald-700 font-medium">
              今日打卡已完成
            </div>
          )}

          <div className="app-card p-4">
            <h3 className="font-medium text-gray-900 mb-3">今日打卡進度</h3>
            <ul className="space-y-2">
              {slots.map((slot) => {
                const done = completedKeys.has(punchKey(slot));
                return (
                  <li
                    key={punchKey(slot)}
                    className={`flex justify-between text-sm rounded-lg px-3 py-2 ${
                      done ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    <span>{slot.label}</span>
                    <span>
                      {slot.scheduledTime}
                      {done ? " ✓" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {todayPunches.length > 0 && (
            <div className="app-card p-4">
              <h3 className="font-medium text-gray-900 mb-2">打卡紀錄</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                {todayPunches.map((p: PunchRecord) => (
                  <li key={p.id} className="border-b pb-2 last:border-0">
                    {p.time} {p.action === "work_in" ? "上班" : "下班"}（{p.shift} 段
                    {p.segmentIndex + 1}）
                    {p.lateMinutes > 0 && (
                      <span className="text-amber-700 block">遲到 {p.lateMinutes} 分鐘</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

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
                onClick={submitLateReason}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                確認打卡
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
