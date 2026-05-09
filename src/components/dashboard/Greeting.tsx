"use client";

import { useEffect, useState } from "react";

interface GreetingProps {
  firstName: string;
}

/**
 * Time-of-day-aware greeting that replaces a static "Welcome back, name."
 * Computed on the client so it reflects the user's local time, not the
 * server's. Defaults to "Welcome back" until the client mounts to avoid
 * any flicker between server and client renders.
 */
export function Greeting({ firstName }: GreetingProps) {
  const [salutation, setSalutation] = useState("Welcome back");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) setSalutation("Good morning");
    else if (hour >= 12 && hour < 17) setSalutation("Good afternoon");
    else if (hour >= 17 && hour < 22) setSalutation("Good evening");
    else setSalutation("Hi");
  }, []);

  return (
    <p className="text-muted-foreground mt-1 text-sm">
      {salutation}, {firstName}
    </p>
  );
}
