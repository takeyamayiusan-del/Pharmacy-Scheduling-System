import type { ShiftCode } from '@/lib/supabase/types';

interface ShiftCellProps {
  shiftCode: ShiftCode;
  isFixed?: boolean;
  isLocked?: boolean;
  onClick?: () => void;
  editable?: boolean;
}

const shiftColors: Record<ShiftCode, string> = {
  A: 'bg-blue-100 text-blue-800 border-blue-300',
  B: 'bg-green-100 text-green-800 border-green-300',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  D: 'bg-purple-100 text-purple-800 border-purple-300',
  E: 'bg-pink-100 text-pink-800 border-pink-300',
  X: 'bg-gray-100 text-gray-500 border-gray-300',
};

export function ShiftCell({ shiftCode, isFixed, isLocked, onClick, editable }: ShiftCellProps) {
  return (
    <div
      onClick={editable && !isLocked && !isFixed ? onClick : undefined}
      className={`
        w-full h-10 flex items-center justify-center rounded border-2 text-sm font-medium
        ${shiftColors[shiftCode]}
        ${isFixed ? 'border-dashed' : 'border-solid'}
        ${isLocked ? 'opacity-60' : ''}
        ${editable && !isLocked && !isFixed ? 'cursor-pointer hover:ring-2 hover:ring-blue-400' : ''}
      `}
    >
      <span>{shiftCode}</span>
      {isFixed && <span className="ml-1 text-xs">🔒</span>}
    </div>
  );
}
