"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import UnigentamosIcon from "../icons/UnigentamosIcon";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & {
  children?: ReactNode;
};

/** The shell owns focus. Callers retain search behavior, labels and input refs. */
const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField(
  { className, children, placeholder = "Search", ...input }, ref
) {
  return <span className={`app-search-field ${className || ""}`} data-field-shell>
    <UnigentamosIcon role="search" size={18} />
    <input {...input} ref={ref} type="search" placeholder={placeholder} />
    {children}
  </span>;
});

export default SearchField;
