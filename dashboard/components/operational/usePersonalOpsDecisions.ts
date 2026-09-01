"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPersonalOpsRepository } from "../../lib/modules/personal-ops/repository";
import type { PersonalOpsDecision } from "../../lib/modules/personal-ops/types";

export function usePersonalOpsDecisions(
  initialDecisions: PersonalOpsDecision[],
  initialError = ""
) {
  const repository = useMemo(() => createPersonalOpsRepository(), []);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await repository.list("decisions");
    if (result.ok) {
      setDecisions(result.data);
      setError("");
    } else {
      setError(
        `${result.error.message} The last loaded Personal Decision status was preserved.`
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

  return { decisions, error, loading, refresh };
}
