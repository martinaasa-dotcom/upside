"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LOADING_MESSAGE,
  pickLoadingMessage,
} from "@/lib/loading-messages";

/** One witty line per mount, without SSR/client random drift. */
export function useLoadingMessage(): string {
  const [message, setMessage] = useState(DEFAULT_LOADING_MESSAGE);
  useEffect(() => {
    setMessage(pickLoadingMessage());
  }, []);
  return message;
}
