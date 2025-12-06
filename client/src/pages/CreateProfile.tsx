import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, Link as LinkIcon } from "lucide-react";
import { useLocation } from "wouter";

export default function CreateProfile() {
  const [, setLocation] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock submission
    setTimeout(() => {
      setLocation("/directory");
    }, 500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="space-y-2 text-center md:text-left">
        <h1 className="text-3xl font-display font-bold text-foreground">Create Your Card</h1>
        <p className="text-muted-foreground">Share your profile with the Co:Lab community.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Photo Upload */}
            <div className="flex flex-col items-center md:items-start gap-4">
              <div className="w-24 h-24 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:bg-muted/80 cursor-pointer transition-colors group">
                <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <Label className="text-xs text-muted-foreground">Tap to upload profile photo</Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" placeholder="e.g. Sarah Connor" required className="bg-muted/30" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role / Title</Label>
                <Input id="role" placeholder="e.g. Product Designer" required className="bg-muted/30" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Short Bio</Label>
              <Textarea 
                id="bio" 
                placeholder="Briefly describe what you do and what you're looking for..." 
                className="bg-muted/30 min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Specialty Tags (Separate by comma)</Label>
              <Input placeholder="e.g. Fintech, React, Design, Fundraising" className="bg-muted/30" />
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <Label className="text-base font-semibold">Social Links</Label>
              <div className="grid gap-3">
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9 bg-muted/30" placeholder="LinkedIn URL" />
                </div>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9 bg-muted/30" placeholder="Website / Portfolio" />
                </div>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9 bg-muted/30" placeholder="Instagram / Twitter" />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button type="submit" className="w-full h-12 text-lg rounded-xl font-medium shadow-lg hover:shadow-xl transition-all">
                Create Card & Join
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}
