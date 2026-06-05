'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context/AppContext';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function AnnualLeaveSummaryPage() {
  const { employees, currentUser, getAnnualLeaveQuota, getAnnualLeaveBalance } = useApp();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const router = useRouter();

  const isManager = currentUser?.role === 'owner' || currentUser?.role === 'manager';
  const displayEmployees = isManager ? employees.filter(e => e.role !== 'owner') : employees.filter(e => e.id === currentUser?.id);

  const toROC = (westernYear: number) => westernYear - 1911;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">年度特休總表</h1>
          <p className="text-gray-600 mt-1">查看員工年度特休使用狀況與剩餘天數</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}年（民國{toROC(y)}年）</option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => router.back()}>返回</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-700">員工姓名</th>
                <th className="px-6 py-4 font-semibold text-gray-700">入職日期</th>
                <th className="px-6 py-4 font-semibold text-gray-700">年度配額 (天)</th>
                <th className="px-6 py-4 font-semibold text-gray-700">已休天數</th>
                <th className="px-6 py-4 font-semibold text-gray-700">剩餘天數</th>
                <th className="px-6 py-4 font-semibold text-gray-700">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayEmployees.map((emp) => {
                const quota = getAnnualLeaveQuota(emp);
                const balance = getAnnualLeaveBalance(emp.id, selectedYear);
                const used = quota - balance;
                
                return (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-6 py-4 text-gray-600">{emp.hireDate}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                        {quota} 天
                      </span>
                    </td>
                    <td className="px-6 py-4 text-orange-600 font-medium">{used.toFixed(1)} 天</td>
                    <td className="px-6 py-4">
                      <span className={`font-bold ${balance > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {balance.toFixed(1)} 天
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {quota === 7 ? '滿一年' : quota === 3 ? '滿半年' : '未達半年'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">特休計算規則說明：</h3>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>入職滿 6 個月：給予 3 天特休。</li>
          <li>入職滿 1 年：給予 7 天特休。</li>
          <li>滿 2 年及以上：維持 7 天特休。</li>
          <li>每年重置：特休採週年制重置，不管有沒有用完，均不累積至隔年。</li>
        </ul>
      </div>
    </div>
  );
}
