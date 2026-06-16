'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Settings, Plus, Trash2, Save } from 'lucide-react';

export default function AnnualLeaveSummaryPage() {
  const { 
    employees, currentUser, 
    getAnnualLeaveQuota, getAnnualLeaveBalance,
    annualLeaveConfigs, annualLeaveAdjustments,
    loadAnnualLeaveConfigs, loadAnnualLeaveAdjustments,
    updateAnnualLeaveConfig, addAnnualLeaveAdjustment, deleteAnnualLeaveAdjustment,
    getTotalAdjustmentDays
  } = useApp();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState<string | null>(null);
  const [adjustmentDays, setAdjustmentDays] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const router = useRouter();

  const isManager = currentUser?.role === 'owner' || currentUser?.role === 'manager';

  useEffect(() => {
    loadAnnualLeaveConfigs(selectedYear);
  }, [selectedYear, loadAnnualLeaveConfigs]);

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

  const handleSaveConfig = async (id: string, days: number) => {
    await updateAnnualLeaveConfig(id, days);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">年度特休總表</h1>
          <p className="text-gray-600 mt-1">查看員工年度特休使用狀況與剩餘天數</p>
        </div>
        <div className="flex items-center gap-3">
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
            className="border rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>{y}年（民國{toROC(y)}年）</option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => router.back()}>返回</Button>
        </div>
      </div>

      {/* 特休規則設定面板（僅管理者可見） */}
      {isManager && showConfigPanel && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {selectedYear} 年度特休規則設定
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            設定不同年資員工的特休天數（前半年 3 天、後半年 4 天 = 第一年共 7 天）
          </p>
          
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
                      {config.seniorityMonths === 0 && '入職未滿半年'}
                      {config.seniorityMonths === 6 && '滿半年（6 個月）'}
                      {config.seniorityMonths === 12 && '滿一年（12 個月）'}
                      {config.seniorityMonths > 12 && `滿 ${config.seniorityMonths} 個月`}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{config.description || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          value={config.days}
                          onChange={(e) => {
                            const newDays = Number(e.target.value);
                            setAnnualLeaveConfigs(prev => 
                              prev.map(c => c.id === config.id ? { ...c, days: newDays } : c)
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
        </div>
      )}

      {/* 員工特休總表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-700">員工姓名</th>
                <th className="px-6 py-4 font-semibold text-gray-700">入職日期</th>
                <th className="px-6 py-4 font-semibold text-gray-700">基本配額</th>
                <th className="px-6 py-4 font-semibold text-gray-700">調整</th>
                <th className="px-6 py-4 font-semibold text-gray-700">已休天數</th>
                <th className="px-6 py-4 font-semibold text-gray-700">剩餘天數</th>
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
                const empAdjustments = annualLeaveAdjustments.filter(a => a.userId === emp.id && a.year === selectedYear);
                
                return (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-6 py-4 text-gray-600">{emp.hireDate}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                        {baseQuota} 天
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
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-orange-600 font-medium">{used.toFixed(1)} 天</td>
                    <td className="px-6 py-4">
                      <span className={`font-bold ${balance > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {balance.toFixed(1)} 天
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {baseQuota >= 7 ? '滿一年' : baseQuota >= 3 ? '滿半年' : '未達半年'}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
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

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">特休計算規則說明：</h3>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>入職滿 6 個月：給予 3 天特休。</li>
          <li>入職滿 1 年：給予 7 天特休。</li>
          <li>滿 2 年及以上：維持 7 天特休。</li>
          <li>每年重置：特休採週年制重置，不管有沒有用完，均不累積至隔年。</li>
          <li>管理者可調整：可針對個別員工增減特休天數，並記錄原因。</li>
        </ul>
      </div>
    </div>
  );
}
