"use client";

import { createContext } from "react";

// Details stay mounted while the overview is visible, preserving editor drafts.
export const WorkspacePageContext = createContext(false);
