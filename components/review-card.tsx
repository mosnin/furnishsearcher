"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/star-rating";
import { cn } from "@/lib/utils";

interface ReviewCardProps {
  rating: number;
  comment: string;
  reviewerName: string;
  reviewerAvatar?: string | null;
  createdAt: number;
  listingTitle?: string;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatReviewDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function ReviewCard({
  rating,
  comment,
  reviewerName,
  reviewerAvatar,
  createdAt,
  listingTitle,
  className,
}: ReviewCardProps) {
  const initials = getInitials(reviewerName);

  return (
    <Card className={cn("border-border", className)}>
      <CardContent className="p-5 flex flex-col gap-3">
        {/* Header: avatar + name + date */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-9 w-9 shrink-0">
              {reviewerAvatar && (
                <AvatarImage src={reviewerAvatar} alt={reviewerName} />
              )}
              <AvatarFallback className="text-xs font-semibold bg-muted text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="font-semibold text-sm text-foreground truncate">
              {reviewerName}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatReviewDate(createdAt)}
          </span>
        </div>

        {/* Star rating */}
        <StarRating rating={rating} size="sm" showNumeric={false} />

        {/* Comment */}
        <p className="text-sm text-muted-foreground leading-relaxed">{comment}</p>

        {/* Optional listing badge */}
        {listingTitle && (
          <Badge variant="secondary" className="self-start text-xs font-normal truncate max-w-full">
            {listingTitle}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
