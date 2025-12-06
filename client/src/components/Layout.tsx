import { Link, useLocation } from "wouter";
import { Home, Users, MessageCircle, Sparkles, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AIHelper } from "./AIHelper";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check system preference initially
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/directory", icon: Users, label: "Directory" },
    { href: "/chat", icon: MessageCircle, label: "Chat" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0 font-sans">
      {/* Mobile Top Bar for Theme Toggle */}
      <header className="md:hidden flex justify-end p-4 fixed top-0 right-0 z-50">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-background/50 backdrop-blur-md border border-border shadow-sm"
          onClick={toggleTheme}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </header>

      {/* Desktop Sidebar / Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-lg border-t border-border md:top-0 md:bottom-auto md:w-64 md:h-screen md:border-r md:border-t-0 md:flex md:flex-col md:p-6">
        <div className="hidden md:flex items-center justify-between mb-8">
          <h1 className="text-2xl font-display font-bold text-primary">Co:Lab</h1>
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        <ul className="flex justify-around items-center h-16 md:h-auto md:flex-col md:space-y-2 md:items-stretch">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.href} className="flex-1 md:flex-none">
                <Link href={item.href}>
                  <div className={`flex flex-col md:flex-row items-center justify-center md:justify-start md:px-4 md:py-3 rounded-xl transition-all duration-200 cursor-pointer ${isActive ? "text-primary font-medium bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    <item.icon className={`h-6 w-6 md:mr-3 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`} />
                    <span className="text-[10px] md:text-sm mt-1 md:mt-0">{item.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
          {/* Mobile AI Button in Nav */}
          <li className="flex-1 md:hidden flex justify-center">
            <AIHelper />
          </li>
        </ul>

        {/* Desktop AI Button */}
        <div className="hidden md:block mt-auto">
          <AIHelper mode="desktop" />
        </div>
      </nav>

      <main className="flex-1 md:pl-64 p-4 md:p-8 max-w-5xl mx-auto w-full animate-in fade-in duration-500">
        {children}
      </main>
    </div>
  );
}
