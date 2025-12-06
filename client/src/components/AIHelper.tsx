import { useState } from "react";
import { Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AIHelper({ mode = "mobile" }: { mode?: "mobile" | "desktop" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: "Hi! I'm your Co:Lab guide. Ask me anything like 'Who works in fintech?' or 'How do I book a meeting room?'" }
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { role: 'user', text: input }]);
    
    // Mock AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: "I'm a demo AI, but in the real app I'd search the directory and community knowledge base to answer that! Try browsing the directory for now." 
      }]);
    }, 1000);
    
    setInput("");
  };

  const TriggerButton = () => (
    <Button 
      size="icon" 
      className={`rounded-full shadow-lg bg-gradient-to-tr from-primary to-accent hover:shadow-xl hover:scale-105 transition-all duration-300 ${mode === "desktop" ? "w-full h-12 rounded-xl flex items-center justify-start px-4" : "h-12 w-12"}`}
    >
      <Sparkles className={`text-white ${mode === "desktop" ? "mr-2 h-5 w-5" : "h-6 w-6"}`} />
      {mode === "desktop" && <span className="text-white font-medium">Ask AI Assistant</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <div><TriggerButton /></div>
      </SheetTrigger>
      <SheetContent side="right" className="w-[90%] sm:w-[400px] border-l border-border bg-card/95 backdrop-blur-xl p-0 flex flex-col z-[100]">
        <SheetHeader className="p-6 border-b border-border bg-muted/30">
          <SheetTitle className="flex items-center text-primary font-display">
            <Sparkles className="w-5 h-5 mr-2" />
            Co:Lab AI Guide
          </SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-br-none' 
                      : 'bg-muted text-foreground rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t border-border bg-background/50">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex gap-2"
            >
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                className="rounded-full bg-muted/50 border-transparent focus:bg-background transition-all"
              />
              <Button type="submit" size="icon" className="rounded-full shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
