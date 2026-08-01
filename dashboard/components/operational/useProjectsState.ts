"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createProjectsRepository } from "../../lib/modules/projects/repository";
import type { ProjectsState } from "../../lib/modules/projects/types";

export function useProjectsState(
  initialState: ProjectsState,
  initialError = ""
) {
  const repository = useMemo(() => createProjectsRepository(), []);
  const [state, setState] = useState(initialState);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await repository.readState();
    if (result.ok) {
      setState(result.data);
      setError("");
    } else {
      setError(
        `${result.error.message} The last loaded Projects involvement was preserved.`
      );
    }
    setLoading(false);
  }, [repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return { state, error, loading, refresh };
}
