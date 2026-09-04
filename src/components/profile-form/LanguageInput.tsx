"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { normalizeLanguage } from "@/lib/profile/language";

const COMMON_LANGUAGES = [
  "Spanish",
  "Mandarin",
  "Cantonese",
  "Tagalog",
  "Korean",
  "Hindi",
  "Russian",
  "Arabic",
  "Haitian Creole",
  "Italian",
  "Polish",
  "Portuguese",
  "French",
  "Urdu",
  "Bengali",
];

interface LanguageInputProps {
  value: string[];
  onChange: (languages: string[]) => void;
  error?: string;
}

export function LanguageInput({ value, onChange, error }: LanguageInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLanguage = (lang: string) => {
    const trimmed = lang.trim();
    if (!trimmed) return;

    // Title cased through the same helper the profile schema uses, so what a
    // nurse sees here is what gets stored (#934).
    const normalized = normalizeLanguage(trimmed);
    if (!normalized) return;

    if (!value.includes(normalized)) {
      onChange([...value, normalized]);
    }
    setInputValue("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeLanguage = (lang: string) => {
    // Don't allow removing English (it's required)
    if (lang === "English") return;
    onChange(value.filter((l) => l !== lang));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addLanguage(inputValue);
    }
  };

  const suggestions = COMMON_LANGUAGES.filter(
    (lang) =>
      !value.includes(lang) &&
      lang.toLowerCase().includes(inputValue.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {/* Selected languages */}
      <div className="flex flex-wrap gap-1.5">
        {value.map((lang) => (
          <Badge
            key={lang}
            variant="secondary"
            className="gap-1 px-2 py-0.5 text-sm"
          >
            {lang}
            {lang !== "English" && (
              <button
                type="button"
                onClick={() => removeLanguage(lang)}
                className="hover:bg-foreground/10 ml-0.5 rounded-full p-0.5"
              >
                <X className="size-3" />
                <span className="sr-only">Remove {lang}</span>
              </button>
            )}
          </Badge>
        ))}
      </div>

      {/* Input with suggestions */}
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay to allow click on suggestion
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a language and press Enter"
          aria-invalid={error ? true : undefined}
        />

        {showSuggestions && inputValue.length > 0 && suggestions.length > 0 && (
          <div className="border-input bg-popover absolute z-10 mt-1 w-full rounded-lg border shadow-md">
            {suggestions.slice(0, 5).map((lang) => (
              <Button
                key={lang}
                type="button"
                variant="ghost"
                className="w-full justify-start rounded-none px-3 py-1.5 text-sm font-normal first:rounded-t-lg last:rounded-b-lg"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addLanguage(lang);
                }}
              >
                {lang}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Quick add for common languages. Gated on an empty input (not
          focus) so adding one via click keeps the rest visible; the typed
          suggestions dropdown only appears once there's input text. */}
      {inputValue.length === 0 && (
        <div className="flex flex-wrap gap-1">
          {COMMON_LANGUAGES.filter((lang) => !value.includes(lang))
            .slice(0, 6)
            .map((lang) => (
              <Button
                key={lang}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => addLanguage(lang)}
              >
                + {lang}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
