import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Globe, Linkedin, Twitter } from "lucide-react";
import { motion } from "framer-motion";

// Mock Data
const USERS = [
  {
    id: 1,
    name: "Alex Rivera",
    role: "Founder & CEO",
    company: "FinFlow",
    bio: "Building the future of seamless payments for local businesses. Looking for a technical co-founder.",
    image: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Fintech", "Founder", "Sales"],
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
  },
  {
    id: 2,
    name: "Sarah Chen",
    role: "UX Designer",
    company: "Freelance",
    bio: "Product designer with 5 years experience in SaaS. I help startups turn complex problems into simple interfaces.",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Design", "UX/UI", "Web"],
    color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
  },
  {
    id: 3,
    name: "Marcus Johnson",
    role: "Angel Investor",
    company: "Gulf Coast Ventures",
    bio: "Investing in early-stage tech in the Panhandle. Interested in HealthTech and EdTech.",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Investor", "Mentor", "HealthTech"],
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
  },
  {
    id: 4,
    name: "Emily Davis",
    role: "Full Stack Dev",
    company: "Remote",
    bio: "React/Node.js specialist. Love building MVPs and scaling architectures.",
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Developer", "React", "Node.js"],
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
  },
   {
    id: 5,
    name: "David Kim",
    role: "Marketing Lead",
    company: "GrowthLabs",
    bio: "Growth hacker helping startups reach their first 10k users. Expert in SEO and paid acquisition.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200",
    tags: ["Marketing", "Growth", "SEO"],
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
  }
];

export default function Directory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = Array.from(new Set(USERS.flatMap(u => u.tags)));

  const filteredUsers = USERS.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          user.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = selectedTag ? user.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Directory</h1>
          <p className="text-muted-foreground">Discover {USERS.length} members in the community</p>
        </div>
        <div className="flex gap-2">
           {/* Mobile Filter Sheet could go here, keeping it simple for now */}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-4 sticky top-0 bg-background/95 backdrop-blur-md z-30 py-4 -mx-4 px-4 md:static md:p-0 md:bg-transparent">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, role, or skill..." 
            className="pl-10 h-12 rounded-xl bg-card border-border shadow-sm focus:ring-2 focus:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {/* Horizontal Scroll Tags */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <Button 
            variant={selectedTag === null ? "default" : "outline"} 
            size="sm"
            onClick={() => setSelectedTag(null)}
            className="rounded-full"
          >
            All
          </Button>
          {allTags.map(tag => (
            <Button
              key={tag}
              variant={selectedTag === tag ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              className="rounded-full whitespace-nowrap"
            >
              {tag}
            </Button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group relative bg-card rounded-2xl p-5 border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 flex flex-col h-full"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                   <img src={user.image} alt={user.name} className="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-gray-800 shadow-sm" />
                   <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">{user.name}</h3>
                  <p className="text-sm text-primary font-medium">{user.role}</p>
                </div>
              </div>
            </div>
            
            <p className="text-muted-foreground text-sm mb-4 line-clamp-2 flex-grow">{user.bio}</p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {user.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 pointer-events-none">
                  {tag}
                </Badge>
              ))}
            </div>
            
            <div className="pt-4 border-t border-border flex justify-between items-center mt-auto">
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary">
                  <Linkedin className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary">
                  <Twitter className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-primary">
                  <Globe className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" className="rounded-full text-xs h-8 px-4">Connect</Button>
            </div>
          </motion.div>
        ))}
      </div>
      
      {filteredUsers.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p>No members found matching your criteria.</p>
          <Button variant="link" onClick={() => {setSearchTerm(""); setSelectedTag(null);}}>Clear filters</Button>
        </div>
      )}
    </div>
  );
}
