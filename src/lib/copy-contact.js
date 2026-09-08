const restoreFocus = (element) => {
  if (typeof element?.focus !== "function") return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
};

const copyWithSelection = (text, environment) => {
  const document = environment?.document;
  if (
    !document?.body
    || typeof document.createElement !== "function"
    || typeof document.execCommand !== "function"
  ) return false;

  const activeElement = document.activeElement;
  const selection = typeof environment.getSelection === "function"
    ? environment.getSelection()
    : document.getSelection?.();
  const savedRanges = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      savedRanges.push(selection.getRangeAt(index).cloneRange());
    }
  }

  const temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.setAttribute("readonly", "");
  temporary.setAttribute("aria-hidden", "true");
  temporary.style.position = "fixed";
  temporary.style.inset = "0 auto auto -9999px";
  temporary.style.opacity = "0";

  try {
    document.body.appendChild(temporary);
    temporary.focus();
    temporary.select();
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    temporary.remove();
    if (selection) {
      selection.removeAllRanges();
      savedRanges.forEach((range) => selection.addRange(range));
    }
    restoreFocus(activeElement);
  }
};

export async function copyContact(text, environment = globalThis) {
  const value = String(text);
  const writeText = environment?.navigator?.clipboard?.writeText;
  if (typeof writeText === "function") {
    try {
      await writeText.call(environment.navigator.clipboard, value);
      return true;
    } catch {
      // Fall through to the selection-based path when Clipboard permission is denied.
    }
  }

  return copyWithSelection(value, environment);
}
