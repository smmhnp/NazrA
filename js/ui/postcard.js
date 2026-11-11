/** Postcard controller with a live preview from the shared engine. */
import { buildTemplateChips, schedulePreview, cardBrandOptions } from "./common.js";
import { truncate, toFaDigits } from "../lib/utils.js";

export function createPostcardUI({ root, config, templates, copy, toast, makeCard, getCurrentText, initialTemplate, onTemplateChange } = {}) {
  const $ = (sel) => root.querySelector(sel);
  const textInput = $("#postcard-text");
  const nameInput = $("#postcard-name");
  const counter = $("#postcard-count");
  const chipsBox = $("#postcard-templates");
  const canvas = $("#postcard-preview");
  const makeButton = $("#postcard-make");

  if (nameInput) nameInput.placeholder = copy.postcardNamePlaceholder;
  let lastTextId = null;

  const options = () => cardBrandOptions(config, {
    type: "postcard",
    text: textInput?.value ?? "",
    name: nameInput?.value ?? "",
    templateId: chips.getSelected()
  });
  const preview = () => schedulePreview(canvas, options);

  const chips = buildTemplateChips(chipsBox, templates, {
    selected: initialTemplate,
    onSelect: (id) => { onTemplateChange?.(id); preview(); }
  });

  function refreshCounter() {
    if (counter && textInput) counter.textContent = `${toFaDigits(textInput.value.length)}/${toFaDigits(300)}`;
  }

  function enter() {
    const current = getCurrentText?.();
    if (current && current.id !== lastTextId) {
      lastTextId = current.id;
      if (textInput) textInput.value = truncate(current.text, 300);
    } else if (textInput && !textInput.value.trim()) {
      textInput.value = truncate(current?.text ?? "", 300);
    }
    refreshCounter();
    preview();
  }

  async function build() {
    const text = (textInput?.value ?? "").trim();
    if (!text) { toast.error(copy.postcardEmptyText); textInput?.focus(); return; }
    await makeCard({
      type: "postcard",
      text,
      name: (nameInput?.value ?? "").trim(),
      templateId: chips.getSelected()
    }, makeButton);
  }

  textInput?.addEventListener("input", () => { refreshCounter(); preview(); });
  nameInput?.addEventListener("input", preview);
  root.addEventListener("click", (event) => {
    if (event.target.closest('[data-ui-action="postcard-make"]')) {
      build().catch(() => toast.error(copy.cardFailed));
    }
  });

  return { enter, leave() {}, get selectedTemplate() { return chips.getSelected(); } };
}
