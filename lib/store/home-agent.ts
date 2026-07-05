/**
 * Home Agent Store
 * Manages state for the home page chat agent and calendar integration
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HomeAgentState {
  /** Whether the chat panel is open */
  isOpen: boolean;
  /** Whether Google Calendar is connected */
  calendarConnected: boolean;
  /** Currently selected course filter */
  selectedCourseId: string | null;
  /** Chat session history IDs */
  sessionIds: string[];
  /** Whether the calendar widget is visible */
  showCalendar: boolean;

  // Actions
  toggleChat: () => void;
  setOpen: (open: boolean) => void;
  setCalendarConnected: (connected: boolean) => void;
  setSelectedCourse: (courseId: string | null) => void;
  addSession: (sessionId: string) => void;
  toggleCalendarWidget: () => void;
  setShowCalendar: (show: boolean) => void;
}

export const useHomeAgentStore = create<HomeAgentState>()(
  persist(
    (set) => ({
      isOpen: false,
      calendarConnected: false,
      selectedCourseId: null,
      sessionIds: [],
      showCalendar: false,

      toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
      setOpen: (open) => set({ isOpen: open }),
      setCalendarConnected: (connected) => set({ calendarConnected: connected }),
      setSelectedCourse: (courseId) => set({ selectedCourseId: courseId }),
      addSession: (sessionId) =>
        set((state) => ({ sessionIds: [...state.sessionIds, sessionId] })),
      toggleCalendarWidget: () => set((state) => ({ showCalendar: !state.showCalendar })),
      setShowCalendar: (show) => set({ showCalendar: show }),
    }),
    {
      name: 'home-agent-storage',
      partialize: (state) => ({
        calendarConnected: state.calendarConnected,
        sessionIds: state.sessionIds,
        showCalendar: state.showCalendar,
      }),
    },
  ),
);
