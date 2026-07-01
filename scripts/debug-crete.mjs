import { resolveImage } from "../api/images/resolveImage.js";

const result = await resolveImage({
  kind: "hero",
  label: "Crete",
  context: "Greece",
  uiLang: "fr",
});

if (result == null) {
  console.log("null");
} else {
  console.log(JSON.stringify(result, null, 2));
}
