"use client";

import { useEffect, useState } from "react";

interface DashboardGreetingProps {
  name: string;
}

export default function DashboardGreeting({ name }: DashboardGreetingProps) {
  const [greeting, setGreeting] = useState("Hello");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        {greeting}, {name}!
      </h1>
    </div>
  );
}
