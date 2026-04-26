"use client";

import { useState } from "react";

export default function CopyHex({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={`group relative cursor-pointer transition-opacity hover:opacity-80 ${className}`}
      title={`Copy ${value}`}
    >
      <span className={copied ? "opacity-0" : "opacity-100"}>{value}</span>
      <span
        className={`absolute inset-0 flex items-center transition-opacity ${
          copied ? "opacity-100" : "opacity-0"
        }`}
      >
        Copied
      </span>
    </button>
  );
}
