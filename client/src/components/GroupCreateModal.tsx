import { useState, useCallback } from "react";
import { X, Plus, Check, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/supabase";

// Common emojis for group selection
const EMOJI_OPTIONS = [
  ["😀", "😎", "🤩", "🥳", "🤓", "😊", "🙌", "💪"],
  ["🚀", "💡", "🎯", "🔥", "⭐", "💎", "🏆", "🎉"],
  ["💼", "💰", "📈", "🎨", "💻", "📱", "🌐", "🔧"],
  ["☕", "🍕", "🎮", "📚", "🎵", "🎬", "✈️", "🏠"],
  ["❤️", "💚", "💙", "💜", "🧡", "💛", "🖤", "🤍"],
];

interface GroupCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: Profile[];
  onCreateGroup: (
    emojis: string[],
    name: string | null,
    memberIds: string[]
  ) => Promise<void>;
}

export default function GroupCreateModal({
  isOpen,
  onClose,
  connections,
  onCreateGroup,
}: GroupCreateModalProps) {
  const [step, setStep] = useState<"emojis" | "name" | "members">("emojis");
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleEmojiClick = useCallback((emoji: string) => {
    setSelectedEmojis((prev) => {
      if (prev.includes(emoji)) {
        return prev.filter((e) => e !== emoji);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, emoji];
    });
  }, []);

  const handleMemberToggle = useCallback((memberId: string) => {
    setSelectedMembers((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }, []);

  const handleNext = () => {
    if (step === "emojis" && selectedEmojis.length > 0) {
      setStep("name");
    } else if (step === "name") {
      setStep("members");
    }
  };

  const handleBack = () => {
    if (step === "name") {
      setStep("emojis");
    } else if (step === "members") {
      setStep("name");
    }
  };

  const handleCreate = async () => {
    if (selectedEmojis.length === 0) return;

    setIsCreating(true);
    try {
      await onCreateGroup(
        selectedEmojis,
        groupName.trim() || null,
        selectedMembers
      );
      // Reset state
      setSelectedEmojis([]);
      setGroupName("");
      setSelectedMembers([]);
      setStep("emojis");
      onClose();
    } catch (error) {
      console.error("Error creating group:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSelectedEmojis([]);
    setGroupName("");
    setSelectedMembers([]);
    setStep("emojis");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {step === "emojis" && "Choose Emoji(s)"}
            {step === "name" && "Name Your Group"}
            {step === "members" && "Add Members"}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1: Emoji Selection */}
          {step === "emojis" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Select 1-3 emojis for your group
              </p>

              {/* Selected Emojis Preview */}
              <div className="flex justify-center gap-2 min-h-[60px] items-center">
                {selectedEmojis.length > 0 ? (
                  selectedEmojis.map((emoji, idx) => (
                    <span key={idx} className="text-4xl">
                      {emoji}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground text-sm">
                    No emojis selected
                  </span>
                )}
              </div>

              {/* Emoji Grid */}
              <div className="space-y-2">
                {EMOJI_OPTIONS.map((row, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="grid grid-cols-8 gap-1"
                  >
                    {row.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleEmojiClick(emoji)}
                        className={`text-2xl p-2 rounded-lg transition-all ${
                          selectedEmojis.includes(emoji)
                            ? "bg-primary/20 ring-2 ring-primary"
                            : "hover:bg-muted"
                        } ${
                          selectedEmojis.length >= 3 &&
                          !selectedEmojis.includes(emoji)
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        disabled={
                          selectedEmojis.length >= 3 &&
                          !selectedEmojis.includes(emoji)
                        }
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Name Input */}
          {step === "name" && (
            <div className="space-y-4">
              <div className="flex justify-center gap-2 mb-4">
                {selectedEmojis.map((emoji, idx) => (
                  <span key={idx} className="text-4xl">
                    {emoji}
                  </span>
                ))}
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Give your group a name (optional)
              </p>

              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., Founders Club, Study Buddies..."
                className="text-center"
                maxLength={50}
                autoFocus
              />

              <p className="text-xs text-muted-foreground text-center">
                If left blank, member names will be shown instead
              </p>
            </div>
          )}

          {/* Step 3: Member Selection */}
          {step === "members" && (
            <div className="space-y-4">
              <div className="flex justify-center gap-2 mb-2">
                {selectedEmojis.map((emoji, idx) => (
                  <span key={idx} className="text-2xl">
                    {emoji}
                  </span>
                ))}
                {groupName && (
                  <span className="text-sm font-medium self-center ml-2">
                    {groupName}
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Select connections to invite ({selectedMembers.length} selected)
              </p>

              {connections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No connections yet</p>
                  <p className="text-sm">
                    Connect with others to add them to groups
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {connections.map((connection) => (
                    <button
                      key={connection.id}
                      onClick={() => handleMemberToggle(connection.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                        selectedMembers.includes(connection.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={connection.avatar_url || undefined}
                            alt={connection.name}
                          />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(connection.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <p className="font-medium">{connection.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {connection.role || "Member"}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                          selectedMembers.includes(connection.id)
                            ? "bg-primary text-primary-foreground"
                            : "border-2 border-muted-foreground/30"
                        }`}
                      >
                        {selectedMembers.includes(connection.id) ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2">
          {step !== "emojis" && (
            <Button
              variant="outline"
              onClick={handleBack}
              className="flex-1"
              disabled={isCreating}
            >
              Back
            </Button>
          )}

          {step === "emojis" && (
            <Button
              onClick={handleNext}
              disabled={selectedEmojis.length === 0}
              className="flex-1"
            >
              Next
            </Button>
          )}

          {step === "name" && (
            <Button onClick={handleNext} className="flex-1">
              {groupName.trim() ? "Next" : "Skip"}
            </Button>
          )}

          {step === "members" && (
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                `Create Group${
                  selectedMembers.length > 0
                    ? ` & Invite ${selectedMembers.length}`
                    : ""
                }`
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
