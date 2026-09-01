"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPersonalOpsRepository } from "../../lib/modules/personal-ops/repository";
import type { PersonalOpsFollowUp } from "../../lib/modules/personal-ops/types";

export function usePersonalOpsFollowUps(
  initialFollowUps: PersonalOpsFollowUp[],
  initialError = ""
) {
  const repository = useMemo(() => createPersonalOpsRepository(), []);
  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const refreshSequence = useRef(0);

  useEffect(() => {
    setFollowUps(initialFollowUps);
  }, [initialFollowUps]);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  useEffect(
    () => () => {
      refreshSequence.current += 1;
    },
    []
  );

  const refresh = useCallback(async () => {
    const requestId = refreshSequence.current + 1;
    refreshSequence.current = requestId;
    setLoading(true);
    const result = await repository.list("followUps");
    if (requestId !== refreshSequence.current) return;
    if (result.ok) {
      setFollowUps(result.data);
      setError("");
    } else {
      setError(
        `${result.error.message} The last loaded Personal status was preserved.`
      );
    }
    setLoading(false);
  }, [repository]);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [refresh]);

  return { followUps, error, loading, refresh };
}
