"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createNoteLinksRepository } from "../../lib/modules/notes/links-repository";
import type {
  NoteLinkCreateInput,
  NoteLinkMutationPayload,
  NoteLinkPatch,
  NoteLinksState
} from "../../lib/modules/notes/links-types";
import type { MutationResult } from "../../lib/native-objects/mutation-result";

export function useNoteLinksState(initialState: NoteLinksState, initialError = "") {
  const repository = useMemo(() => createNoteLinksRepository(), []);
  const [state, setState] = useState(initialState);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => setState(initialState), [initialState]);
  useEffect(() => setError(initialError), [initialError]);
  useEffect(() => () => { requestSequence.current += 1; }, []);

  const refresh = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    const result = await repository.readState();
    if (requestId !== requestSequence.current) return;
    if (result.ok) {
      setState(result.data);
      setError("");
    } else {
      setError(`${result.error.message} The last loaded NoteLink state was preserved.`);
    }
    setLoading(false);
  }, [repository]);

  const create = useCallback(async (
    input: NoteLinkCreateInput
  ): Promise<MutationResult<NoteLinkMutationPayload>> => {
    const result = await repository.create(input);
    if (result.ok) {
      setState(result.data.state);
      setError("");
    }
    return result;
  }, [repository]);

  const patch = useCallback(async (
    id: string,
    expectedUpdatedAt: string,
    change: NoteLinkPatch
  ): Promise<MutationResult<NoteLinkMutationPayload>> => {
    const result = await repository.patch(id, expectedUpdatedAt, change);
    if (result.ok) {
      setState(result.data.state);
      setError("");
    }
    return result;
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

  return { state, error, loading, refresh, create, patch };
}
