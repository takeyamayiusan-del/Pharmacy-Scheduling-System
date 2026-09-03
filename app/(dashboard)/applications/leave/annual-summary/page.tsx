'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { canManageSite } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { HelpTip } from '@/components/ui/HelpTip';
import { useRouter } from 'next/navigation';
import { Settings, Plus, Trash2, Save } from 'lucide-react';
import {
  annualLeaveDaysToHours,
  getMonthsOfService,
  hasCustomAnnualLeaveLadder,
  statutoryAnnualLeaveDays,
  statutoryAnnualLeaveTiers,
} from '@/lib/attendance/annualLeave';

export default function AnnualLeaveSummaryPage() {
  const { 
    employees, currentUser, 
    getAnnualLeaveQuota, getAnnualLeaveBalance,
    annualLeaveConfigs, setAnnualLeaveConfigs, annualLeaveAdjustments,
    loadAnnualLeaveConfigs, loadAnnualLeaveAdjustments,
    updateAnnualLeaveConfig, applyStatutoryAnnualLeaveTiers,
    addAnnualLeaveAdjustment, deleteAnnualLeaveAdjustment,
    getTotalAdjustmentDays, activeSiteId, storeConfig
  } = useApp();
  const hoursPerDay = Math.max(1, storeConfig.policies.leaveHoursPerDay || 8);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState<string | null>(null);
  const [adjustmentDays, setAdjustmentDays] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const router = useRouter();
  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;

  const isManager = canManageSite(currentUser?.role);

  useEffect(() => {
    loadAnnualLeaveConfigs(selectedYear);
  }, [selectedYear, loadAnnualLeaveConfigs]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`annual-leave-config-open:${storageScope}`);
      if (saved === "1") setShowConfigPanel(true);
      if (saved === "0") setShowConfigPanel(false);
    } catch {
      // ignore storage read errors
    }
  }, [storageScope]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`annual-leave-config-open:${storageScope}`, showConfigPanel ? "1" : "0");
    } catch {
      // ignore storage write errors
    }
  }, [showConfigPanel, storageScope]);

  useEffect(() => {
    if (isManager && displayEmployees.length > 0) {
      // 載入所有員工的調整記錄
      displayEmployees.forEach(emp => {
        loadAnnualLeaveAdjustments(emp.id, selectedYear);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, isManager, loadAnnualLeaveAdjustments]);

  const displayEmployees = isManager 
    ? employees.filter(e => e.role !== 'owner') 
    : employees.filter(e => e.id === currentUser?.id);

  const toROC = (westernYear: number) => westernYear - 1911;

  const currentYearConfigs = annualLeaveConfigs.filter(c => c.year === selectedYear);
  const usesCustomLadder = hasCustomAnnualLeaveLadder(currentYearConfigs);
  const statutoryPreviewTiers = statutoryAnnualLeaveTiers().filter(
    (t) => t.seniorityMonths <= 60 || t.seniorityMonths === 120
  );

  const handleSaveConfig = async (id: string, days: number) => {
    await updateAnnualLeaveConfig(id, days);
  };

  const handleApplyStatutory = async () => {
    if (
      !confirm(
        `將 ${selectedYear} 年特休階梯改為勞基法第38條（滿2年10日、3年14日、5年15日，十年起每年加1日至30日）？店家仍可再改天數。`
      )
    ) {
      return;
    }
    try {
      await applyStatutoryAnnualLeaveTiers(selectedYear);
      alert("已套用勞基法第38條特休階梯");
    } catch (err) {
      alert(err instanceof Error ? err.message : "套用失敗");
    }
  };

  const handleAddAdjustment = async (userId: string) => {
    if (adjustmentDays === 0) return;
    await addAnnualLeaveAdjustment(userId, selectedYear, adjustmentDays, adjustmentReason);
    setAdjustmentDays(0);
    setAdjustmentReason('');
    setShowAdjustmentModal(null);
  };

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <div>
          <h1 className="app-page-title">年度特休總表</h1>
          <p className="app-meta mt-1">
            特休依入職日自動套勞基法第38條，不必自設級距。配額以天數給、請假以時數扣（預設一日 {hoursPerDay} 小時）。未休完應排休或折算工資；個別加減天數用「調整」。
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isManager && (
            <Button 
              variant="outline" 
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              特休規則設定
            </Button>
          )}
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white/90"
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>{y}年（民國{toROC(y)}年）</option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => router.back()}>返回</Button>
        </div>
      </div>

      {/* 特休規則設定面板（僅管理者可見） */}
      {isManager && (
        <CollapsibleCard
          className="app-panel p-6"
          title={
            <span className="inline-flex items-center gap-2">
              <Settings className="h-5 w-5" />
              特休規則設定
            </span>
          }
          subtitle={`${selectedYear} 年度特休規則與配額`}
          open={showConfigPanel}
          onToggle={() => setShowConfigPanel((v) => !v)}
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {selectedYear} 年度特休規則設定
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            一般店家不必填級距：系統依入職日自動用勞基法第38條（半年3、1年7、2年10、3年14、5年15，十年起每年加1日至30）。
            只有要比法定更好或更差時，才按下面「套用後再改天數」。未休完應排休或折算工資，不是自動作廢。
          </p>
          {!usesCustomLadder ? (
            <>
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-4">
                本店目前沒有自設級距，員工特休已依入職日自動套用下列法定天數。
              </p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">年資條件</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">說明</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-700">天數</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {statutoryPreviewTiers.map((tier) => (
                      <tr key={tier.seniorityMonths} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {tier.seniorityMonths === 0 && "入職未滿半年"}
                          {tier.seniorityMonths === 6 && "滿半年（6 個月）"}
                          {tier.seniorityMonths === 12 && "滿一年（12 個月）"}
                          {tier.seniorityMonths > 12 && `滿 ${tier.seniorityMonths / 12} 年`}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{tier.description}</td>
                        <td className="px-4 py-3 text-center font-medium">{tier.days} 天</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                滿十年起每年再加 1 天，加至 30 天。若要比法定不同，可先套用階梯再改天數。
              </p>
              <Button variant="outline" onClick={() => void handleApplyStatutory()}>
                改為自設級距（先套用法定階梯）
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="mb-4" onClick={() => void handleApplyStatutory()}>
                套用勞基法第38條階梯
              </Button>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">年資條件</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">說明</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-700">天數</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {currentYearConfigs.map((config) => (
                      <tr key={config.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {config.seniorityMonths === 0 && "入職未滿半年"}
                          {config.seniorityMonths === 6 && "滿半年（6 個月）"}
                          {config.seniorityMonths === 12 && "滿一年（12 個月）"}
                          {config.seniorityMonths > 12 && `滿 ${config.seniorityMonths} 個月`}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{config.description || "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="30"
                              value={config.days}
                              onChange={(e) => {
                                const newDays = Number(e.target.value);
                                setAnnualLeaveConfigs((prev) =>
                                  prev.map((c) => (c.id === config.id ? { ...c, days: newDays } : c))
                                );
                              }}
                              className="w-20 px-2 py-1 border rounded text-center"
                            />
                            <span className="text-gray-500">天</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            onClick={() => handleSaveConfig(config.id, config.days)}
                            className="flex items-center gap-1 mx-auto"
                          >
                            <Save className="h-3 w-3" />
                            儲存
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CollapsibleCard>
      )}

      {/* 員工特休總表 */}
      <div className="app-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-700">員工姓名</th>
                <th className="px-6 py-4 font-semibold text-gray-700">入職日期</th>
                <th className="px-6 py-4 font-semibold text-gray-700">基本配額</th>
                <th className="px-6 py-4 font-semibold text-gray-700">調整</th>
                <th className="px-6 py-4 font-semibold text-gray-700">已休（天／時）</th>
                <th className="px-6 py-4 font-semibold text-gray-700">剩餘（天／時）</th>
                <th className="px-6 py-4 font-semibold text-gray-700">備註</th>
                {isManager && <th className="px-6 py-4 font-semibold text-gray-700">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayEmployees.map((emp) => {
                const baseQuota = getAnnualLeaveQuota(emp, selectedYear);
                const adjustment = getTotalAdjustmentDays(emp.id, selectedYear);
                const totalQuota = baseQuota + adjustment;
                const balance = getAnnualLeaveBalance(emp.id, selectedYear);
                const used = totalQuota - balance;
                const usedHours = annualLeaveDaysToHours(used, hoursPerDay);
                const balanceHours = annualLeaveDaysToHours(balance, hoursPerDay);
                const quotaHours = annualLeaveDaysToHours(totalQuota, hoursPerDay);
                const empAdjustments = annualLeaveAdjustments.filter(a => a.userId === emp.id && a.year === selectedYear);
                
                return (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-6 py-4 text-gray-600">{emp.hireDate}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                        {baseQuota} 天（{annualLeaveDaysToHours(baseQuota, hoursPerDay)} h）
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {adjustment !== 0 && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${adjustment > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {adjustment > 0 ? '+' : ''}{adjustment} 天
                        </span>
                      )}
                      {empAdjustments.length > 0 && (
                        <div className="mt-1 text-xs text-gray-400">
                          {empAdjustments.map(a => (
                            <div key={a.id} className="flex items-center gap-1">
                              <span>{a.adjustmentDays > 0 ? '+' : ''}{a.adjustmentDays}天</span>
                              {a.reason && <span className="text-gray-500">({a.reason})</span>}
                              {isManager && (
                                <button 
                                  onClick={() => deleteAnnualLeaveAdjustment(a.id)}
                                  className="text-red-500 hover:text-red-700 ml-1"
                                  type="button"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-orange-600 font-medium">
                      {used.toFixed(2)} 天／{usedHours} h
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-bold ${balance > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {balance.toFixed(2)} 天／{balanceHours} h
                      </span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        配額合計 {totalQuota} 天＝{quotaHours} h（一日 {hoursPerDay} h）
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {(() => {
                        const months = getMonthsOfService(
                          emp.hireDate,
                          selectedYear === new Date().getFullYear()
                            ? new Date()
                            : new Date(selectedYear, 11, 31)
                        );
                        const statutory = statutoryAnnualLeaveDays(months);
                        if (months < 6) return "未滿半年";
                        return `年資約 ${months} 個月；勞基對照 ${statutory} 天`;
                      })()}
                    </td>
                    {isManager && (
                      <td className="px-6 py-4">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setShowAdjustmentModal(emp.id)}
                          className="flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          調整
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 調整特休 Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="app-panel shadow-xl w-full max-w-md">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold">調整特休天數</h3>
              <button onClick={() => setShowAdjustmentModal(null)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  調整天數（正數為增加，負數為減少）
                </label>
                <input
                  type="number"
                  value={adjustmentDays}
                  onChange={(e) => setAdjustmentDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="例如：1 或 -1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  原因（選填）
                </label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="例如：補貼加班、特殊獎勵"
                />
              </div>
            </div>
            <div className="p-4 border-t flex gap-3">
              <Button variant="secondary" onClick={() => setShowAdjustmentModal(null)} className="flex-1">
                取消
              </Button>
              <Button onClick={() => handleAddAdjustment(showAdjustmentModal)} className="flex-1">
                確認調整
              </Button>
            </div>
          </div>
        </div>
      )}

      <HelpTip title="特休計算規則說明" hint="勞基法第38條級距">
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>本店<strong>不必自設級距</strong>：依入職日自動套勞基法第38條。</li>
          <li>未滿 6 個月：0 天；滿 6 個月：3 天；滿 1 年：7 天；滿 2 年：10 天；滿 3 年：14 天；滿 5 年：15 天。</li>
          <li>滿 10 年起每年加 1 天，加至 30 天。</li>
          <li>年度配額依年資重算。未休完應排休或折算工資，不是自動作廢。</li>
          <li>若要遞延至次年，請走店規開放的「假別遞延」申請。</li>
          <li>某人要加減天數：用個別「調整」。進階級距表僅在要比法定不同時才需要。</li>
        </ul>
      </HelpTip>
    </div>
  );
}
