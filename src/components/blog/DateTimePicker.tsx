"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  // Local datetime string, "YYYY-MM-DDTHH:mm" (matches a datetime-local input).
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseLocal(value: string): Date | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  const [y, mo, da] = date.split("-").map(Number);
  const [h, mi] = (time ?? "00:00").split(":").map(Number);
  if (!y || !mo || !da) return null;
  return new Date(y, mo - 1, da, h || 0, mi || 0);
}

function toLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Branded date + time picker (calendar grid in a self-contained dropdown
 * plus hour/minute/meridiem selects) that emits the same
 * "YYYY-MM-DDTHH:mm" local string a datetime-local input would, so it is a
 * drop-in replacement. Avoids the ui/popover primitive, which does not
 * build under Turbopack.
 */
export function DateTimePicker({ value, onChange, id }: DateTimePickerProps) {
  const selected = parseLocal(value);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [view, setView] = useState(() => selected ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  // Open above the trigger when there is not enough room below it (e.g. the
  // schedule field sits near the bottom of the editor). Measured on open.
  function toggle() {
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 380 && rect.top > spaceBelow);
    }
    setOpen((o) => !o);
  }

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const y = view.getFullYear();
  const m = view.getMonth();
  const startPad = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  // Commit a date keeping the current time (default 9:00 AM if unset).
  function pickDay(day: Date) {
    const base = selected;
    const next = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      base ? base.getHours() : 9,
      0,
    );
    onChange(toLocal(next));
  }

  // Commit a time keeping the current (or today's) date.
  function setTime(hours: number, minutes: number) {
    const d = selected ?? new Date();
    const next = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      hours,
      minutes,
    );
    onChange(toLocal(next));
  }

  const hour12 = selected
    ? selected.getHours() % 12 === 0
      ? 12
      : selected.getHours() % 12
    : 9;
  const isPm = selected ? selected.getHours() >= 12 : false;

  // Scheduling is constrained to whole hours: the publish cron runs at the
  // top of each hour, so allowing minutes would make a 4:15 post look late
  // (it would not go live until 5:00). Minutes are always 0.
  function changeHour(h12: number) {
    setTime((h12 % 12) + (isPm ? 12 : 0), 0);
  }
  function changeMeridiem(pm: boolean) {
    setTime((hour12 % 12) + (pm ? 12 : 0), 0);
  }

  const label = selected
    ? selected.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Pick a date & time";

  const selectClass =
    "border-border bg-warm-white text-soft-black h-8 rounded-md border px-2 text-sm";

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        id={id}
        onClick={toggle}
        className={cn(
          "border-border bg-warm-white inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
          selected ? "text-soft-black" : "text-soft-black-light",
        )}
      >
        <CalendarIcon className="text-soft-black-light size-4" />
        {label}
      </button>

      {open && (
        <div
          className={cn(
            "border-border bg-warm-white absolute left-0 z-50 w-auto rounded-lg border p-3 shadow-md",
            openUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView(new Date(y, m - 1, 1))}
              className="hover:bg-muted text-soft-black-light inline-flex size-7 items-center justify-center rounded-md"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-soft-black text-sm font-semibold">
              {MONTHS[m]} {y}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView(new Date(y, m + 1, 1))}
              className="hover:bg-muted text-soft-black-light inline-flex size-7 items-center justify-center rounded-md"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="text-soft-black-light flex h-7 items-center justify-center text-xs font-medium"
              >
                {w}
              </div>
            ))}
            {cells.map((day, i) =>
              day ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(day)}
                  aria-pressed={selected ? sameDay(day, selected) : false}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-sm transition-colors",
                    selected && sameDay(day, selected)
                      ? "bg-teal text-white"
                      : "text-soft-black hover:bg-muted",
                    !selected &&
                      sameDay(day, today) &&
                      "ring-sage ring-1 ring-inset",
                  )}
                >
                  {day.getDate()}
                </button>
              ) : (
                <div key={i} />
              ),
            )}
          </div>

          <div className="border-border mt-3 flex items-center gap-1.5 border-t pt-3">
            <select
              aria-label="Hour"
              value={hour12}
              onChange={(e) => changeHour(Number(e.target.value))}
              className={selectClass}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="text-soft-black-light text-sm">:00</span>
            <select
              aria-label="AM or PM"
              value={isPm ? "pm" : "am"}
              onChange={(e) => changeMeridiem(e.target.value === "pm")}
              className={selectClass}
            >
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-soft-black-light hover:text-foreground text-sm"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-teal-dark text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>

          <p className="text-soft-black-light mt-2 text-xs">
            Posts go live at the top of the selected hour.
          </p>
        </div>
      )}
    </div>
  );
}
