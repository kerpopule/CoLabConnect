import { usePresence } from "@/hooks/usePresence";
import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  userId: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function OnlineIndicator({ userId, className, size = "md" }: OnlineIndicatorProps) {
  const { isUserOnline } = usePresence();

  if (!isUserOnline(userId)) {
    return null;
  }

  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <div
      className={cn(
        "bg-green-500 rounded-full border-2 border-white dark:border-gray-800",
        sizeClasses[size],
        className
      )}
      title="Online"
    />
  );
}
