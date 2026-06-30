'use client';

import { useState } from 'react';
import { Loader2, BookOpen } from 'lucide-react';
import { useCourses } from '@/lib/hooks/use-courses';
import { useTextbooks } from '@/lib/hooks/use-textbooks';
import { CourseCard } from './course-card';
import { TextbookCard } from './textbook-card';
import type { Textbook } from '@/lib/types/textbook';

interface TextbookBrowserProps {
  selectedTextbook: Textbook | null;
  onSelectTextbook: (textbook: Textbook | null) => void;
}

export function TextbookBrowser({ selectedTextbook, onSelectTextbook }: TextbookBrowserProps) {
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const { textbooks, loading: textbooksLoading, error: textbooksError } = useTextbooks(expandedCourseId);

  if (coursesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (coursesError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {coursesError}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <BookOpen className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No courses available</p>
      </div>
    );
  }

  function handleToggleCourse(courseId: string) {
    setExpandedCourseId((prev) => (prev === courseId ? null : courseId));
  }

  function handleSelectTextbook(textbook: Textbook) {
    if (selectedTextbook?.textbook_id === textbook.textbook_id) {
      onSelectTextbook(null);
    } else {
      onSelectTextbook(textbook);
    }
  }

  return (
    <div className="space-y-2 overflow-y-auto">
      {courses.map((course) => (
        <CourseCard
          key={course.course_id}
          course={course}
          isExpanded={expandedCourseId === course.course_id}
          onToggle={() => handleToggleCourse(course.course_id)}
        >
          {textbooksLoading && expandedCourseId === course.course_id ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : textbooksError && expandedCourseId === course.course_id ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {textbooksError}
            </div>
          ) : textbooks.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No textbooks in this course</p>
          ) : (
            textbooks.map((textbook) => (
              <TextbookCard
                key={textbook.textbook_id}
                textbook={textbook}
                isSelected={selectedTextbook?.textbook_id === textbook.textbook_id}
                onSelect={handleSelectTextbook}
              />
            ))
          )}
        </CourseCard>
      ))}
    </div>
  );
}
