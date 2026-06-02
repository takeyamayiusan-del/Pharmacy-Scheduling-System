'use client';

import { useState } from 'react';

export default function AttendancePage() {
  const [currentDate] = useState(new Date(2026, 4, 1));
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const mockStats = [
    { name: '佾珊', days: 22, hours: 176, overtimePay: 4, compensatory: 8, leave: 0 },
    { name: '宜孝', days: 21, hours: 168, overtimePay: 0, compensatory: 0, leave: 8 },
    { name: '貞葶', days: 22, hours: 176, overtimePay: 6, compensatory: 0, leave: 0 },
    { name: '聖文', days: 20, hours: 160, overtimePay: 0, compensatory: 4, leave: 0 },
    { name: '桂香', days: 21, hours: 168, overtimePay: 2, compensatory: 0, leave: 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="p-2 border rounded hover:bg-gray-50">◀</button>
          <h2 className="text-2xl font-bold text-gray-900">{year}年{month}月 工時統計</h2>
          <button className="p-2 border rounded hover:bg-gray-50">▶</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 text-left text-sm font-medium text-gray-700">員工</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">上班天數</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">上班時數</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">加班費</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">補休</th>
              <th className="p-4 text-center text-sm font-medium text-gray-700">請假</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {mockStats.map((stat) => (
              <tr key={stat.name} className="hover:bg-gray-50">
                <td className="p-4 text-left font-medium text-gray-900">{stat.name}</td>
                <td className="p-4 text-center text-gray-600">{stat.days}天</td>
                <td className="p-4 text-center text-gray-600">{stat.hours}小時</td>
                <td className="p-4 text-center text-blue-600 font-medium">{stat.overtimePay}小時</td>
                <td className="p-4 text-center text-green-600 font-medium">{stat.compensatory}小時</td>
                <td className="p-4 text-center text-red-600 font-medium">{stat.leave}小時</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
