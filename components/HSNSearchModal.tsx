import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Info, CheckCircle } from 'lucide-react';
import { searchHSN, type HSNEntry } from '../lib/hsnData';

interface HSNSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: string, description: string, gstRate: number) => void;
  minDigits: number;
  currentValue?: string;
}

export default function HSNSearchModal({
  isOpen,
  onClose,
  onSelect,
  minDigits,
  currentValue = '',
}: HSNSearchModalProps) {
  const [query, setQuery] = useState(currentValue);
  const [results, setResults] = useState<HSNEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(currentValue);
      setResults(searchHSN(currentValue, 30));
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, currentValue]);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setResults(searchHSN(q, 30));
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1">
            <h2 className="text-base font-black text-slate-800">HSN / SAC Code Search</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {minDigits === 6
                ? 'Your turnover requires a minimum 6-digit HSN code'
                : 'Minimum 4-digit HSN code required'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by code (e.g. 7214) or keyword (e.g. steel bar)"
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          {/* Digit requirement badge */}
          <div className="flex items-center gap-1.5 mt-2">
            <Info size={12} className="text-amber-500 flex-shrink-0" />
            <span className="text-[11px] text-amber-600">
              Min. <strong>{minDigits} digits</strong> required for your business turnover (GST Phase 3)
            </span>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No HSN codes found</p>
              <p className="text-xs mt-1">Try searching by code number or item keyword</p>
            </div>
          ) : (
            <div>
              {results.map(entry => {
                const isValid = entry.code.length >= minDigits;
                return (
                  <button
                    key={entry.code}
                    type="button"
                    onClick={() => {
                      onSelect(entry.code, entry.description, entry.gstRate);
                      onClose();
                    }}
                    className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors text-left group"
                  >
                    {/* Code badge */}
                    <div className="flex-shrink-0 mt-0.5">
                      <span
                        className={`inline-block font-mono text-xs font-bold px-2 py-1 rounded-lg ${
                          isValid
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {entry.code}
                        {!isValid && (
                          <span className="ml-1 text-[9px] font-normal">(short)</span>
                        )}
                      </span>
                    </div>

                    {/* Description & meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-900 leading-tight">
                        {entry.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-400">{entry.chapter}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                        <span
                          className={`text-[11px] font-bold ${
                            entry.gstRate === 0
                              ? 'text-emerald-600'
                              : entry.gstRate <= 5
                              ? 'text-blue-600'
                              : entry.gstRate <= 12
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          GST {entry.gstRate}%
                        </span>
                      </div>
                    </div>

                    {/* Select indicator */}
                    <CheckCircle
                      size={16}
                      className="flex-shrink-0 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity mt-1"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 text-center">
            Tap any result to fill HSN code, description and GST rate automatically
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Inline HSN Input with autocomplete dropdown ──────────────────────────────

interface HSNInputProps {
  value: string;
  onChange: (code: string) => void;
  onSelectEntry?: (code: string, description: string, gstRate: number) => void;
  minDigits: number;
  className?: string;
  placeholder?: string;
  onOpenModal?: () => void;
}

export function HSNInput({
  value,
  onChange,
  onSelectEntry,
  minDigits,
  className = '',
  placeholder = 'e.g. 9954',
  onOpenModal,
}: HSNInputProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<HSNEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleChange = (v: string) => {
    onChange(v);
    if (v.trim().length >= 2) {
      setSuggestions(searchHSN(v, 8));
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleSelect = (entry: HSNEntry) => {
    onChange(entry.code);
    onSelectEntry?.(entry.code, entry.description, entry.gstRate);
    setOpen(false);
  };

  const tooShort = value.trim().length > 0 && value.trim().length < minDigits;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => {
            if (value.trim().length >= 2) {
              setSuggestions(searchHSN(value, 8));
              setOpen(true);
            }
          }}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          placeholder={placeholder}
          className={className}
        />
        {/* Search icon button */}
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onOpenModal?.(); }}
          title="Search HSN codes"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex-shrink-0"
        >
          <Search size={14} />
        </button>
      </div>

      {/* Digit warning */}
      {tooShort && (
        <p className="absolute -bottom-4 left-0 text-[10px] text-amber-500 font-medium whitespace-nowrap">
          Min {minDigits} digits required
        </p>
      )}

      {/* Inline dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map(entry => (
            <button
              key={entry.code}
              type="button"
              onMouseDown={() => handleSelect(entry)}
              className="w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors text-left"
            >
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
                {entry.code}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 leading-tight truncate">
                  {entry.description}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {entry.chapter} · GST {entry.gstRate}%
                </p>
              </div>
            </button>
          ))}
          {onOpenModal && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setOpen(false); onOpenModal(); }}
              className="w-full px-4 py-2.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 transition-colors border-t border-indigo-50"
            >
              <Search size={12} /> Search all HSN codes…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
