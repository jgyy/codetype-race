"use client";

interface Props {
  disabled?: boolean;
  onClick: () => void;
}

export function StartButton({ disabled, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 min-w-11 rounded bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-50"
    >
      Start race
    </button>
  );
}
