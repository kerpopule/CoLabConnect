import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, ScanLine, Users, ArrowUpRight } from "lucide-react";
import generatedImage from '@assets/generated_images/abstract_modern_community_connection_graphic.png';

export default function Home() {
  return (
    <div className="space-y-8 pb-24 md:pb-8">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-muted/30 border border-white/20 dark:border-white/5 p-6 md:p-12 text-center md:text-left">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 space-y-4">
            <div className="inline-block px-3 py-1 rounded-full bg-white/50 dark:bg-black/20 backdrop-blur-md text-primary text-xs font-bold uppercase tracking-wider border border-white/50 dark:border-white/10 shadow-sm">
              Co:Lab Pensacola
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight text-foreground">
              Where Ideas <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Connect</span>.
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto md:mx-0">
              The digital hub for Pensacola's entrepreneurs, creators, and investors.
            </p>
          </div>
          <div className="flex-1 w-full max-w-xs md:max-w-md">
            <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500 border-4 border-white dark:border-gray-800">
               <img src={generatedImage} alt="Community Connection" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Main Actions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/create-card">
          <div className="group cursor-pointer relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="relative z-10 flex flex-col h-full justify-between min-h-[160px]">
              <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <ScanLine className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-display font-bold mb-1">Join the Community</h3>
                <p className="text-primary-foreground/80 text-sm">Create your account & connect</p>
              </div>
              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1">
                <ArrowRight className="h-6 w-6" />
              </div>
            </div>
            {/* Decoration */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
          </div>
        </Link>

        <Link href="/directory">
          <div className="group cursor-pointer relative overflow-hidden rounded-2xl p-6 bg-card border border-border hover:border-primary/50 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
             <div className="relative z-10 flex flex-col h-full justify-between min-h-[160px]">
              <div className="bg-secondary w-12 h-12 rounded-xl flex items-center justify-center">
                <Users className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div>
                <h3 className="text-2xl font-display font-bold mb-1 text-foreground">Browse People</h3>
                <p className="text-muted-foreground text-sm">Find founders, investors & talent</p>
              </div>
              <div className="absolute top-6 right-6 text-muted-foreground group-hover:text-primary transition-colors">
                <ArrowRight className="h-6 w-6" />
              </div>
            </div>
          </div>
        </Link>
      </section>

      {/* Trending Topics Preview */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold">Trending Topics</h2>
          <Link href="/chat">
            <span className="text-sm font-medium text-primary flex items-center hover:underline cursor-pointer">
              View all <ArrowUpRight className="ml-1 h-3 w-3" />
            </span>
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
          {["Startup Funding", "Tech Hiring", "Events", "Pensacola Beach"].map((topic, i) => (
            <Link key={i} href="/chat">
              <div className="whitespace-nowrap px-4 py-2 rounded-full bg-muted border border-transparent hover:border-primary/20 hover:bg-white dark:hover:bg-gray-800 transition-colors cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                # {topic}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
