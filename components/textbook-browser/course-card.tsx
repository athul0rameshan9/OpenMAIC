'use client';

import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Course } from '@/lib/types/textbook';

interface CourseCardProps {
  course: Course;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function CourseCard({ course, isExpanded, onToggle, children }: CourseCardProps) {
  return (
    <div className="space-y-2">
      <Card
        className="cursor-pointer transition-colors hover:bg-accent/50"
        onClick={onToggle}
      >
        <CardHeader className="flex flex-row items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">{course.course_name}</CardTitle>
              {course.description && (
                <CardDescription className="mt-0.5 text-xs line-clamp-1">
                  {course.description}
                </CardDescription>
              )}
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CardHeader>
      </Card>
      {isExpanded && <div className="ml-4 space-y-2">{children}</div>}
    </div>
  );
}
