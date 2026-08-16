"use client";

import { useAuth } from "@/components/AuthProvider";
import { FeedbackModal, type FeedbackMode } from "@/components/FeedbackModal";
import {
  isWeeklyFeedbackDue,
  markFeedbackSubmitted,
  snoozeFeedbackSchedule,
  touchFeedbackSchedule,
  type FeedbackSchedule,
} from "@/lib/feedback";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FeedbackApi = {
  openManual: () => void;
  close: () => void;
  mode: FeedbackMode | null;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  return (
    useContext(FeedbackContext) ?? {
      openManual: () => undefined,
      close: () => undefined,
      mode: null,
    }
  );
}

export function FeedbackHost({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const [mode, setMode] = useState<FeedbackMode | null>(null);
  const scheduleRef = useRef<FeedbackSchedule | null>(null);

  const close = useCallback(() => {
    setMode((current) => {
      if (current === "weekly" && scheduleRef.current) {
        scheduleRef.current = snoozeFeedbackSchedule(scheduleRef.current);
      }
      return null;
    });
  }, []);

  const openManual = useCallback(() => {
    setMode("manual");
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    const created =
      user.created_at && user.created_at.length > 0 ? user.created_at : null;
    const schedule = touchFeedbackSchedule(created);
    scheduleRef.current = schedule;
    if (!isWeeklyFeedbackDue(schedule)) return;

    const wait = window.setTimeout(() => {
      setMode((current) => (current ? current : "weekly"));
    }, 1600);
    return () => window.clearTimeout(wait);
  }, [ready, user]);

  const onSent = useCallback(() => {
    if (scheduleRef.current) {
      scheduleRef.current = markFeedbackSubmitted(scheduleRef.current);
    }
  }, []);

  const api = useMemo(
    () => ({ openManual, close, mode }),
    [openManual, close, mode]
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {mode && (
        <FeedbackModal mode={mode} onClose={close} onSent={onSent} />
      )}
    </FeedbackContext.Provider>
  );
}
