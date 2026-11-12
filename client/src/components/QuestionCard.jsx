import { Check, X } from 'lucide-react';
import { cn } from '../utils/cn.js';

const LETTERS = ['A', 'B', 'C', 'D'];

// Renders one question with 4 options.
// States: idle (clickable) → locked (waiting for reveal) → revealed (correct green / my wrong pick red).
export default function QuestionCard({
  text,
  options = [],
  selectedIndex = null,
  locked = false,
  reveal = null, // { correctIndex, myPick }
  onSelect,
  difficulty,
}) {
  const revealed = !!reveal;

  const optionClass = (idx) => {
    if (revealed) {
      if (idx === reveal.correctIndex)
        return 'border-green-400/70 bg-green-500/15 text-green-100 shadow-green-500/10';
      if (idx === reveal.myPick && reveal.myPick !== reveal.correctIndex)
        return 'border-red-400/70 bg-red-500/15 text-red-100';
      return 'border-navy-700 bg-navy-800/60 text-slate-500';
    }
    if (locked) {
      return idx === selectedIndex
        ? 'border-brand-blue/70 bg-brand-blue/15 text-white'
        : 'border-navy-700 bg-navy-800/60 text-slate-500';
    }
    return 'border-navy-600 bg-navy-800 text-slate-100 hover:border-brand-blue/70 hover:bg-navy-700 active:scale-[0.99]';
  };

  return (
    <div className="card-pad animate-fade-slide-in">
      <div className="mb-1 flex items-center justify-between">
        {difficulty && (
          <span className="rounded-full bg-navy-700 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            {difficulty}
          </span>
        )}
        {revealed && (
          <span
            className={cn(
              'text-sm font-bold',
              reveal.myPick === reveal.correctIndex ? 'text-green-400' : 'text-red-400'
            )}
          >
            {reveal.myPick === reveal.correctIndex ? 'Correct!' : reveal.myPick == null ? "Time's up!" : 'Wrong'}
          </span>
        )}
      </div>
      <h2 className="mb-5 text-lg font-bold leading-snug text-white sm:text-xl">{text}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((opt, idx) => (
          <button
            key={idx}
            type="button"
            disabled={locked || revealed}
            onClick={() => onSelect && onSelect(idx)}
            className={cn(
              'flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium shadow-lg transition sm:text-base',
              optionClass(idx),
              !locked && !revealed && 'cursor-pointer'
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold',
                revealed && idx === reveal.correctIndex
                  ? 'bg-green-500 text-navy-950'
                  : revealed && idx === reveal.myPick && reveal.myPick !== reveal.correctIndex
                    ? 'bg-red-500 text-white'
                    : 'bg-navy-700 text-slate-300'
              )}
            >
              {revealed && idx === reveal.correctIndex ? (
                <Check className="h-4 w-4" />
              ) : revealed && idx === reveal.myPick && reveal.myPick !== reveal.correctIndex ? (
                <X className="h-4 w-4" />
              ) : (
                LETTERS[idx]
              )}
            </span>
            <span className="flex-1">{opt}</span>
          </button>
        ))}
      </div>
      {locked && !revealed && (
        <p className="mt-4 text-center text-sm text-brand-blue">Answer locked — waiting for the reveal…</p>
      )}
    </div>
  );
}
