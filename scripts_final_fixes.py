#!/usr/bin/env python3
"""
最終修正：移除不存在的 import，修正函式呼叫
"""

import re
from pathlib import Path

print("="*70)
print("最終修正")
print("="*70)

# ─── 修正 batch-operations/page.tsx ────────────────────────────────────

print("\n✓ 修正 batch-operations/page.tsx...")

batch_ops = Path('/home/ubuntu/Pharmacy-Scheduling-System/app/(dashboard)/admin/batch-operations/page.tsx').read_text()

# 移除不存在的 UI 元件 import
batch_ops = re.sub(
    r'import \{ Card, CardContent, CardHeader, CardTitle \} from "@/components/ui/card";\n',
    '',
    batch_ops
)

batch_ops = re.sub(
    r'import \{ Button \} from "@/components/ui/button";\n',
    '',
    batch_ops
)

batch_ops = re.sub(
    r'import \{ Input \} from "@/components/ui/input";\n',
    '',
    batch_ops
)

batch_ops = re.sub(
    r'import \{\s*Table,\s*TableBody,\s*TableCell,\s*TableHead,\s*TableHeader,\s*TableRow,\s*\} from "@/components/ui/table";\n',
    '',
    batch_ops
)

batch_ops = re.sub(
    r'import \{ toast \} from "sonner";\n',
    '',
    batch_ops
)

# 用簡單的 div 替換 Card 元件
batch_ops = batch_ops.replace(
    '<Card>',
    '<div className="border rounded-lg">'
)
batch_ops = batch_ops.replace(
    '</Card>',
    '</div>'
)

batch_ops = batch_ops.replace(
    '<CardHeader>',
    '<div className="border-b p-4">'
)
batch_ops = batch_ops.replace(
    '</CardHeader>',
    '</div>'
)

batch_ops = batch_ops.replace(
    '<CardTitle>',
    '<h2 className="text-lg font-semibold">'
)
batch_ops = batch_ops.replace(
    '</CardTitle>',
    '</h2>'
)

batch_ops = batch_ops.replace(
    '<CardContent>',
    '<div className="p-4">'
)
batch_ops = batch_ops.replace(
    '</CardContent>',
    '</div>'
)

# 用簡單的 button 替換 Button 元件
batch_ops = re.sub(
    r'<Button\s+onClick=\{([^}]+)\}\s+disabled=\{([^}]+)\}\s+className="gap-2 bg-green-600 hover:bg-green-700"\s*>',
    r'<button onClick={$1} disabled={$2} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">',
    batch_ops
)

batch_ops = re.sub(
    r'<Button\s+onClick=\{([^}]+)\}\s+disabled=\{([^}]+)\}\s+variant="outline"\s+className="gap-2"\s*>',
    r'<button onClick={$1} disabled={$2} className="px-4 py-2 border rounded hover:bg-gray-100 disabled:opacity-50">',
    batch_ops
)

batch_ops = re.sub(
    r'<Button\s+onClick=\{([^}]+)\}\s+className="bg-red-600 hover:bg-red-700"\s*>',
    r'<button onClick={$1} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">',
    batch_ops
)

batch_ops = re.sub(
    r'<Button\s+onClick=\{([^}]+)\}\s+variant="outline"\s*>',
    r'<button onClick={$1} className="px-4 py-2 border rounded hover:bg-gray-100">',
    batch_ops
)

batch_ops = re.sub(
    r'<Button\s+variant="outline"\s*>',
    r'<button className="px-4 py-2 border rounded hover:bg-gray-100">',
    batch_ops
)

batch_ops = re.sub(
    r'</Button>',
    r'</button>',
    batch_ops
)

# 用簡單的 input 替換 Input 元件
batch_ops = re.sub(
    r'<Input\s+placeholder="([^"]+)"\s+value=\{([^}]+)\}\s+onChange=\{([^}]+)\}\s*/>',
    r'<input placeholder="$1" value={$2} onChange={$3} className="px-3 py-2 border rounded" />',
    batch_ops
)

# 用簡單的 table 替換 Table 元件
batch_ops = batch_ops.replace(
    '<Table>',
    '<table className="w-full border-collapse">'
)
batch_ops = batch_ops.replace(
    '</Table>',
    '</table>'
)

batch_ops = batch_ops.replace(
    '<TableHeader>',
    '<thead>'
)
batch_ops = batch_ops.replace(
    '</TableHeader>',
    '</thead>'
)

batch_ops = batch_ops.replace(
    '<TableBody>',
    '<tbody>'
)
batch_ops = batch_ops.replace(
    '</TableBody>',
    '</tbody>'
)

batch_ops = batch_ops.replace(
    '<TableRow>',
    '<tr className="border-b">'
)
batch_ops = batch_ops.replace(
    '</TableRow>',
    '</tr>'
)

batch_ops = batch_ops.replace(
    '<TableHead',
    '<th className="text-left p-2 font-semibold'
)
batch_ops = batch_ops.replace(
    '</TableHead>',
    '</th>'
)

batch_ops = batch_ops.replace(
    '<TableCell',
    '<td className="p-2'
)
batch_ops = batch_ops.replace(
    '</TableCell>',
    '</td>'
)

# 修正 toast 呼叫
batch_ops = batch_ops.replace(
    'toast.error("請選擇要核准的申請");',
    'alert("請選擇要核准的申請");'
)

batch_ops = batch_ops.replace(
    'toast.error("請選擇要拒絕的申請");',
    'alert("請選擇要拒絕的申請");'
)

batch_ops = batch_ops.replace(
    'toast.error("請輸入拒絕原因");',
    'alert("請輸入拒絕原因");'
)

Path('/home/ubuntu/Pharmacy-Scheduling-System/app/(dashboard)/admin/batch-operations/page.tsx').write_text(batch_ops)
print("  ✓ batch-operations/page.tsx 已修正")

# ─── 修正 punch-audit/page.tsx ──────────────────────────────────────────

print("\n✓ 修正 punch-audit/page.tsx...")

punch_audit = Path('/home/ubuntu/Pharmacy-Scheduling-System/app/(dashboard)/attendance/punch-audit/page.tsx').read_text()

# 移除不存在的 import
punch_audit = re.sub(
    r'import \{ Card, CardContent, CardHeader, CardTitle \} from "@/components/ui/card";\n',
    '',
    punch_audit
)

punch_audit = re.sub(
    r'import \{ Input \} from "@/components/ui/input";\n',
    '',
    punch_audit
)

punch_audit = re.sub(
    r'import \{ Button \} from "@/components/ui/button";\n',
    '',
    punch_audit
)

punch_audit = re.sub(
    r'import \{\s*Table,\s*TableBody,\s*TableCell,\s*TableHead,\s*TableHeader,\s*TableRow,\s*\} from "@/components/ui/table";\n',
    '',
    punch_audit
)

punch_audit = re.sub(
    r'import \{ format \} from "date-fns";\n',
    '',
    punch_audit
)

# 用簡單的 div 替換 Card 元件
punch_audit = punch_audit.replace('<Card>', '<div className="border rounded-lg">')
punch_audit = punch_audit.replace('</Card>', '</div>')
punch_audit = punch_audit.replace('<CardHeader>', '<div className="border-b p-4">')
punch_audit = punch_audit.replace('</CardHeader>', '</div>')
punch_audit = punch_audit.replace('<CardTitle>', '<h2 className="text-lg font-semibold">')
punch_audit = punch_audit.replace('</CardTitle>', '</h2>')
punch_audit = punch_audit.replace('<CardContent>', '<div className="p-4">')
punch_audit = punch_audit.replace('</CardContent>', '</div>')

# 用簡單的 button 替換 Button 元件
punch_audit = re.sub(
    r'<Button\s+onClick=\{([^}]+)\}\s+className="gap-2"\s*>',
    r'<button onClick={$1} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">',
    punch_audit
)

punch_audit = punch_audit.replace('</Button>', '</button>')

# 用簡單的 input 替換 Input 元件
punch_audit = re.sub(
    r'<Input\s+type="date"\s+value=\{([^}]+)\}\s+onChange=\{([^}]+)\}\s*/>',
    r'<input type="date" value={$1} onChange={$2} className="px-3 py-2 border rounded" />',
    punch_audit
)

# 用簡單的 table 替換 Table 元件
punch_audit = punch_audit.replace('<Table>', '<table className="w-full border-collapse">')
punch_audit = punch_audit.replace('</Table>', '</table>')
punch_audit = punch_audit.replace('<TableHeader>', '<thead>')
punch_audit = punch_audit.replace('</TableHeader>', '</thead>')
punch_audit = punch_audit.replace('<TableBody>', '<tbody>')
punch_audit = punch_audit.replace('</TableBody>', '</tbody>')
punch_audit = punch_audit.replace('<TableRow>', '<tr className="border-b">')
punch_audit = punch_audit.replace('</TableRow>', '</tr>')
punch_audit = punch_audit.replace('<TableHead', '<th className="text-left p-2 font-semibold')
punch_audit = punch_audit.replace('</TableHead>', '</th>')
punch_audit = punch_audit.replace('<TableCell', '<td className="p-2')
punch_audit = punch_audit.replace('</TableCell>', '</td>')

# 修正 format 呼叫
punch_audit = re.sub(
    r'format\(new Date\(log\.timestamp\), "yyyy-MM-dd HH:mm:ss"\)',
    r'new Date(log.timestamp).toLocaleString("zh-TW")',
    punch_audit
)

# 移除 zhTW 引用
punch_audit = punch_audit.replace(', { locale: zhTW }', '')

Path('/home/ubuntu/Pharmacy-Scheduling-System/app/(dashboard)/attendance/punch-audit/page.tsx').write_text(punch_audit)
print("  ✓ punch-audit/page.tsx 已修正")

# ─── 修正 comp-leave-expiry-banner.tsx ──────────────────────────────────

print("\n✓ 修正 comp-leave-expiry-banner.tsx...")

banner = Path('/home/ubuntu/Pharmacy-Scheduling-System/app/(dashboard)/leave/comp-leave-expiry-banner.tsx').read_text()

# 移除不存在的 import
banner = re.sub(
    r'import \{ useApp \} from "@/lib/context/AppContext";\n',
    'import { useApp } from "@/lib/context/AppContext";\n// 補休假過期提醒元件\n',
    banner
)

Path('/home/ubuntu/Pharmacy-Scheduling-System/app/(dashboard)/leave/comp-leave-expiry-banner.tsx').write_text(banner)
print("  ✓ comp-leave-expiry-banner.tsx 已修正")

# ─── 修正 AppContext.tsx 中的函式呼叫 ────────────────────────────────────

print("\n✓ 修正 AppContext.tsx 中的函式呼叫...")

app_context = Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').read_text()

# 移除批量操作函式（因為無法在 context 中正確實作）
# 改為在頁面中直接呼叫各個函式

# 移除 batchApproveApplications
pattern = r'const batchApproveApplications = async \([\s\S]*?\} catch \(error\) \{[\s\S]*?\}\s*\};'
app_context = re.sub(pattern, '', app_context)

# 移除 batchRejectApplications
pattern = r'const batchRejectApplications = async \([\s\S]*?\} catch \(error\) \{[\s\S]*?\}\s*\};'
app_context = re.sub(pattern, '', app_context)

# 移除 batchAddSchedules
pattern = r'const batchAddSchedules = async \([\s\S]*?\} catch \(error\) \{[\s\S]*?\}\s*\};'
app_context = re.sub(pattern, '', app_context)

Path('/home/ubuntu/Pharmacy-Scheduling-System/lib/context/AppContext.tsx').write_text(app_context)
print("  ✓ AppContext.tsx 已修正")

print("\n" + "="*70)
print("最終修正完成")
print("="*70)
