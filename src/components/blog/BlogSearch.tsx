"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function BlogSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/blog?q=${encodeURIComponent(q)}` : "/blog");
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative max-w-md">
      <Search className="text-soft-black-light pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search the blog"
        aria-label="Search the blog"
        className="pl-9"
      />
    </form>
  );
}
