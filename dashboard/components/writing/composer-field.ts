import type { WritingPreferences } from "../../lib/writing/preferences";

export type WritingField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
export type Completion = { kind: "object" | "skill"; start: number; end: number; query: string };

const nativeField = (field: HTMLElement): field is HTMLInputElement | HTMLTextAreaElement =>
  field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;

export function writingField(element: EventTarget | null): WritingField | null {
  if (!(element instanceof HTMLElement)) return null;
  const field = element.closest<HTMLElement>("textarea, input, [contenteditable]");
  if (!field || field.matches(":disabled, [readonly], [aria-readonly=true]") ||
      field.closest('[data-writing-field="off"], [data-writing-field="false"], [data-writing-settings], [data-credential-editor], .shared-ai-dock, [inert]') ||
      location.pathname === "/admin/login" || location.pathname.startsWith("/admin/personal/passwords")) return null;
  if (nativeField(field)) {
    if (field instanceof HTMLInputElement && (field.type !== "text" || !field.hasAttribute("data-writing-field"))) return null;
    if (field.closest("form")?.querySelector('input[type="password"]')) return null;
    const labeling = Array.from(field.labels || [], label => {
      // Exclude the input value and the sibling picker from its own label.
      return Array.from(label.childNodes, node => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
        return node instanceof HTMLElement && !node.contains(field) && !node.matches("input,textarea,select,button") ? node.textContent || "" : "";
      }).join(" ");
    }).join(" ");
    const identity = [field.name, field.id, field.autocomplete, field.placeholder, field.getAttribute("aria-label"), labeling].join(" ");
    if (/password|passphrase|secret|private.?key|recovery file|credential|field definitions|\b(?:CSV|JSON|OTP|code|guests?|recipient|search)\b/i.test(identity)) return null;
    if (/\bpin\b/i.test(identity) && !/\bpin \d+ note\b/i.test(identity)) return null;
    return field;
  }
  return field.isContentEditable &&
    (field.contentEditable === "plaintext-only" || field.hasAttribute("data-writing-field")) ? field : null;
}

export function fieldValue(field: WritingField) {
  return nativeField(field) ? field.value : field.innerText;
}

export function fieldSelection(field: WritingField) {
  if (nativeField(field)) {
    if (field.selectionStart === null || field.selectionStart !== field.selectionEnd) return null;
    return { text: field.value, caret: field.selectionStart, node: null };
  }
  const selection = field.ownerDocument.getSelection();
  const node = selection?.anchorNode;
  if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !field.contains(node)) return null;
  return { text: node.textContent || "", caret: selection.anchorOffset, node };
}

export function findCompletion(text: string, caret: number, preferences: WritingPreferences): Completion | null {
  const before = text.slice(Math.max(0, caret - 120), caret);
  const markers = [
    { kind: "object", trigger: preferences.objectTrigger, enabled: preferences.objectSuggestions },
    { kind: "skill", trigger: preferences.skillTrigger, enabled: preferences.skillSuggestions },
  ] as const;
  let match: Completion | null = null;
  for (const { kind, trigger, enabled } of markers) {
    if (!enabled || !trigger) continue;
    const offset = before.lastIndexOf(trigger);
    if (offset === -1) continue;
    const start = caret - before.length + offset;
    if (start > 0 && /[\p{L}\p{N}_@#/\\]/u.test(text[start - 1])) continue;
    const query = before.slice(offset + trigger.length);
    if (query.length > 80 || /^[ \t]|[\r\n\t]| {2}/.test(query)) continue;
    if (!match || start > match.start) match = { kind, start, end: caret, query };
  }
  return match;
}

export function replaceCompletion(field: WritingField, match: Completion, value: string) {
  const selection = fieldSelection(field);
  if (!selection || selection.caret !== match.end) return false;
  const insertion = value.trimEnd() + " ";
  const end = match.end + (selection.text[match.end] === " " ? 1 : 0);
  if (nativeField(field)) {
    const next = field.value.slice(0, match.start) + insertion + field.value.slice(end);
    if (field.maxLength >= 0 && next.length > field.maxLength) return false;
    field.setSelectionRange(match.start, end);
    // Use a native edit so Undo and the editor's existing onChange both work.
    if (document.execCommand("insertText", false, insertion)) return true;
    // Some plain-text controls lack insertText. Bypass React's value tracker
    // before dispatching the replacement through its normal onChange path.
    const prototype = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, next);
    field.setSelectionRange(match.start + insertion.length, match.start + insertion.length);
  } else {
    const node = selection.node as Text;
    const range = document.createRange();
    range.setStart(node, match.start);
    range.setEnd(node, end);
    const selected = field.ownerDocument.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    if (document.execCommand("insertText", false, insertion)) return true;
    node.replaceData(match.start, end - match.start, insertion);
    field.ownerDocument.getSelection()?.collapse(node, match.start + insertion.length);
  }
  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: insertion }));
  return true;
}

/** Anchor long textareas at the active line, including when the field is scrolled. */
export function caretRect(field: WritingField): DOMRect {
  const bounds = field.getBoundingClientRect();
  if (!nativeField(field)) {
    const range = field.ownerDocument.getSelection();
    return range?.rangeCount ? range.getRangeAt(0).getBoundingClientRect() : bounds;
  }
  if (field instanceof HTMLInputElement) return bounds;
  const mirror = document.createElement("div");
  const style = getComputedStyle(field);
  for (const property of ["font", "line-height", "letter-spacing", "word-spacing", "white-space", "overflow-wrap", "word-break", "text-transform", "text-indent", "tab-size", "padding", "border", "box-sizing", "direction", "text-align"]) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  const width = field.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  Object.assign(mirror.style, { position: "fixed", visibility: "hidden", pointerEvents: "none", boxSizing: "border-box",
    top: bounds.top + "px", left: bounds.left + "px", width: width + "px" });
  mirror.textContent = field.value.slice(0, field.selectionStart);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const rect = marker.getBoundingClientRect();
  mirror.remove();
  const lineHeight = rect.height || parseFloat(style.lineHeight) || 18;
  return new DOMRect(Math.max(bounds.left, Math.min(rect.left - field.scrollLeft, bounds.right)),
    Math.max(bounds.top, Math.min(rect.top - field.scrollTop, bounds.bottom - lineHeight)), 0, lineHeight);
}
