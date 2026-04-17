import { Star, Shield, Award, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LandlordBadgesProps {
  averageRating: number;
  reviewCount: number;
  memberSinceMs: number;
  className?: string;
}

interface BadgeConfig {
  id: string;
  label: string;
  tooltip: string;
  icon: React.ReactNode;
  color: string;
  earned: boolean;
}

export function LandlordBadges({
  averageRating,
  reviewCount,
  memberSinceMs,
  className,
}: LandlordBadgesProps) {
  const ageMs = Date.now() - memberSinceMs;
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);

  const badges: BadgeConfig[] = [
    {
      id: "top_rated",
      label: "Top Rated",
      tooltip: "Average rating ≥ 4.5 with at least 5 reviews",
      icon: <Star className="h-3 w-3" />,
      color: "bg-amber-100 text-amber-700 border-amber-200",
      earned: averageRating >= 4.5 && reviewCount >= 5,
    },
    {
      id: "five_star",
      label: "5-Star Host",
      tooltip: "Perfect 5.0 average rating with at least 3 reviews",
      icon: <Award className="h-3 w-3" />,
      color: "bg-yellow-100 text-yellow-700 border-yellow-200",
      earned: averageRating === 5.0 && reviewCount >= 3,
    },
    {
      id: "trusted",
      label: "Trusted Host",
      tooltip: "Member for at least 6 months with reviews",
      icon: <Shield className="h-3 w-3" />,
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      earned: ageMonths >= 6 && reviewCount >= 1,
    },
    {
      id: "established",
      label: "Established",
      tooltip: "FurnishFinder member for over 1 year",
      icon: <Clock className="h-3 w-3" />,
      color: "bg-blue-100 text-blue-700 border-blue-200",
      earned: ageMonths >= 12,
    },
  ];

  const earnedBadges = badges.filter((b) => b.earned);
  if (earnedBadges.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {earnedBadges.map((badge) => (
          <Tooltip key={badge.id}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold cursor-default",
                  badge.color
                )}
              >
                {badge.icon}
                {badge.label}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[180px]">{badge.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
