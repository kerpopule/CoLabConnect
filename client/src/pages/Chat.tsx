import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MoreVertical, Hash } from "lucide-react";

const TOPICS = [
  { id: 'general', name: 'General Lounge', icon: '☕' },
  { id: 'hiring', name: 'Hiring & Jobs', icon: '💼' },
  { id: 'fundraising', name: 'Fundraising', icon: '💸' },
  { id: 'tech', name: 'Tech Talk', icon: '💻' },
  { id: 'events', name: 'Local Events', icon: '📅' },
];

const MOCK_MESSAGES = {
  general: [
    { id: 1, user: "Sarah Chen", time: "10:30 AM", text: "Is anyone grabbing coffee at Bodacious later?", avatar: "S" },
    { id: 2, user: "Alex Rivera", time: "10:32 AM", text: "I'll be there around 11!", avatar: "A" },
  ],
  hiring: [
    { id: 1, user: "Marcus Johnson", time: "Yesterday", text: "Looking for a React Native dev for a 3-month contract.", avatar: "M" },
  ],
  fundraising: [
    { id: 1, user: "Alex Rivera", time: "9:00 AM", text: "Anyone have contacts at Florida Funders?", avatar: "A" },
  ],
  tech: [],
  events: []
};

export default function Chat() {
  const [activeTopic, setActiveTopic] = useState('general');
  const [input, setInput] = useState("");
  // Simple local state for demo purposes - resets on refresh
  const [messages, setMessages] = useState(MOCK_MESSAGES);

  const currentMessages = messages[activeTopic as keyof typeof messages] || [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const newMsg = {
      id: Date.now(),
      user: "You",
      time: "Just now",
      text: input,
      avatar: "Y"
    };

    setMessages(prev => ({
      ...prev,
      [activeTopic]: [...(prev[activeTopic as keyof typeof messages] || []), newMsg]
    }));
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] rounded-3xl overflow-hidden border border-border bg-card shadow-sm">
      
      {/* Topics Header / Scroll */}
      <div className="bg-muted/30 border-b border-border p-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {TOPICS.map(topic => (
            <button
              key={topic.id}
              onClick={() => setActiveTopic(topic.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                activeTopic === topic.id 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "bg-background border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <span>{topic.icon}</span>
              {topic.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            <div className="flex justify-center my-4">
              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                Beginning of #{TOPICS.find(t => t.id === activeTopic)?.name} history
              </span>
            </div>
            
            {currentMessages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.user === 'You' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  msg.user === 'You' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                }`}>
                  {msg.avatar}
                </div>
                <div className={`max-w-[75%] space-y-1`}>
                  <div className={`flex items-baseline gap-2 ${msg.user === 'You' ? 'justify-end' : ''}`}>
                    <span className="text-xs font-bold text-foreground">{msg.user}</span>
                    <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                  </div>
                  <div className={`p-3 rounded-2xl text-sm ${
                    msg.user === 'You' 
                      ? 'bg-primary/10 text-foreground rounded-tr-none border border-primary/20' 
                      : 'bg-muted text-foreground rounded-tl-none border border-border'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-3 md:p-4 bg-card border-t border-border">
          <form onSubmit={handleSend} className="flex gap-2 relative">
            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground shrink-0 rounded-full">
               <Hash className="h-5 w-5" />
            </Button>
            <Input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message #${TOPICS.find(t => t.id === activeTopic)?.name}...`}
              className="rounded-full bg-muted/50 border-transparent focus:bg-background transition-all pr-12"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="absolute right-1 top-1 h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-transform hover:scale-105"
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
